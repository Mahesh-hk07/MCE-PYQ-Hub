from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse, unquote
from email.parser import BytesParser
from email.policy import default
from http.cookies import SimpleCookie
import json
import re
import secrets
import sqlite3
import os
import io
import time
import socket
from datetime import datetime

import admin_auth

ROOT = Path(__file__).parent
DATABASE_DIR = ROOT / "databases"
SUBMISSIONS_DB = DATABASE_DIR / "submissions.db"
REQUESTS_DB = DATABASE_DIR / "requests.db"
PENDING_DIR = ROOT / "papers" / "pending"
BRANCHES = ("CSE", "CSE(AI&ML)", "CSBS", "ECE", "EEE", "Mechanical", "Civil", "First Year")


def normalize_branch(branch: str) -> str:
    """Normalize department branch string to canonical form."""
    if not branch:
        return ""
    b = str(branch).strip().lower()
    mapping = {
        "ece": "ECE",
        "cse": "CSE",
        "cse(ai&ml)": "CSE(AI&ML)",
        "cse(aiml)": "CSE(AI&ML)",
        "cse (ai & ml)": "CSE(AI&ML)",
        "cse (ai&ml)": "CSE(AI&ML)",
        "ai & ml": "CSE(AI&ML)",
        "ai&ml": "CSE(AI&ML)",
        "aiml": "CSE(AI&ML)",
        "mechanical": "Mechanical",
        "mech": "Mechanical",
        "civil": "Civil",
        "first year": "First Year",
        "firstyear": "First Year",
        "first_year": "First Year",
        "1st year": "First Year",
        "csbs": "CSBS",
        "eee": "EEE",
    }
    return mapping.get(b, str(branch).strip())


def branches_match(b1: str, b2: str) -> bool:
    """Check if two branch strings refer to the same department."""
    if not b1 or not b2:
        return False
    return normalize_branch(b1).lower() == normalize_branch(b2).lower()


# Active admin sessions: session_token -> user_dict
ADMIN_SESSIONS = {}

# ============================================================
# CLOUDFLARE R2 CLOUD STORAGE ABSTRACTION
# ============================================================
def get_r2_config():
    return {
        "endpoint_url": os.environ.get("R2_ENDPOINT_URL", "").strip(),
        "access_key_id": os.environ.get("R2_ACCESS_KEY_ID", "").strip(),
        "secret_access_key": os.environ.get("R2_SECRET_ACCESS_KEY", "").strip(),
        "bucket_name": os.environ.get("R2_BUCKET_NAME", "").strip(),
        "public_base_url": os.environ.get("R2_PUBLIC_BASE_URL", "").strip(),
    }


def is_r2_configured():
    cfg = get_r2_config()
    return bool(cfg["endpoint_url"] and cfg["access_key_id"] and cfg["secret_access_key"] and cfg["bucket_name"])


def is_production():
    return os.environ.get("RENDER") in ("true", "1") or os.environ.get("ENVIRONMENT", "").lower() == "production"


_s3_client = None


def get_r2_client():
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    if not is_r2_configured():
        return None
    try:
        import boto3
        from botocore.config import Config
        cfg = get_r2_config()
        _s3_client = boto3.client(
            "s3",
            endpoint_url=cfg["endpoint_url"],
            aws_access_key_id=cfg["access_key_id"],
            aws_secret_access_key=cfg["secret_access_key"],
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"})
        )
        return _s3_client
    except Exception as e:
        print(f"[R2 CLIENT ERROR] Failed to initialize R2 client: {type(e).__name__}")
        return None


def r2_upload_pdf(data: bytes, object_key: str) -> bool:
    client = get_r2_client()
    if not client:
        raise RuntimeError("Cloudflare R2 storage client is unavailable")
    cfg = get_r2_config()
    client.put_object(
        Bucket=cfg["bucket_name"],
        Key=object_key,
        Body=data,
        ContentType="application/pdf"
    )
    return True


def r2_exists(object_key: str) -> bool:
    client = get_r2_client()
    if not client:
        return False
    cfg = get_r2_config()
    try:
        client.head_object(Bucket=cfg["bucket_name"], Key=object_key)
        return True
    except Exception:
        return False


def r2_delete_pdf(object_key: str) -> bool:
    if not object_key:
        return False
    client = get_r2_client()
    if not client:
        return False
    cfg = get_r2_config()
    try:
        client.delete_object(Bucket=cfg["bucket_name"], Key=object_key)
        return True
    except Exception as e:
        print(f"[R2 ERROR] Failed to delete object '{object_key}': {type(e).__name__}")
        return False


def r2_copy_pdf(src_key: str, dest_key: str) -> bool:
    client = get_r2_client()
    if not client:
        raise RuntimeError("Cloudflare R2 storage client is unavailable")
    cfg = get_r2_config()
    client.copy_object(
        Bucket=cfg["bucket_name"],
        CopySource={"Bucket": cfg["bucket_name"], "Key": src_key},
        Key=dest_key,
        ContentType="application/pdf"
    )
    return True


def r2_get_pdf_url(object_key: str, expires_in: int = 3600) -> str:
    cfg = get_r2_config()
    public_base = cfg["public_base_url"].rstrip("/")
    if public_base:
        return f"{public_base}/{object_key.lstrip('/')}"
    client = get_r2_client()
    if not client:
        return ""
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": cfg["bucket_name"], "Key": object_key},
            ExpiresIn=expires_in
        )
    except Exception as e:
        print(f"[R2 URL ERROR] Failed to generate URL for '{object_key}': {type(e).__name__}")
        return ""


def r2_download_pdf(object_key: str) -> bytes:
    client = get_r2_client()
    if not client:
        raise RuntimeError("Cloudflare R2 storage client is unavailable")
    cfg = get_r2_config()
    resp = client.get_object(Bucket=cfg["bucket_name"], Key=object_key)
    return resp["Body"].read()


def is_r2_file(file_ref: str) -> bool:
    if not file_ref:
        return False
    clean = file_ref.split("?")[0].strip().lstrip("/")
    if clean.startswith("http://") or clean.startswith("https://"):
        return False
    if (ROOT / clean).is_file():
        return False
    if is_r2_configured():
        return True
    return False




def init_submissions_db():
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(SUBMISSIONS_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contributor_name TEXT NOT NULL,
                branch TEXT NOT NULL,
                semester TEXT NOT NULL,
                subject TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER NOT NULL,
                file TEXT NOT NULL,
                file_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def init_requests_db():
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(REQUESTS_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT,
                branch TEXT NOT NULL,
                semester TEXT NOT NULL,
                subject TEXT NOT NULL,
                year TEXT NOT NULL,
                exam_type TEXT,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def sanitize_branch_slug(branch):
    return re.sub(r"[^a-zA-Z0-9]+", "-", branch.lower()).strip("-")


PAPERS_DB = DATABASE_DIR / "papers.db"


def connect_papers_db():
    connection = sqlite3.connect(PAPERS_DB)
    connection.row_factory = sqlite3.Row
    return connection


def connect_database(branch=None):
    """Backward-compatible database connection pointer."""
    return connect_papers_db()


def sanitize_branch_slug(branch):
    return re.sub(r"[^a-zA-Z0-9]+", "-", (branch or "").lower()).strip("-")


def create_schema(branch=None):
    with connect_papers_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS papers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                branch TEXT NOT NULL,
                semester TEXT NOT NULL,
                subject TEXT NOT NULL,
                subject_code TEXT DEFAULT '',
                year INTEGER NOT NULL,
                exam_type TEXT DEFAULT 'Autonomous SEE Exam',
                cie_number TEXT DEFAULT '',
                file TEXT NOT NULL,
                uploaded_by TEXT DEFAULT 'Library Admin',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'published'
            )
            """
        )
        existing_cols = [r[1] for r in connection.execute("PRAGMA table_info(papers)").fetchall()]
        if "cie_number" not in existing_cols:
            connection.execute("ALTER TABLE papers ADD COLUMN cie_number TEXT DEFAULT ''")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS deleted_papers_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_id INTEGER,
                title TEXT,
                branch TEXT,
                semester TEXT,
                subject TEXT,
                year INTEGER,
                deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS system_flags (
                flag_key TEXT PRIMARY KEY,
                flag_value TEXT
            )
            """
        )
        connection.commit()


def migrate_existing_branch_dbs():
    """Permanently disabled: Never re-import legacy sample papers."""
    return


def add_seed_papers():
    """Permanently disabled: Never auto-seed dummy question papers."""
    return


def initialize_database():
    DATABASE_DIR.mkdir(exist_ok=True)
    admin_auth.init_admin_db()
    init_submissions_db()
    init_requests_db()
    create_schema()


def validate_academic_submission(branch, semester, year, exam_type, cie_number=""):
    if branch not in BRANCHES:
        return False, "Choose a valid branch"
    if branch == "First Year":
        if semester not in ["1st Semester", "2nd Semester"]:
            return False, "First Year allows only 1st Semester and 2nd Semester"
    else:
        if semester not in ["3rd Semester", "4th Semester", "5th Semester", "6th Semester", "7th Semester", "8th Semester"]:
            return False, f"{branch} allows only 3rd Semester to 8th Semester"

    try:
        y = int(year)
    except (ValueError, TypeError):
        return False, "Invalid academic year"

    if y not in [2025, 2026]:
        return False, "Academic Year must be 2025 or 2026"

    if "cie" in exam_type.lower():
        if cie_number not in ["CIE-1", "CIE-2", "CIE-3"]:
            return False, "Please select a valid CIE number (CIE-1, CIE-2, or CIE-3)"

    return True, ""


def search_papers(search_text="", branch_filter=None):
    papers = []
    with connect_papers_db() as conn:
        params = []
        conditions = []
        
        # Branch filter
        if branch_filter and branch_filter in BRANCHES:
            conditions.append("branch = ?")
            params.append(branch_filter)
        elif branch_filter:
            for b in BRANCHES:
                if b.lower() == branch_filter.lower() or sanitize_branch_slug(b) == sanitize_branch_slug(branch_filter):
                    conditions.append("branch = ?")
                    params.append(b)
                    break

        # Search query
        if search_text:
            pattern = f"%{search_text.strip()}%"
            conditions.append(
                """(title LIKE ? COLLATE NOCASE
                 OR branch LIKE ? COLLATE NOCASE
                 OR semester LIKE ? COLLATE NOCASE
                 OR subject LIKE ? COLLATE NOCASE
                 OR subject_code LIKE ? COLLATE NOCASE
                 OR cie_number LIKE ? COLLATE NOCASE
                 OR CAST(year AS TEXT) LIKE ?)"""
            )
            params.extend([pattern, pattern, pattern, pattern, pattern, pattern, pattern])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT id, title, branch, semester, subject, 
                   COALESCE(subject_code, '') as subject_code,
                   year, 
                   COALESCE(exam_type, 'Autonomous SEE Exam') as exam_type,
                   COALESCE(cie_number, '') as cie_number,
                   file, created_at,
                   COALESCE(uploaded_by, 'Library Admin') as uploaded_by,
                   COALESCE(status, 'published') as status
            FROM papers
            {where_clause}
            ORDER BY created_at DESC, id DESC
        """
        rows = conn.execute(query, tuple(params)).fetchall()
        papers = [dict(row) for row in rows]
    return papers


def get_dashboard_stats(branch=None):
    """Aggregate statistics for admin dashboard or public overview."""
    canonical_b = normalize_branch(branch) if branch else None
    with connect_papers_db() as conn:
        if canonical_b:
            total_papers = conn.execute(
                "SELECT COUNT(*) FROM papers WHERE branch = ? COLLATE NOCASE", (canonical_b,)
            ).fetchone()[0]
            distinct_subjects = conn.execute(
                "SELECT COUNT(DISTINCT LOWER(TRIM(subject))) FROM papers WHERE branch = ? COLLATE NOCASE AND subject != ''",
                (canonical_b,),
            ).fetchone()[0]
        else:
            total_papers = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
            distinct_subjects = conn.execute(
                "SELECT COUNT(DISTINCT LOWER(TRIM(subject))) FROM papers WHERE subject != ''"
            ).fetchone()[0]

    pending_subs = 0
    try:
        with sqlite3.connect(SUBMISSIONS_DB) as conn:
            if canonical_b:
                pending_subs = conn.execute(
                    "SELECT COUNT(*) FROM pending_submissions WHERE status = 'pending' AND (branch = ? COLLATE NOCASE OR branch = ? COLLATE NOCASE)",
                    (canonical_b, branch),
                ).fetchone()[0]
            else:
                pending_subs = conn.execute(
                    "SELECT COUNT(*) FROM pending_submissions WHERE status = 'pending'"
                ).fetchone()[0]
    except Exception:
        pass

    student_reqs = 0
    try:
        with sqlite3.connect(REQUESTS_DB) as conn:
            if canonical_b:
                student_reqs = conn.execute(
                    "SELECT COUNT(*) FROM paper_requests WHERE status = 'pending' AND (branch = ? COLLATE NOCASE OR branch = ? COLLATE NOCASE)",
                    (canonical_b, branch),
                ).fetchone()[0]
            else:
                student_reqs = conn.execute(
                    "SELECT COUNT(*) FROM paper_requests WHERE status = 'pending'"
                ).fetchone()[0]
    except Exception:
        pass

    return {
        "total_papers": total_papers,
        "active_branches": 1 if canonical_b else len(BRANCHES),
        "total_subjects": distinct_subjects,
        "pending_submissions": pending_subs,
        "student_requests": student_reqs,
        "branch": canonical_b,
    }


def delete_paper_by_id(paper_id):
    """
    Permanently delete a question paper by its unique ID from papers.db.
    Inserts record into deleted_papers_log to permanently prevent re-seeding.
    Removes associated PDF file from disk if not shared by other papers.
    """
    if not paper_id:
        return False, "Invalid paper ID"

    try:
        paper_id = int(paper_id)
    except (ValueError, TypeError):
        return False, "Invalid paper ID format"

    with connect_papers_db() as conn:
        row = conn.execute(
            "SELECT id, title, branch, semester, subject, year, file FROM papers WHERE id = ?",
            (paper_id,)
        ).fetchone()

        if not row:
            return False, "Question paper not found or already deleted"

        paper = dict(row)
        rel_file = paper["file"]

        # 1. Log into deleted_papers_log so it NEVER gets re-seeded
        conn.execute(
            """
            INSERT INTO deleted_papers_log (original_id, title, branch, semester, subject, year)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (paper["id"], paper["title"], paper["branch"], paper["semester"], paper["subject"], paper["year"])
        )

        # 2. Execute DELETE query
        conn.execute("DELETE FROM papers WHERE id = ?", (paper_id,))
        conn.commit()

        # 3. Clean up file (R2 object or disk file) if not shared by any other question paper
        if rel_file:
            try:
                clean_rel = rel_file.split("?")[0].strip().lstrip("/")
                if clean_rel and not clean_rel.startswith("http"):
                    count = conn.execute(
                        "SELECT COUNT(*) FROM papers WHERE file LIKE ?", (f"{clean_rel}%",)
                    ).fetchone()[0]
                    if count == 0:
                        if is_r2_file(clean_rel):
                            r2_delete_pdf(clean_rel)
                        else:
                            disk_file = ROOT / clean_rel
                            if disk_file.exists() and disk_file.is_file():
                                disk_file.unlink(missing_ok=True)
            except Exception:
                pass

        return True, "Question paper deleted successfully."


def batch_delete_papers(items):
    """Batch delete multiple question papers by ID."""
    if not items or not isinstance(items, list):
        return 0

    deleted_count = 0
    for item in items:
        paper_id = None
        if isinstance(item, int):
            paper_id = item
        elif isinstance(item, str) and item.isdigit():
            paper_id = int(item)
        elif isinstance(item, dict):
            raw_id = item.get("id")
            if raw_id and str(raw_id).isdigit():
                paper_id = int(raw_id)
            elif item.get("file"):
                with connect_papers_db() as conn:
                    row = conn.execute("SELECT id FROM papers WHERE file = ? LIMIT 1", (item.get("file"),)).fetchone()
                    if row:
                        paper_id = row["id"]
        if paper_id is not None:
            success, _ = delete_paper_by_id(paper_id)
            if success:
                deleted_count += 1
    return deleted_count


def delete_paper_by_id_or_file(paper_id=None, branch=None, file_path=None):
    """Backward-compatible delete function."""
    if paper_id is not None:
        success, _ = delete_paper_by_id(paper_id)
        return success
    if file_path:
        with connect_papers_db() as conn:
            row = conn.execute("SELECT id FROM papers WHERE file = ? LIMIT 1", (file_path,)).fetchone()
            if row:
                success, _ = delete_paper_by_id(row["id"])
                return success
    return False


class RequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            pass

    def get_current_user(self):
        """Retrieve current logged in admin user from session cookie."""
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        session = cookies.get("mce_admin_session")
        if session and session.value in ADMIN_SESSIONS:
            return ADMIN_SESSIONS[session.value]
        return None

    def is_admin(self):
        """Check if request is authenticated as an administrator."""
        user = self.get_current_user()
        return bool(user and user.get("role") == "admin")

    def redirect(self, location, status=302):
        """Send HTTP redirect."""
        self.send_response(status)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_json(self, status, data):
        """Send JSON response."""
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def serve_html_file(self, filename):
        """Serve an HTML file directly with no-cache headers."""
        file_path = ROOT / filename
        if not file_path.exists():
            self.send_error(404, "File Not Found")
            return
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(content)

    FORBIDDEN_EXTENSIONS = {
        ".py", ".pyc", ".db", ".sqlite", ".sqlite3", ".bat", ".cmd", ".sh",
        ".exe", ".log", ".env", ".yml", ".yaml", ".ini", ".cfg", ".md", ".jsonl"
    }
    FORBIDDEN_DIRS = {"databases", "venv", "__pycache__", ".git", "android-app"}

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def is_path_forbidden(self, path: str) -> bool:
        clean_path = unquote(urlparse(path).path)
        normalized = os.path.normpath(clean_path).replace("\\", "/")
        if ".." in normalized or normalized.startswith("../"):
            return True
        parts = [p for p in normalized.split("/") if p]
        for part in parts:
            if part.startswith(".") and part != ".well-known":
                return True
        if parts and parts[0].lower() in self.FORBIDDEN_DIRS:
            return True
        ext = Path(normalized).suffix.lower()
        if ext in self.FORBIDDEN_EXTENSIONS:
            return True
        return False

    def do_HEAD(self):
        request = urlparse(self.path)
        path = request.path
        if self.is_path_forbidden(path):
            self.send_error(403, "Access Forbidden")
            return
        if path in ["/admin-dashboard.html", "/admin.html"] and not self.is_admin():
            self.redirect("/admin/login")
            return
        if path.startswith("/papers/"):
            clean_rel = path.lstrip("/")
            local_file = ROOT / clean_rel
            if local_file.is_file():
                super().do_HEAD()
                return
            if is_r2_configured():
                pdf_url = r2_get_pdf_url(clean_rel)
                if pdf_url:
                    self.redirect(pdf_url, status=302)
                    return
            self.send_error(404, "Paper Not Found")
            return
        super().do_HEAD()

    def do_GET(self):
        request = urlparse(self.path)
        path = request.path

        # 1. Security Gatekeeper: Block sensitive files, databases, .env, scripts, directory traversal
        if self.is_path_forbidden(path):
            self.send_error(403, "Access Forbidden")
            return

        # 2. Security Gatekeeper: Prevent direct access to admin templates without authentication
        if path in ["/admin-dashboard.html", "/admin.html"]:
            if not self.is_admin():
                self.redirect("/admin/login")
                return
        if path == "/admin-login.html":
            if self.is_admin():
                self.redirect("/admin/dashboard")
                return

        # 3. Security Gatekeeper: Disable directory browsing
        target_path = ROOT / path.lstrip("/")
        if target_path.is_dir() and path != "/":
            self.send_error(403, "Directory browsing is disabled")
            return

        # Serve PWA Service Worker
        if path == "/sw.js":
            sw_file = ROOT / "sw.js"
            if sw_file.exists():
                content = sw_file.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Service-Worker-Allowed", "/")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.end_headers()
                self.wfile.write(content)
                return

        # Serve PWA Web App Manifest
        if path == "/manifest.json":
            mf_file = ROOT / "manifest.json"
            if mf_file.exists():
                content = mf_file.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/manifest+json; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(content)
                return

        # =========================================
        # DEDICATED ADMIN ROUTING
        # =========================================
        if path == "/admin/login":
            if self.is_admin():
                self.redirect("/admin/dashboard")
                return
            self.serve_html_file("admin-login.html")
            return

        if path == "/admin/dashboard":
            if not self.is_admin():
                self.redirect("/admin/login")
                return
            self.serve_html_file("admin-dashboard.html")
            return

        if path in ["/admin", "/admin/", "/admin.html"]:
            if self.is_admin():
                self.redirect("/admin/dashboard")
            else:
                self.redirect("/admin/login")
            return

        # =========================================
        # ADMIN API ROUTES (GET)
        # =========================================
        if path == "/api/admin/status":
            user = self.get_current_user()
            self.send_json(200, {
                "is_admin": bool(user and user.get("role") == "admin"),
                "user": user
            })
            return

        if path == "/api/admin/me":
            user = self.get_current_user()
            if not user or user.get("role") != "admin":
                self.send_json(401, {"error": "Unauthorized. Admin session required."})
                return
            self.send_json(200, {"authenticated": True, "user": user})
            return

        if path == "/api/admin/stats":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None
            self.send_json(200, get_dashboard_stats(branch=admin_branch))
            return

        if path == "/api/admin/pending" or path.startswith("/api/admin/pending/"):
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None

            query = parse_qs(request.query)
            sub_id = query.get("id", [None])[0]
            if not sub_id and path.startswith("/api/admin/pending/"):
                suffix = path[len("/api/admin/pending/"):].strip()
                if suffix.isdigit():
                    sub_id = suffix

            if sub_id:
                try:
                    sid = int(sub_id)
                except ValueError:
                    self.send_json(400, {"error": "Invalid submission ID"})
                    return
                with sqlite3.connect(SUBMISSIONS_DB) as conn:
                    conn.row_factory = sqlite3.Row
                    sub = conn.execute("SELECT * FROM pending_submissions WHERE id = ?", (sid,)).fetchone()
                if not sub:
                    self.send_json(404, {"error": "Pending submission not found"})
                    return
                if admin_branch and not branches_match(sub["branch"], admin_branch):
                    self.send_json(403, {"error": f"Forbidden: You are only authorized to access submissions for {admin_branch}."})
                    return
                self.send_json(200, dict(sub))
                return

            with sqlite3.connect(SUBMISSIONS_DB) as conn:
                conn.row_factory = sqlite3.Row
                if admin_branch:
                    rows = conn.execute(
                        """
                        SELECT id, contributor_name, branch, semester, subject, title, year, file, file_type, status, created_at
                        FROM pending_submissions
                        WHERE status = 'pending' AND (branch = ? COLLATE NOCASE OR branch = ? COLLATE NOCASE)
                        ORDER BY id DESC
                        """,
                        (admin_branch, normalize_branch(admin_branch))
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """
                        SELECT id, contributor_name, branch, semester, subject, title, year, file, file_type, status, created_at
                        FROM pending_submissions
                        WHERE status = 'pending'
                        ORDER BY id DESC
                        """
                    ).fetchall()
            self.send_json(200, {"pending": [dict(r) for r in rows], "count": len(rows)})
            return

        if path == "/api/admin/users":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            admin_user = self.get_current_user()
            all_users = admin_auth.list_admin_users()
            if admin_user and admin_user.get("branch"):
                filtered = [u for u in all_users if u.get("id") == admin_user.get("id")]
                self.send_json(200, {"users": filtered})
            else:
                self.send_json(200, {"users": all_users})
            return

        if path == "/api/admin/logs":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            admin_user = self.get_current_user()
            user_email = admin_user.get("email") if (admin_user and admin_user.get("branch")) else None
            self.send_json(200, {"logs": admin_auth.get_recent_logs(50, user_email=user_email)})
            return

        # =========================================
        # PUBLIC & STUDENT API ROUTES (GET)
        # =========================================
        if path == "/api/requests" or path.startswith("/api/requests/"):
            admin_user = self.get_current_user() if self.is_admin() else None
            admin_branch = admin_user.get("branch") if admin_user else None

            query = parse_qs(request.query)
            req_id = query.get("id", [None])[0]
            if not req_id and path.startswith("/api/requests/"):
                suffix = path[len("/api/requests/"):].strip()
                if suffix.isdigit():
                    req_id = suffix

            if req_id:
                try:
                    rid = int(req_id)
                except ValueError:
                    self.send_json(400, {"error": "Invalid request ID"})
                    return
                with sqlite3.connect(REQUESTS_DB) as conn:
                    conn.row_factory = sqlite3.Row
                    req_row = conn.execute("SELECT * FROM paper_requests WHERE id = ?", (rid,)).fetchone()
                if not req_row:
                    self.send_json(404, {"error": "Request not found"})
                    return
                if admin_branch and not branches_match(req_row["branch"], admin_branch):
                    self.send_json(403, {"error": f"Forbidden: You are only authorized to access requests for {admin_branch}."})
                    return
                self.send_json(200, dict(req_row))
                return

            with sqlite3.connect(REQUESTS_DB) as conn:
                conn.row_factory = sqlite3.Row
                if admin_branch:
                    rows = conn.execute(
                        """
                        SELECT id, student_name, branch, semester, subject, year, exam_type, notes, status, created_at
                        FROM paper_requests
                        WHERE branch = ? COLLATE NOCASE OR branch = ? COLLATE NOCASE
                        ORDER BY id DESC
                        LIMIT 100
                        """,
                        (admin_branch, normalize_branch(admin_branch))
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """
                        SELECT id, student_name, branch, semester, subject, year, exam_type, notes, status, created_at
                        FROM paper_requests
                        ORDER BY id DESC
                        LIMIT 100
                        """
                    ).fetchall()
            self.send_json(200, {"requests": [dict(r) for r in rows], "count": len(rows)})
            return

        if path in ["/api/stats", "/api/public-stats"]:
            stats = get_dashboard_stats()
            self.send_json(200, {
                "total_papers": stats["total_papers"],
                "active_branches": stats["active_branches"],
                "total_subjects": stats["total_subjects"]
            })
            return

        if path == "/api/papers" or path.startswith("/api/papers/"):
            query = parse_qs(request.query)
            search_text = query.get("q", [""])[0].strip()
            branch = query.get("branch", [None])[0]
            paper_id = query.get("id", [None])[0]
            if not paper_id and path.startswith("/api/papers/"):
                suffix = path[len("/api/papers/"):].strip()
                if suffix.isdigit():
                    paper_id = suffix

            admin_user = self.get_current_user() if self.is_admin() else None
            admin_branch = admin_user.get("branch") if admin_user else None

            if paper_id:
                try:
                    pid = int(paper_id)
                except ValueError:
                    self.send_json(400, {"error": "Invalid paper ID"})
                    return
                with connect_papers_db() as conn:
                    row = conn.execute("SELECT * FROM papers WHERE id = ?", (pid,)).fetchone()
                if not row:
                    self.send_json(404, {"error": "Question paper not found"})
                    return
                paper_obj = dict(row)
                if admin_branch and not branches_match(paper_obj["branch"], admin_branch):
                    self.send_json(403, {"error": f"Forbidden: You are only authorized to view papers for {admin_branch}."})
                    return
                self.send_json(200, paper_obj)
                return

            if admin_branch:
                if branch and not branches_match(branch, admin_branch):
                    self.send_json(403, {"error": f"Forbidden: You are only authorized to view papers for {admin_branch}."})
                    return
                # Admin is always restricted to their assigned branch
                branch = admin_branch

            payload = json.dumps(search_papers(search_text, branch)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()
            self.wfile.write(payload)
            return

        # Serve question papers (local backward compatibility or R2 cloud redirect)
        if path.startswith("/papers/"):
            clean_rel = path.lstrip("/")
            local_file = ROOT / clean_rel
            if local_file.is_file():
                super().do_GET()
                return
            if is_r2_configured():
                pdf_url = r2_get_pdf_url(clean_rel)
                if pdf_url:
                    self.redirect(pdf_url, status=302)
                    return
            self.send_error(404, "Paper Not Found")
            return

        # Fallback to standard static files
        self.path = "/index.html" if path == "/" else path
        super().do_GET()

    def do_DELETE(self):
        request = urlparse(self.path)
        if request.path == "/api/papers" or request.path.startswith("/api/papers/"):
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required to delete question papers"})
                return

            query = parse_qs(request.query)
            paper_id = query.get("id", [None])[0]

            if not paper_id and request.path.startswith("/api/papers/"):
                suffix = request.path[len("/api/papers/"):].strip()
                if suffix.isdigit():
                    paper_id = int(suffix)
            else:
                paper_id = int(paper_id) if paper_id and str(paper_id).isdigit() else None

            if not paper_id:
                self.send_json(400, {"error": "Specify valid question paper ID to delete"})
                return

            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None

            with connect_papers_db() as conn:
                paper_row = conn.execute("SELECT id, branch FROM papers WHERE id = ?", (paper_id,)).fetchone()

            if not paper_row:
                self.send_json(404, {"error": "Question paper not found or already deleted"})
                return

            if admin_branch and not branches_match(paper_row["branch"], admin_branch):
                self.send_json(403, {"error": f"Forbidden: You are only authorized to delete papers from {admin_branch}."})
                return

            success, message = delete_paper_by_id(paper_id)
            if success:
                admin_auth.log_activity(
                    admin_user["email"] if admin_user else "Admin",
                    "Delete Paper",
                    f"Permanently deleted paper #{paper_id} ({paper_row['branch']})"
                )
                self.send_json(200, {"message": "Question paper deleted successfully."})
            else:
                self.send_json(404, {"error": message})
            return
        self.send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        request_path = urlparse(self.path).path

        # =========================================
        # ADMIN AUTHENTICATION ENDPOINTS
        # =========================================
        if request_path == "/api/admin/login":
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                credentials = json.loads(self.rfile.read(content_length))
            except Exception:
                self.send_json(400, {"error": "Invalid request body"})
                return

            username = (credentials.get("username") or credentials.get("email") or "").strip()
            password = str(credentials.get("password") or "")
            department = (credentials.get("department") or "").strip()

            user = admin_auth.authenticate_user(username, password, department=department)
            if not user or user.get("role") != "admin" or not user.get("branch"):
                self.send_json(401, {"error": "Invalid department administrator credentials."})
                return

            session_token = secrets.token_urlsafe(36)
            ADMIN_SESSIONS[session_token] = user
            admin_auth.log_activity(user["email"], "Login", f"Signed in to Admin Portal ({user.get('branch')} Admin)")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Set-Cookie", f"mce_admin_session={session_token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400")
            self.end_headers()
            self.wfile.write(json.dumps({
                "message": "Login successful",
                "user": user,
                "redirect": "/admin/dashboard"
            }).encode("utf-8"))
            return

        if request_path == "/api/admin/logout":
            cookies = SimpleCookie(self.headers.get("Cookie", ""))
            session = cookies.get("mce_admin_session")
            if session and session.value in ADMIN_SESSIONS:
                user = ADMIN_SESSIONS.pop(session.value, None)
                if user:
                    admin_auth.log_activity(user["email"], "Logout", "Admin signed out")

            self.send_response(200)
            self.send_header("Set-Cookie", "mce_admin_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(b'{"message":"Logged out successfully"}')
            return

        if request_path == "/api/admin/users/create":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            admin_user = self.get_current_user()
            if admin_user and admin_user.get("branch"):
                self.send_json(403, {"error": "Forbidden: Department admins cannot create new administrator accounts."})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length))
                new_id = admin_auth.create_admin_user(
                    data.get("name"),
                    data.get("email"),
                    data.get("password")
                )
                admin_auth.log_activity(admin_user["email"], "Create Admin", f"Created admin: {data.get('email')}")
                self.send_json(201, {"id": new_id, "message": "New administrator account created successfully."})
            except Exception as e:
                self.send_json(400, {"error": str(e)})
            return

        if request_path == "/api/admin/users/password":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length))
                user = self.get_current_user()
                admin_auth.change_user_password(user["id"], data.get("password", ""))
                admin_auth.log_activity(user["email"], "Change Password", "Updated account password")
                self.send_json(200, {"message": "Password changed successfully."})
            except Exception as e:
                self.send_json(400, {"error": str(e)})
            return

        # =========================================
        # QUESTION PAPER EDIT ENDPOINT
        # =========================================
        if request_path == "/api/papers/edit":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required to edit question papers"})
                return
            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length))
                paper_id = int(data.get("id"))
                target_branch = data.get("branch", "").strip()
                title = data.get("title", "").strip()
                subject = data.get("subject", "").strip()
                subject_code = data.get("subject_code", "").strip()
                semester = data.get("semester", "").strip()
                year = int(data.get("year"))
                exam_type = data.get("exam_type", "Autonomous SEE Exam").strip()
                cie_number = data.get("cie_number", "").strip() if "cie" in exam_type.lower() else ""

                with connect_papers_db() as conn:
                    existing = conn.execute("SELECT id, branch, file FROM papers WHERE id = ?", (paper_id,)).fetchone()
                if not existing:
                    self.send_json(404, {"error": "Question paper not found"})
                    return

                if admin_branch:
                    if not branches_match(existing["branch"], admin_branch):
                        self.send_json(403, {"error": f"Forbidden: You are only authorized to edit papers for {admin_branch}."})
                        return
                    if target_branch and not branches_match(target_branch, admin_branch):
                        self.send_json(403, {"error": f"Forbidden: You cannot move a paper to {target_branch}."})
                        return
                    branch = admin_branch
                else:
                    branch = target_branch

                if branch not in BRANCHES:
                    raise ValueError("Invalid branch")

                with connect_database(branch) as conn:
                    conn.execute(
                        """
                        UPDATE papers
                        SET title = ?, subject = ?, subject_code = ?, semester = ?, year = ?, exam_type = ?, cie_number = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (title, subject, subject_code, semester, year, exam_type, cie_number, paper_id)
                    )

                admin_auth.log_activity(
                    admin_user["email"] if admin_user else "Admin",
                    "Edit Paper",
                    f"Edited paper #{paper_id} - {title} ({branch})"
                )
                self.send_json(200, {"message": "Question paper updated successfully."})
            except Exception as e:
                self.send_json(400, {"error": str(e)})
            return

        # =========================================
        # CLEAR ALL PAPERS (PERMANENT PURGE)
        # =========================================
        if request_path == "/api/papers/clear-all":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required to clear repository"})
                return

            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None

            if admin_branch:
                canonical_b = normalize_branch(admin_branch)
                with connect_papers_db() as conn:
                    rows = conn.execute(
                        "SELECT id FROM papers WHERE branch = ? COLLATE NOCASE OR branch = ? COLLATE NOCASE",
                        (admin_branch, canonical_b)
                    ).fetchall()
                    ids_to_delete = [r["id"] for r in rows]

                deleted_count = 0
                for pid in ids_to_delete:
                    success, _ = delete_paper_by_id(pid)
                    if success:
                        deleted_count += 1
                msg = f"Successfully cleared all {deleted_count} question papers in {admin_branch}."
            else:
                with connect_papers_db() as conn:
                    count = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
                    conn.execute("DELETE FROM papers")
                    conn.execute("DELETE FROM sqlite_sequence WHERE name = 'papers'")
                    conn.commit()
                deleted_count = count
                msg = f"Successfully cleared all {count} question papers from repository."

            admin_name = admin_user["email"] if admin_user else "Admin"
            admin_auth.log_activity(
                admin_name,
                "Clear Repository",
                msg
            )

            self.send_json(200, {
                "message": msg,
                "deleted_count": deleted_count
            })
            return

        # =========================================
        # BATCH DELETE PAPERS
        # =========================================
        if request_path == "/api/papers/batch-delete":
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"error": "Invalid JSON request"})
                return

            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required to delete question papers"})
                return

            items = data.get("items", [])
            if not items or not isinstance(items, list):
                self.send_json(400, {"error": "Please provide an 'items' array of papers to delete."})
                return

            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None

            # Verify that every item in items belongs to admin_branch
            if admin_branch:
                with connect_papers_db() as conn:
                    for item in items:
                        p_id = None
                        if isinstance(item, int):
                            p_id = item
                        elif isinstance(item, str) and item.isdigit():
                            p_id = int(item)
                        elif isinstance(item, dict):
                            raw_id = item.get("id")
                            if raw_id and str(raw_id).isdigit():
                                p_id = int(raw_id)
                            elif item.get("file"):
                                r = conn.execute("SELECT id, branch FROM papers WHERE file = ? LIMIT 1", (item.get("file"),)).fetchone()
                                if r:
                                    p_id = r["id"]
                                    if not branches_match(r["branch"], admin_branch):
                                        self.send_json(403, {"error": f"Forbidden: Paper #{p_id} belongs to {r['branch']}, not {admin_branch}."})
                                        return
                        if p_id:
                            r = conn.execute("SELECT branch FROM papers WHERE id = ?", (p_id,)).fetchone()
                            if r and not branches_match(r["branch"], admin_branch):
                                self.send_json(403, {"error": f"Forbidden: Paper #{p_id} belongs to {r['branch']}, not {admin_branch}."})
                                return

            deleted_count = batch_delete_papers(items)

            admin_auth.log_activity(
                admin_user["email"] if admin_user else "Admin",
                "Batch Delete",
                f"Permanently batch deleted {deleted_count} question papers ({admin_branch or 'All'})"
            )

            self.send_json(200, {
                "message": f"Successfully deleted {deleted_count} question paper{'s' if deleted_count != 1 else ''}.",
                "deleted_count": deleted_count
            })
            return

        # =========================================
        # SINGLE DELETE PAPER (POST FALLBACK)
        # =========================================
        if request_path == "/api/papers/delete":
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"error": "Invalid JSON request"})
                return

            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required to delete question papers"})
                return

            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None

            paper_id = data.get("id")
            paper_id = int(paper_id) if paper_id and str(paper_id).isdigit() else None
            branch = data.get("branch")
            file_path = data.get("file")

            if not paper_id and not file_path:
                self.send_json(400, {"error": "Specify valid question paper ID or file path to delete"})
                return

            with connect_papers_db() as conn:
                paper_row = None
                if paper_id:
                    paper_row = conn.execute("SELECT id, branch, file FROM papers WHERE id = ?", (paper_id,)).fetchone()
                elif file_path:
                    paper_row = conn.execute("SELECT id, branch, file FROM papers WHERE file = ? LIMIT 1", (file_path,)).fetchone()

            if not paper_row:
                self.send_json(404, {"error": "Question paper not found or already deleted"})
                return

            if admin_branch and not branches_match(paper_row["branch"], admin_branch):
                self.send_json(403, {"error": f"Forbidden: You are only authorized to delete papers from {admin_branch}."})
                return

            if paper_id is not None:
                success, msg = delete_paper_by_id(paper_id)
            else:
                success = delete_paper_by_id_or_file(branch=branch, file_path=file_path)
                msg = "Question paper deleted successfully." if success else "Question paper not found or already deleted"

            if success:
                admin_auth.log_activity(
                    admin_user["email"] if admin_user else "Admin",
                    "Delete Paper",
                    f"Permanently deleted paper #{paper_id or file_path} ({paper_row['branch']})"
                )
                self.send_json(200, {"message": "Question paper deleted successfully."})
            else:
                self.send_json(404, {"error": msg})
            return


        # =========================================
        # STUDENT PAPER REQUESTS ENDPOINT
        # =========================================
        if request_path == "/api/requests":
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                payload = json.loads(self.rfile.read(content_length))
                branch = (payload.get("branch") or "").strip()
                semester = (payload.get("semester") or "").strip()
                subject = (payload.get("subject") or "").strip()
                year = str(payload.get("year") or "").strip()
                student_name = (payload.get("student_name") or "").strip() or "MCE Student"
                exam_type = (payload.get("exam_type") or "").strip()
                notes = (payload.get("notes") or "").strip()

                if not branch or not semester or not subject or not year:
                    self.send_json(400, {"error": "Please provide Branch, Semester, Subject, and Year."})
                    return

                with sqlite3.connect(REQUESTS_DB) as conn:
                    cursor = conn.execute(
                        """
                        INSERT INTO paper_requests (student_name, branch, semester, subject, year, exam_type, notes, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                        """,
                        (student_name, branch, semester, subject, year, exam_type, notes)
                    )
                    req_id = cursor.lastrowid

                self.send_json(201, {
                    "id": req_id,
                    "message": "Your paper request has been received! Our team will find and upload it as soon as possible."
                })
            except Exception as e:
                self.send_json(500, {"error": f"Request could not be saved: {str(e)}"})
            return

        if request_path == "/api/admin/requests/status":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                payload = json.loads(self.rfile.read(content_length))
                req_id = int(payload.get("id"))
                new_status = payload.get("status", "fulfilled")

                with sqlite3.connect(REQUESTS_DB) as conn:
                    conn.row_factory = sqlite3.Row
                    req_row = conn.execute("SELECT * FROM paper_requests WHERE id = ?", (req_id,)).fetchone()

                if not req_row:
                    self.send_json(404, {"error": "Request not found"})
                    return

                admin_user = self.get_current_user()
                admin_branch = admin_user.get("branch") if admin_user else None
                if admin_branch and not branches_match(req_row["branch"], admin_branch):
                    self.send_json(403, {"error": f"Forbidden: You are only authorized to manage requests for {admin_branch}."})
                    return

                with sqlite3.connect(REQUESTS_DB) as conn:
                    conn.execute("UPDATE paper_requests SET status = ? WHERE id = ?", (new_status, req_id))
                admin_auth.log_activity(admin_user["email"], "Update Request", f"Marked request #{req_id} ({req_row['branch']}) as {new_status}")
                self.send_json(200, {"message": f"Request #{req_id} marked as {new_status}"})
            except Exception as e:
                self.send_json(400, {"error": str(e)})
            return

        # =========================================
        # STUDENT CONTRIBUTION ENDPOINT
        # =========================================
        if request_path == "/api/contribute":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                if content_length > 15 * 1024 * 1024:
                    raise ValueError("File must be smaller than 15 MB")

                content_type = self.headers.get("Content-Type", "")
                if not content_type.startswith("multipart/form-data"):
                    raise ValueError("Upload must use multipart form data")

                body = self.rfile.read(content_length)
                message = BytesParser(policy=default).parsebytes(
                    f"Content-Type: {content_type}\r\n\r\n".encode() + body
                )
                fields = {}
                uploaded_file = None
                for part in message.iter_parts():
                    name = part.get_param("name", header="content-disposition")
                    if name == "file":
                        uploaded_file = (part.get_filename(), part.get_payload(decode=True))
                    elif name:
                        fields[name] = part.get_content()

                contributor_name = fields.get("contributor_name", "").strip() or "MCE Student"
                branch = fields.get("branch", "").strip()
                semester = fields.get("semester", "").strip()
                subject = fields.get("subject", "").strip()
                title = fields.get("title", subject).strip()
                try:
                    year = int(fields.get("year", "0"))
                except ValueError:
                    year = 0

                if branch not in BRANCHES or not re.fullmatch(r"[1-8](st|nd|rd|th) Semester", semester):
                    raise ValueError("Choose a valid branch and semester")
                if not subject or not title or year < 2000 or year > 2100:
                    raise ValueError("Enter a valid subject name, title, and year (2000-2100)")
                if not uploaded_file or not uploaded_file[0] or not uploaded_file[1]:
                    raise ValueError("Select a question paper file (PDF or Photo)")

                filename = uploaded_file[0]
                data = uploaded_file[1]
                ext = Path(filename).suffix.lower()

                if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
                    raise ValueError("Supported formats are PDF, JPG, and PNG")

                # If photo, convert to PDF via Pillow
                if ext in [".jpg", ".jpeg", ".png"]:
                    from PIL import Image
                    try:
                        image = Image.open(io.BytesIO(data)).convert("RGB")
                        pdf_buffer = io.BytesIO()
                        image.save(pdf_buffer, "PDF", resolution=150.0)
                        data = pdf_buffer.getvalue()
                        filename = f"{Path(filename).stem}.pdf"
                    except Exception as e:
                        raise ValueError(f"Could not convert image to PDF: {str(e)}")

                if not data.startswith(b"%PDF-"):
                    raise ValueError("Invalid PDF format")

                if is_production() and not is_r2_configured():
                    raise RuntimeError("Cloudflare R2 storage is required in production on Render. Please configure R2 environment variables.")

                safe_base = re.sub(r"[^A-Za-z0-9._-]", "_", Path(filename).stem)
                unique_token = secrets.token_hex(4)
                target_filename = f"{safe_base}_{unique_token}.pdf"
                relative_path = f"papers/pending/{target_filename}"

                if is_r2_configured():
                    r2_upload_pdf(data, relative_path)
                    if not r2_exists(relative_path):
                        raise RuntimeError("Cloudflare R2 upload verification failed")
                    try:
                        with sqlite3.connect(SUBMISSIONS_DB) as conn:
                            cursor = conn.execute(
                                """
                                INSERT INTO pending_submissions
                                    (contributor_name, branch, semester, subject, title, year, file, file_type, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 'pdf', 'pending')
                                """,
                                (contributor_name, branch, semester, subject, title, year, relative_path),
                            )
                            sub_id = cursor.lastrowid
                    except Exception:
                        r2_delete_pdf(relative_path)
                        raise
                else:
                    target_disk_path = ROOT / relative_path
                    PENDING_DIR.mkdir(parents=True, exist_ok=True)
                    target_disk_path.write_bytes(data)

                    with sqlite3.connect(SUBMISSIONS_DB) as conn:
                        cursor = conn.execute(
                            """
                            INSERT INTO pending_submissions
                                (contributor_name, branch, semester, subject, title, year, file, file_type, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'pdf', 'pending')
                            """,
                            (contributor_name, branch, semester, subject, title, year, relative_path),
                        )
                        sub_id = cursor.lastrowid

                self.send_json(201, {
                    "id": sub_id,
                    "message": "Thank you for contributing! Your paper has been submitted and will be published once verified by the admin."
                })
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
            except Exception:
                self.send_json(500, {"error": "Submission could not be processed"})
            return

        if request_path == "/api/admin/submissions/approve":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                payload = json.loads(self.rfile.read(content_length))
                sub_id = int(payload.get("id"))
            except Exception:
                self.send_json(400, {"error": "Invalid submission ID"})
                return

            with sqlite3.connect(SUBMISSIONS_DB) as conn:
                conn.row_factory = sqlite3.Row
                sub = conn.execute(
                    "SELECT * FROM pending_submissions WHERE id = ?", (sub_id,)
                ).fetchone()

            if not sub or sub["status"] != "pending":
                self.send_json(404, {"error": "Pending submission not found"})
                return

            admin_user = self.get_current_user()
            admin_branch = admin_user.get("branch") if admin_user else None
            if admin_branch and not branches_match(sub["branch"], admin_branch):
                self.send_json(403, {"error": f"Forbidden: You are only authorized to approve submissions for {admin_branch}."})
                return

            branch = sub["branch"]
            semester = sub["semester"]
            subject = sub["subject"]
            title = sub["title"]
            year = sub["year"]
            src_rel_file = sub["file"]
            src_disk_file = ROOT / src_rel_file
            is_r2_src = is_r2_file(src_rel_file) or (is_r2_configured() and not src_disk_file.exists())

            if is_r2_src:
                if not r2_exists(src_rel_file):
                    self.send_json(404, {"error": "Submitted file missing from storage"})
                    return
            else:
                if not src_disk_file.exists():
                    self.send_json(404, {"error": "Submitted file missing from storage"})
                    return

            semester_number = re.match(r"\d+", semester).group()
            branch_slug = sanitize_branch_slug(branch)
            safe_stem = re.sub(r"[^A-Za-z0-9._-]", "_", subject)
            target_rel_file = f"papers/{branch_slug}/sem{semester_number}/{safe_stem}_{year}.pdf"
            file_number = 1

            if is_r2_src:
                with connect_database(branch) as chk_conn:
                    while r2_exists(target_rel_file) or chk_conn.execute("SELECT 1 FROM papers WHERE file = ? LIMIT 1", (target_rel_file,)).fetchone():
                        target_rel_file = f"papers/{branch_slug}/sem{semester_number}/{safe_stem}_{year}_{file_number}.pdf"
                        file_number += 1
                r2_copy_pdf(src_rel_file, target_rel_file)
                r2_delete_pdf(src_rel_file)
            else:
                target_dir = ROOT / "papers" / branch_slug / f"sem{semester_number}"
                target_dir.mkdir(parents=True, exist_ok=True)
                while (ROOT / target_rel_file).exists():
                    target_rel_file = f"papers/{branch_slug}/sem{semester_number}/{safe_stem}_{year}_{file_number}.pdf"
                    file_number += 1
                dest_disk_file = ROOT / target_rel_file
                dest_disk_file.write_bytes(src_disk_file.read_bytes())
                src_disk_file.unlink(missing_ok=True)

            with sqlite3.connect(SUBMISSIONS_DB) as conn:
                conn.execute(
                    "UPDATE pending_submissions SET status = 'approved' WHERE id = ?", (sub_id,)
                )

            admin_name = admin_user["email"] if admin_user else "Library Admin"

            with connect_database(branch) as conn:
                conn.execute(
                    """
                    INSERT INTO papers (title, branch, semester, subject, subject_code, year, exam_type, file, uploaded_by, status)
                    VALUES (?, ?, ?, ?, '', ?, 'Autonomous Exam', ?, ?, 'published')
                    """,
                    (title, branch, semester, subject, year, target_rel_file, admin_name)
                )

            admin_auth.log_activity(admin_name, "Approve Submission", f"Approved submission #{sub_id} - {subject} ({branch})")
            self.send_json(200, {"message": f"Submission approved and published to {branch} {semester}!"})
            return

        if request_path == "/api/admin/submissions/reject":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                payload = json.loads(self.rfile.read(content_length))
                sub_id = int(payload.get("id"))
            except Exception:
                self.send_json(400, {"error": "Invalid submission ID"})
                return

            with sqlite3.connect(SUBMISSIONS_DB) as conn:
                conn.row_factory = sqlite3.Row
                sub = conn.execute("SELECT file, branch FROM pending_submissions WHERE id = ?", (sub_id,)).fetchone()
                if not sub:
                    self.send_json(404, {"error": "Pending submission not found"})
                    return

                admin_user = self.get_current_user()
                admin_branch = admin_user.get("branch") if admin_user else None
                if admin_branch and not branches_match(sub["branch"], admin_branch):
                    self.send_json(403, {"error": f"Forbidden: You are only authorized to reject submissions for {admin_branch}."})
                    return

                sub_file = sub["file"]
                if is_r2_file(sub_file):
                    r2_delete_pdf(sub_file)
                else:
                    disk_f = ROOT / sub_file
                    if disk_f.exists():
                        disk_f.unlink(missing_ok=True)
                conn.execute("DELETE FROM pending_submissions WHERE id = ?", (sub_id,))

            admin_auth.log_activity(admin_user["email"] if admin_user else "Admin", "Reject Submission", f"Rejected submission #{sub_id} ({sub['branch']})")
            self.send_json(200, {"message": "Submission rejected and removed."})
            return

        # =========================================
        # ADMIN DIRECT QUESTION PAPER UPLOAD
        # =========================================
        if request_path == "/api/papers":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin authentication required to publish papers."})
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data"):
                self.send_json(400, {"error": "Request must be multipart/form-data"})
                return

            try:
                body = self.rfile.read(content_length)
                message = BytesParser(policy=default).parsebytes(
                    f"Content-Type: {content_type}\r\n\r\n".encode() + body
                )
                fields = {}
                uploaded_file = None
                for part in message.iter_parts():
                    name = part.get_param("name", header="content-disposition")
                    if name == "file":
                        uploaded_file = (part.get_filename(), part.get_payload(decode=True))
                    elif name:
                        fields[name] = part.get_content()

                branch = fields.get("branch", "").strip()
                admin_user = self.get_current_user()
                admin_branch = admin_user.get("branch") if admin_user else None
                if admin_branch:
                    if branch and not branches_match(branch, admin_branch):
                        self.send_json(403, {"error": f"Forbidden: You are only authorized to upload papers for {admin_branch}."})
                        return
                    branch = admin_branch

                semester = fields.get("semester", "").strip()
                subject = fields.get("subject", "").strip()
                subject_code = fields.get("subject_code", "").strip()
                title = fields.get("title", "").strip() or f"{subject} ({semester})"
                exam_type = fields.get("exam_type", "Autonomous SEE Exam").strip()
                cie_number = fields.get("cie_number", "").strip()

                try:
                    year = int(fields.get("year", "0"))
                except ValueError:
                    year = 0

                is_valid, validation_err = validate_academic_submission(branch, semester, year, exam_type, cie_number)
                if not is_valid:
                    raise ValueError(validation_err)
                if "cie" not in exam_type.lower():
                    cie_number = ""

                if not subject:
                    raise ValueError("Enter a valid subject name")
                if not uploaded_file or not uploaded_file[0] or not uploaded_file[1]:
                    raise ValueError("Select a PDF question paper file to upload")

                filename = uploaded_file[0]
                data = uploaded_file[1]
                if not Path(filename).name.lower().endswith(".pdf") or not data.startswith(b"%PDF-"):
                    raise ValueError("The uploaded file must be a valid PDF document")

                if is_production() and not is_r2_configured():
                    raise RuntimeError("Cloudflare R2 storage is required in production on Render. Please configure R2 environment variables.")

                semester_number = re.match(r"\d+", semester).group()
                branch_slug = sanitize_branch_slug(branch)
                safe_subject = re.sub(r"[^A-Za-z0-9._-]", "_", subject)
                target_filename = f"{safe_subject}_{year}.pdf"
                relative_file = f"papers/{branch_slug}/sem{semester_number}/{target_filename}"
                file_number = 1

                if is_r2_configured():
                    with connect_database(branch) as chk_conn:
                        while r2_exists(relative_file) or chk_conn.execute("SELECT 1 FROM papers WHERE file = ? LIMIT 1", (relative_file,)).fetchone():
                            target_filename = f"{safe_subject}_{year}_{file_number}.pdf"
                            relative_file = f"papers/{branch_slug}/sem{semester_number}/{target_filename}"
                            file_number += 1

                    r2_upload_pdf(data, relative_file)
                    if not r2_exists(relative_file):
                        raise RuntimeError("Cloudflare R2 upload verification failed")

                    admin_user = self.get_current_user()
                    admin_name = admin_user["email"] if admin_user else "Library Admin"

                    try:
                        with connect_database(branch) as connection:
                            cursor = connection.execute(
                                """
                                INSERT INTO papers (title, branch, semester, subject, subject_code, year, exam_type, cie_number, file, uploaded_by, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
                                """,
                                (title, branch, semester, subject, subject_code, year, exam_type, cie_number, relative_file, admin_name),
                            )
                            paper_id = cursor.lastrowid
                    except Exception as db_err:
                        try:
                            r2_delete_pdf(relative_file)
                        except Exception as rollback_err:
                            print(f"[CRITICAL ROLLBACK FAILURE] Failed to delete orphaned R2 object '{relative_file}': {type(rollback_err).__name__}")
                        raise db_err
                else:
                    target_directory = ROOT / "papers" / branch_slug / f"sem{semester_number}"
                    target_directory.mkdir(parents=True, exist_ok=True)
                    while (target_directory / target_filename).exists():
                        target_filename = f"{safe_subject}_{year}_{file_number}.pdf"
                        file_number += 1
                        relative_file = f"papers/{branch_slug}/sem{semester_number}/{target_filename}"

                    target = target_directory / target_filename
                    target.write_bytes(data)

                    admin_user = self.get_current_user()
                    admin_name = admin_user["email"] if admin_user else "Library Admin"

                    try:
                        with connect_database(branch) as connection:
                            cursor = connection.execute(
                                """
                                INSERT INTO papers (title, branch, semester, subject, subject_code, year, exam_type, cie_number, file, uploaded_by, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
                                """,
                                (title, branch, semester, subject, subject_code, year, exam_type, cie_number, relative_file, admin_name),
                            )
                            paper_id = cursor.lastrowid
                    except Exception:
                        target.unlink(missing_ok=True)
                        raise

                admin_auth.log_activity(
                    admin_name,
                    "Publish Paper",
                    f"Published paper '{title}' for {branch} {semester}"
                )

                self.send_json(201, {"id": paper_id, "message": "Question paper published successfully to library."})
            except (ValueError, sqlite3.IntegrityError) as error:
                self.send_json(400, {"error": str(error)})
            except Exception as e:
                self.send_json(500, {"error": f"The paper could not be uploaded: {str(e)}"})
            return

        self.send_json(404, {"error": "Endpoint not found"})


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "10.227.185.217"


def kill_existing_port_listeners(port=8000):
    if os.name != 'nt':
        return
    try:
        import subprocess
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
        current_pid = os.getpid()
        killed = False
        for line in output.strip().splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.strip().split()
                if parts:
                    pid = int(parts[-1])
                    if pid != current_pid and pid > 0:
                        subprocess.run(f"taskkill /f /pid {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        killed = True
        if killed:
            time.sleep(1)
    except Exception:
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    kill_existing_port_listeners(port)
    initialize_database()
    host_ip = get_local_ip()
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer.allow_reuse_address = True

    server = None
    for attempt in range(5):
        try:
            server = ThreadingHTTPServer(("0.0.0.0", port), RequestHandler)
            break
        except OSError as e:
            if attempt < 4:
                kill_existing_port_listeners(port)
                time.sleep(1)
            else:
                raise e

    print("==================================================================")
    print(f"[SERVER] MCE PYQ Hub Server Active on port {port}")
    print(f"[PC]     Local Computer:               http://localhost:{port}")
    print(f"[PHONE]  Phone (Same Wi-Fi / Hotspot): http://{host_ip}:{port}")
    print(f"[ADMIN]  Admin Portal Login:           http://localhost:{port}/admin/login")
    print(f"[ADMIN]  Admin Dashboard:              http://localhost:{port}/admin/dashboard")
    print("==================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
    except Exception as e:
        print(f"\nServer loop exception: {e}")
    finally:
        try:
            server.server_close()
        except Exception:
            pass