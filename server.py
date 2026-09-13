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

# Active admin sessions: session_token -> user_dict
ADMIN_SESSIONS = {}


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
                file TEXT NOT NULL,
                uploaded_by TEXT DEFAULT 'Library Admin',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'published'
            )
            """
        )
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
                 OR CAST(year AS TEXT) LIKE ?)"""
            )
            params.extend([pattern, pattern, pattern, pattern, pattern, pattern])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT id, title, branch, semester, subject, 
                   COALESCE(subject_code, '') as subject_code,
                   year, 
                   COALESCE(exam_type, 'Autonomous SEE Exam') as exam_type,
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


def get_dashboard_stats():
    """Aggregate statistics for admin dashboard."""
    with connect_papers_db() as conn:
        total_papers = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
        distinct_subjects = conn.execute("SELECT COUNT(DISTINCT LOWER(TRIM(subject))) FROM papers WHERE subject != ''").fetchone()[0]

    pending_subs = 0
    try:
        with sqlite3.connect(SUBMISSIONS_DB) as conn:
            pending_subs = conn.execute("SELECT COUNT(*) FROM pending_submissions WHERE status = 'pending'").fetchone()[0]
    except Exception:
        pass

    student_reqs = 0
    try:
        with sqlite3.connect(REQUESTS_DB) as conn:
            student_reqs = conn.execute("SELECT COUNT(*) FROM paper_requests WHERE status = 'pending'").fetchone()[0]
    except Exception:
        pass

    return {
        "total_papers": total_papers,
        "active_branches": len(BRANCHES),
        "total_subjects": distinct_subjects,
        "pending_submissions": pending_subs,
        "student_requests": student_reqs
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

        # 3. Clean up disk file if not shared by any other question paper
        if rel_file:
            try:
                clean_rel = rel_file.split("?")[0].strip()
                if clean_rel and not clean_rel.startswith("http"):
                    disk_file = ROOT / clean_rel
                    count = conn.execute(
                        "SELECT COUNT(*) FROM papers WHERE file LIKE ?", (f"{clean_rel}%",)
                    ).fetchone()[0]
                    if count == 0 and disk_file.exists() and disk_file.is_file():
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
            self.send_json(200, get_dashboard_stats())
            return

        if path == "/api/admin/pending":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            with sqlite3.connect(SUBMISSIONS_DB) as conn:
                conn.row_factory = sqlite3.Row
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
            self.send_json(200, {"users": admin_auth.list_admin_users()})
            return

        if path == "/api/admin/logs":
            if not self.is_admin():
                self.send_json(401, {"error": "Admin login required"})
                return
            self.send_json(200, {"logs": admin_auth.get_recent_logs(50)})
            return

        # =========================================
        # PUBLIC & STUDENT API ROUTES (GET)
        # =========================================
        if path == "/api/requests":
            with sqlite3.connect(REQUESTS_DB) as conn:
                conn.row_factory = sqlite3.Row
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

        if path == "/api/papers":
            query = parse_qs(request.query)
            search_text = query.get("q", [""])[0].strip()
            branch = query.get("branch", [None])[0]
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

            success, message = delete_paper_by_id(paper_id)
            if success:
                user = self.get_current_user()
                admin_auth.log_activity(
                    user["email"] if user else "Admin",
                    "Delete Paper",
                    f"Permanently deleted paper #{paper_id}"
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

            username = (credentials.get("username") or credentials.get("email") or "admin@mce.ac.in").strip()
            password = str(credentials.get("password") or "")

            user = admin_auth.authenticate_user(username, password)
            if not user or user.get("role") != "admin":
                self.send_json(401, {"error": "Invalid administrator username or password."})
                return

            session_token = secrets.token_urlsafe(36)
            ADMIN_SESSIONS[session_token] = user
            admin_auth.log_activity(user["email"], "Login", "Signed in to Admin Portal")

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
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length))
                new_id = admin_auth.create_admin_user(
                    data.get("name"),
                    data.get("email"),
                    data.get("password")
                )
                admin_user = self.get_current_user()
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
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                data = json.loads(self.rfile.read(content_length))
                paper_id = int(data.get("id"))
                branch = data.get("branch", "").strip()
                title = data.get("title", "").strip()
                subject = data.get("subject", "").strip()
                subject_code = data.get("subject_code", "").strip()
                semester = data.get("semester", "").strip()
                year = int(data.get("year"))
                exam_type = data.get("exam_type", "Autonomous SEE Exam").strip()

                if branch not in BRANCHES:
                    raise ValueError("Invalid branch")

                with connect_database(branch) as conn:
                    conn.execute(
                        """
                        UPDATE papers
                        SET title = ?, subject = ?, subject_code = ?, semester = ?, year = ?, exam_type = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (title, subject, subject_code, semester, year, exam_type, paper_id)
                    )

                admin_user = self.get_current_user()
                admin_auth.log_activity(
                    admin_user["email"],
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

            with connect_papers_db() as conn:
                count = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
                conn.execute("DELETE FROM papers")
                conn.execute("DELETE FROM sqlite_sequence WHERE name = 'papers'")
                conn.commit()

            admin_user = self.get_current_user()
            admin_auth.log_activity(
                admin_user["email"] if admin_user else "Admin",
                "Clear Repository",
                f"Permanently purged all {count} question papers"
            )

            self.send_json(200, {
                "message": f"Successfully cleared all {count} question papers from repository.",
                "deleted_count": count
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

            deleted_count = batch_delete_papers(items)

            admin_user = self.get_current_user()
            admin_auth.log_activity(
                admin_user["email"] if admin_user else "Admin",
                "Batch Delete",
                f"Permanently batch deleted {deleted_count} question papers"
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

            paper_id = data.get("id")
            paper_id = int(paper_id) if paper_id and str(paper_id).isdigit() else None
            branch = data.get("branch")
            file_path = data.get("file")

            if not paper_id and not file_path:
                self.send_json(400, {"error": "Specify valid question paper ID or file path to delete"})
                return

            if paper_id is not None:
                success, msg = delete_paper_by_id(paper_id)
            else:
                success = delete_paper_by_id_or_file(branch=branch, file_path=file_path)
                msg = "Question paper deleted successfully." if success else "Question paper not found or already deleted"

            if success:
                admin_user = self.get_current_user()
                admin_auth.log_activity(
                    admin_user["email"] if admin_user else "Admin",
                    "Delete Paper",
                    f"Permanently deleted paper #{paper_id or file_path}"
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
                    conn.execute("UPDATE paper_requests SET status = ? WHERE id = ?", (new_status, req_id))
                admin_user = self.get_current_user()
                admin_auth.log_activity(admin_user["email"], "Update Request", f"Marked request #{req_id} as {new_status}")
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

                safe_base = re.sub(r"[^A-Za-z0-9._-]", "_", Path(filename).stem)
                unique_token = secrets.token_hex(4)
                target_filename = f"{safe_base}_{unique_token}.pdf"
                relative_path = f"papers/pending/{target_filename}"
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

            branch = sub["branch"]
            semester = sub["semester"]
            subject = sub["subject"]
            title = sub["title"]
            year = sub["year"]
            src_rel_file = sub["file"]
            src_disk_file = ROOT / src_rel_file

            if not src_disk_file.exists():
                self.send_json(404, {"error": "Submitted file missing from storage"})
                return

            semester_number = re.match(r"\d+", semester).group()
            branch_slug = sanitize_branch_slug(branch)
            target_dir = ROOT / "papers" / branch_slug / f"sem{semester_number}"
            target_dir.mkdir(parents=True, exist_ok=True)

            safe_stem = re.sub(r"[^A-Za-z0-9._-]", "_", subject)
            target_rel_file = f"papers/{branch_slug}/sem{semester_number}/{safe_stem}_{year}.pdf"
            file_number = 1
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

            admin_user = self.get_current_user()
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
                sub = conn.execute("SELECT file FROM pending_submissions WHERE id = ?", (sub_id,)).fetchone()
                if sub:
                    disk_f = ROOT / sub["file"]
                    if disk_f.exists():
                        disk_f.unlink(missing_ok=True)
                conn.execute("DELETE FROM pending_submissions WHERE id = ?", (sub_id,))

            admin_user = self.get_current_user()
            admin_auth.log_activity(admin_user["email"], "Reject Submission", f"Rejected submission #{sub_id}")
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
                semester = fields.get("semester", "").strip()
                subject = fields.get("subject", "").strip()
                subject_code = fields.get("subject_code", "").strip()
                title = fields.get("title", "").strip() or f"{subject} ({semester})"
                exam_type = fields.get("exam_type", "Autonomous SEE Exam").strip()

                try:
                    year = int(fields.get("year", "0"))
                except ValueError:
                    year = 0

                if branch not in BRANCHES:
                    raise ValueError("Choose a valid branch")
                if not re.fullmatch(r"[1-8](st|nd|rd|th) Semester", semester):
                    raise ValueError("Choose a valid semester (1st to 8th)")
                if not subject or year < 2000 or year > 2100:
                    raise ValueError("Enter a valid subject name and year (2000-2100)")
                if not uploaded_file or not uploaded_file[0] or not uploaded_file[1]:
                    raise ValueError("Select a PDF question paper file to upload")

                filename = uploaded_file[0]
                data = uploaded_file[1]
                if not Path(filename).name.lower().endswith(".pdf") or not data.startswith(b"%PDF-"):
                    raise ValueError("The uploaded file must be a valid PDF document")

                semester_number = re.match(r"\d+", semester).group()
                branch_slug = sanitize_branch_slug(branch)
                target_directory = ROOT / "papers" / branch_slug / f"sem{semester_number}"
                target_directory.mkdir(parents=True, exist_ok=True)

                safe_subject = re.sub(r"[^A-Za-z0-9._-]", "_", subject)
                target_filename = f"{safe_subject}_{year}.pdf"
                file_number = 1
                while (target_directory / target_filename).exists():
                    target_filename = f"{safe_subject}_{year}_{file_number}.pdf"
                    file_number += 1

                target = target_directory / target_filename
                target.write_bytes(data)
                relative_file = f"papers/{branch_slug}/sem{semester_number}/{target_filename}"

                admin_user = self.get_current_user()
                admin_name = admin_user["email"] if admin_user else "Library Admin"

                try:
                    with connect_database(branch) as connection:
                        cursor = connection.execute(
                            """
                            INSERT INTO papers (title, branch, semester, subject, subject_code, year, exam_type, file, uploaded_by, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
                            """,
                            (title, branch, semester, subject, subject_code, year, exam_type, relative_file, admin_name),
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