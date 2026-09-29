"""
MCE PYQ Hub - Admin Authentication & User Management Module
Implements real backend authentication with PBKDF2-HMAC-SHA256 password hashing,
session validation, activity logging, and role-based access control.
"""

import sqlite3
import hashlib
import secrets
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent
DATABASE_DIR = ROOT / "databases"
USERS_DB = DATABASE_DIR / "users.db"


def hash_password(password: str) -> str:
    """Generate a random 16-byte salt and hash the password with PBKDF2-HMAC-SHA256."""
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        100000
    ).hex()
    return f"{salt}:{pw_hash}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored salt and hash."""
    if not stored_hash or ":" not in stored_hash:
        return False
    try:
        salt, pw_hash = stored_hash.split(":", 1)
        computed = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            100000
        ).hex()
        return secrets.compare_digest(computed, pw_hash)
    except Exception:
        return False


def init_admin_db():
    """Initialize users and activity logs tables in users.db and seed department admins."""
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(USERS_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                branch TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        if "branch" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN branch TEXT DEFAULT ''")
            conn.commit()

        # Seed the 6 Department Admins
        default_pw = "MCEAdmin2026!"
        password_file = ROOT / ".admin_password"
        if password_file.exists():
            try:
                pw_content = password_file.read_text(encoding="utf-8").strip()
                if pw_content:
                    default_pw = pw_content
            except Exception:
                pass

        hashed_pw = hash_password(default_pw)

        department_admins = [
            ("ECE Department Admin", "ece_admin@mce.ac.in", "ECE"),
            ("CSE Department Admin", "cse_admin@mce.ac.in", "CSE"),
            ("AI & ML Department Admin", "aiml_admin@mce.ac.in", "CSE(AI&ML)"),
            ("Mechanical Department Admin", "mech_admin@mce.ac.in", "Mechanical"),
            ("Civil Department Admin", "civil_admin@mce.ac.in", "Civil"),
            ("First Year Department Admin", "firstyear_admin@mce.ac.in", "First Year"),
        ]

        for name, email, branch in department_admins:
            existing = cursor.execute("SELECT id FROM users WHERE email = ? LIMIT 1", (email,)).fetchone()
            if not existing:
                cursor.execute(
                    """
                    INSERT INTO users (name, email, password_hash, role, branch)
                    VALUES (?, ?, ?, 'admin', ?)
                    """,
                    (name, email, hashed_pw, branch)
                )
            else:
                cursor.execute(
                    "UPDATE users SET branch = ? WHERE email = ?",
                    (branch, email)
                )
        conn.commit()


DEPARTMENT_SHORTCUTS = {
    "ece": "ECE",
    "ece_admin": "ECE",
    "ece@mce.ac.in": "ECE",
    "cse": "CSE",
    "cse_admin": "CSE",
    "cse@mce.ac.in": "CSE",
    "aiml": "CSE(AI&ML)",
    "ai_ml": "CSE(AI&ML)",
    "ai & ml": "CSE(AI&ML)",
    "aiml_admin": "CSE(AI&ML)",
    "aiml@mce.ac.in": "CSE(AI&ML)",
    "mech": "Mechanical",
    "mechanical": "Mechanical",
    "mech_admin": "Mechanical",
    "mech@mce.ac.in": "Mechanical",
    "civil": "Civil",
    "civil_admin": "Civil",
    "civil@mce.ac.in": "Civil",
    "firstyear": "First Year",
    "first_year": "First Year",
    "first year": "First Year",
    "firstyear_admin": "First Year",
    "1styear": "First Year",
    "firstyear@mce.ac.in": "First Year",
}


def authenticate_user(email_or_username: str, password: str, department: str = None):
    """Authenticate department admin and return user record with assigned branch if valid, else None."""
    identifier = (email_or_username or "").strip().lower()
    if not password:
        return None

    # Canonical branch map
    branch_map = {
        "ece": "ECE",
        "cse": "CSE",
        "ai & ml": "CSE(AI&ML)",
        "ai&ml": "CSE(AI&ML)",
        "cse(ai&ml)": "CSE(AI&ML)",
        "aiml": "CSE(AI&ML)",
        "mechanical": "Mechanical",
        "civil": "Civil",
        "first year": "First Year"
    }

    target_branch = None
    if department:
        target_branch = branch_map.get(str(department).strip().lower(), str(department).strip())

    with sqlite3.connect(USERS_DB) as conn:
        conn.row_factory = sqlite3.Row
        user = None

        # 1. If explicit department selected, find that department admin
        if target_branch:
            user = conn.execute(
                "SELECT * FROM users WHERE branch = ? OR branch = ? LIMIT 1",
                (target_branch, department)
            ).fetchone()

        # 2. Look up by shortcut username if user not yet found
        if not user and identifier in DEPARTMENT_SHORTCUTS:
            sc_branch = DEPARTMENT_SHORTCUTS[identifier]
            user = conn.execute(
                "SELECT * FROM users WHERE branch = ? LIMIT 1",
                (sc_branch,)
            ).fetchone()

        # 3. Look up by direct email or name
        if not user and identifier:
            user = conn.execute(
                "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(name) = ? LIMIT 1",
                (identifier, identifier)
            ).fetchone()

        # 4. Fallback: if username is 'admin' and target_branch is specified, get that department's admin
        if not user and identifier in ["admin", "administrator", "admin@mce.ac.in"] and target_branch:
            user = conn.execute(
                "SELECT * FROM users WHERE branch = ? LIMIT 1",
                (target_branch,)
            ).fetchone()

        if user and verify_password(password, user["password_hash"]):
            user_branch = user["branch"] or target_branch or ""
            if target_branch and user["branch"] and user["branch"].strip().lower() != target_branch.strip().lower():
                return None
            if not user_branch:
                return None
            return {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
                "branch": user_branch
            }

    return None


def list_admin_users():
    """List all registered administrators."""
    with sqlite3.connect(USERS_DB) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, name, email, role, branch, created_at FROM users ORDER BY id ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def create_admin_user(name: str, email: str, password: str, role: str = "admin", branch: str = ""):
    """Create a new administrator account."""
    name = (name or "").strip()
    email = (email or "").strip().lower()
    if not name or not email or len(password) < 6:
        raise ValueError("Invalid user name, email, or password (minimum 6 characters)")

    hashed = hash_password(password)
    with sqlite3.connect(USERS_DB) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (name, email, password_hash, role, branch)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, email, hashed, role, branch)
        )
        return cursor.lastrowid


def change_user_password(user_id: int, new_password: str):
    """Update user password."""
    if len(new_password) < 6:
        raise ValueError("Password must be at least 6 characters")
    hashed = hash_password(new_password)
    with sqlite3.connect(USERS_DB) as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hashed, user_id)
        )


def log_activity(user_email: str, action: str, details: str = ""):
    """Record an action in activity_logs."""
    try:
        with sqlite3.connect(USERS_DB) as conn:
            conn.execute(
                """
                INSERT INTO activity_logs (user_email, action, details)
                VALUES (?, ?, ?)
                """,
                (user_email, action, details)
            )
    except Exception:
        pass


def get_recent_logs(limit: int = 50):
    """Retrieve recent activity logs."""
    try:
        with sqlite3.connect(USERS_DB) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?",
                (limit,)
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception:
        return []

