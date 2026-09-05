# 🎓 MCE PYQ Hub & Maya AI

> **The Next-Gen Digital Examination Archive, Community Repository & AI Study Companion for Malnad College of Engineering (MCE), Hassan.**

[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Android-0e306a.svg)]()
[![Python](https://img.shields.io/badge/Backend-Python%20ThreadingHTTPServer-3776ab.svg?logo=python&logoColor=white)]()
[![Database](https://img.shields.io/badge/Database-SQLite3-003b57.svg?logo=sqlite&logoColor=white)]()
[![Security](https://img.shields.io/badge/Security-PBKDF2%20HMAC--SHA256%20%7C%20Audit%20Passed-green.svg)]()
[![PWA](https://img.shields.io/badge/PWA-Offline%20Ready%20%7C%201--Click%20Install-blueviolet.svg)]()

---

## 📌 Overview

**MCE PYQ Hub** is a full-stack, enterprise-grade academic portal and mobile application built to solve the age-old problem of students scrambling for previous year question papers before Semester End Exams (SEE) and Continuous Internal Evaluations (CIE).

The platform pairs a fast, student-centric question paper repository with **Maya AI** — a custom autonomous engineering study assistant that delivers step-by-step academic proofs, answers, and syllabus breakdowns.

---

## 🏗️ System Architecture

The project is architected into two completely isolated tiers: the **Public Student Experience (Web & Mobile PWA)** and the **Restricted Library Admin Portal**.

```
                           ┌──────────────────────────────┐
                           │   Students (Mobile & Web)    │
                           └──────────────┬───────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                      ┌────────────────────────┐
     │  Public Student Portal │                      │  Maya AI Study Engine  │
     │  • 8 Branches + 1st Yr │                      │  • Fast Precision (7)  │
     │  • Search & Schemes    │                      │  • Deep Think (7.7)    │
     │  • 1-Click PDF Downld  │                      │  • Contextual Syllabus │
     │  • Paper Requests      │                      └────────────┬───────────┘
     └────────────┬───────────┘                                   │
                  │                                               │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │        Security & Gatekeeper Engine          │
                   │        • Block .env, .db, .py, .bat          │
                   │        • Anti-Path Traversal (403)           │
                   │        • Injected Security Headers           │
                   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │    Multi-Threaded Python Backend (8000)      │
                   └──────────────┬────────────────┬──────────────┘
                                  │                │
            ┌─────────────────────┘                └─────────────────────┐
            ▼                                                            ▼
┌────────────────────────┐                                   ┌────────────────────────┐
│  Dedicated Admin Hub   │                                   │   Unified SQLite DBs   │
│  • Session Validation  │                                   │  • papers.db           │
│  • PBKDF2 Encryption   │                                   │  • users.db (Auth)     │
│  • Full CRUD & Audit   │                                   │  • requests.db         │
│  • Double-Check Purge  │                                   │  • submissions.db      │
└────────────────────────┘                                   └────────────────────────┘
```

---

## 🌟 Key Features

### 👨‍🎓 1. Public Student Portal
- **Branch Categorization**: Dedicated hubs for **1st Year (Physics & Chemistry Cycles)**, **CSE**, **CSE (AI & ML)**, **CSBS**, **ECE**, **EEE**, **Mechanical**, and **Civil Engineering**.
- **Scheme & Semester Filtering**: Real-time multi-criteria filtering by semester (1st through 8th), scheme (2022 Scheme, 2021 Scheme), year, and exam type.
- **1-Click PDF Downloads**: Immediate, high-speed document retrieval with zero advertisements or third-party redirects.
- **Student Paper Requests**: Missing a paper? Students can submit a structured request detailing Subject, Year, and Exam Type.
- **Community Contributions**: Students can upload newly held exam papers directly for library verification.

### 🤖 2. Maya AI Engineering Tutor
- **Dual Thinking Modes**:
  - **Maya 7 (Fast Precision)**: Instant point-wise definitions, key formulas, and rapid exam revision points.
  - **Maya 7.7 (Deep Think)**: Comprehensive 10-mark examination problem solver with derivations, step-by-step proofs, and practical engineering examples.
- **Context-Aware**: Adapts explanations directly to the student’s department and autonomous syllabus.

### 🛡️ 3. Restricted Library Admin Portal
- **Complete Route Isolation**: Dedicated routes (`/admin/login` and `/admin/dashboard`) with zero visible links across the student-facing website.
- **Cryptographic Security**: PBKDF2-HMAC-SHA256 password hashing with 100,000 rounds and unique 16-byte random salts.
- **Session Protection**: `HttpOnly`, `SameSite=Strict` secure session tokens.
- **Interactive Repository Management**:
  - Live paper search, multi-selection, and bulk deletion.
  - Edit modal for updating subject codes, schemes, and examination titles.
  - Drag-and-drop PDF publisher.
  - Permanent repository purge (`/api/papers/clear-all`) with double-confirmation safeguards.
- **Student Demand Triage**: View requested papers and fulfill them with 1-click pre-filled upload forms.
- **Audit Logs**: Real-time logging of all administrative logins, edits, uploads, and deletions.

### 📲 4. Progressive Web App (PWA) & Mobile Ready
- **Instant 1-Click Install**: Installs directly from mobile Chrome or Safari without downloading from app stores.
- **Native Experience**: Standalone fullscreen display, app drawer icon, and splash branding.
- **Service Worker Caching**: Instant launch and offline caching for static assets, with zero-stale bypass on dynamic API queries.
- **Android Studio Native Wrapper**: Complete native Android WebView project ready to build signed APKs with integrated Android DownloadManager.

---

## 🔒 Security Hardening & Penetration Audit

The backend server is hardened against standard web vulnerabilities and passed a **21-point automated penetration audit**:

| Attack Vector | Defense Implemented | Result |
|---|---|---|
| **Secret Leaks (`.env`)** | Unbypassable Gatekeeper blocks dotfiles and secrets | **403 Forbidden** |
| **Database Theft (`.db`)** | Statically blocked `/databases/*` and `.db` extensions | **403 Forbidden** |
| **Source Code Exposure** | Blocked static delivery of `.py`, `.bat`, `.cmd`, `.sh`, `.exe` | **403 Forbidden** |
| **Path Traversal (`../`)** | Canonical path validation and traversal rejection | **403 Forbidden** |
| **Direct Template Bypass** | `/admin-dashboard.html` guarded by backend session checks | **302 Redirect to /admin/login** |
| **Clickjacking & Sniffing** | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` | **Headers Injected** |
| **Socket Collisions** | Windows `SO_REUSEADDR` disabled; automatic zombie process cleanup | **Zero Port Conflicts** |

---

## 💻 Tech Stack

- **Frontend**: HTML5, CSS3 (Modern Flexbox/Grid, Glassmorphism, Dark/Navy Theme), Vanilla JavaScript (ES6+), Web Manifest, Service Worker API.
- **Backend**: Python 3 (`ThreadingHTTPServer`, `sqlite3`, `secrets`, `hashlib`).
- **Database**: SQLite3 (ACID compliant, relational schema, activity logging).
- **AI Integration**: Cohere Command-R / Command-R+ via custom `maya_ai_engine.py`.
- **Tunneling & PWA HTTPS**: Cloudflare Quick Tunnels (`cloudflared`).
- **Native Mobile**: Android Studio Java SDK (WebView, SwipeRefreshLayout, DownloadManager).

---

## 🚀 Quick Start (Local Setup)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/MCE-PYQ-Hub.git
cd MCE-PYQ-Hub
```

### 2. Set Up Virtual Environment & Dependencies
```bash
python -m venv venv
.\venv\Scripts\activate   # On Windows
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory:
```env
COHERE_API_KEY=your_cohere_api_key_here
```

### 4. Run the Server & Mobile Tunnel
Double-click **`start-mce-hub.bat`** or run:
```bash
python server.py
```
- **Local Web Portal**: `http://localhost:8000`
- **Admin Login**: `http://localhost:8000/admin/login`
  - 

---

## 👥 Authors & Acknowledgments
- **Developer**: Built with passion for the students of **Malnad College of Engineering (MCE), Hassan**.

