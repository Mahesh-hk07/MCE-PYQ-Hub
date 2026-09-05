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
    """Initialize users and activity logs tables in users.db and seed master admin."""
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

        # Check if default admin exists
        cursor = conn.cursor()
        existing = cursor.execute(
            "SELECT id FROM users WHERE email = 'admin@mce.ac.in' OR email = 'admin' LIMIT 1"
        ).fetchone()

        if not existing:
            default_pw = "MCEAdmin2026!"
            hashed = hash_password(default_pw)
            cursor.execute(
                """
                INSERT INTO users (name, email, password_hash, role)
                VALUES ('Library Administrator', 'admin@mce.ac.in', ?, 'admin')
                """,
                (hashed,)
            )
            conn.commit()


def authenticate_user(email_or_username: str, password: str):
    """Authenticate admin user and return user record if valid, else None."""
    identifier = (email_or_username or "").strip().lower()
    if not identifier or not password:
        return None

    with sqlite3.connect(USERS_DB) as conn:
        conn.row_factory = sqlite3.Row
        # Allow login via full email or username 'admin'
        if identifier in ["admin", "administrator"]:
            user = conn.execute(
                "SELECT * FROM users WHERE email = 'admin@mce.ac.in' OR email = 'admin' LIMIT 1"
            ).fetchone()
        else:
            user = conn.execute(
                "SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1",
                (identifier,)
            ).fetchone()

        if user and verify_password(password, user["password_hash"]):
            return {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"]
            }
    return None


def list_admin_users():
    """List all registered administrators."""
    with sqlite3.connect(USERS_DB) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, name, email, role, created_at FROM users ORDER BY id ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def create_admin_user(name: str, email: str, password: str, role: str = "admin"):
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
            INSERT INTO users (name, email, password_hash, role)
            VALUES (?, ?, ?, ?)
            """,
            (name, email, hashed, role)
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

