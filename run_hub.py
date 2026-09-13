import os
import sys
import time
import re
import socket
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
PYTHON_EXE = ROOT / "venv" / "Scripts" / "python.exe"
if not PYTHON_EXE.exists():
    PYTHON_EXE = Path(sys.executable)
CLOUDFLARED_EXE = ROOT / "cloudflared.exe"

current_live_url = None
url_lock = threading.Lock()


def kill_process_on_port(port=8000):
    try:
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
        current_pid = os.getpid()
        for line in output.strip().splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.strip().split()
                if parts:
                    pid = int(parts[-1])
                    if pid != current_pid and pid > 0:
                        subprocess.run(
                            f"taskkill /f /pid {pid}",
                            shell=True,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
        time.sleep(0.5)
    except Exception:
        pass


def update_qr_and_assets(url):
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0e306a", back_color="white")
        out_path = ROOT / "icons" / "phone-qr.png"
        img.save(out_path)
    except Exception:
        pass

    try:
        poster_path = ROOT / "poster.html"
        if poster_path.exists():
            text = poster_path.read_text(encoding="utf-8")
            text = re.sub(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com", url, text)
            poster_path.write_text(text, encoding="utf-8")
    except Exception:
        pass

    try:
        Path(ROOT / "LIVE_URL.txt").write_text(
            f"{url}\nLast updated: {time.ctime()}\n",
            encoding="utf-8"
        )
    except Exception:
        pass


def print_live_banner(url):
    print("\n==================================================================")
    print("[ACTIVE] MCE PYQ HUB IS LIVE AND ONLINE!")
    print("==================================================================")
    print(f"[PC]     LAPTOP / PC BROWSER:       http://localhost:8000")
    print(f"[PHONE]  MOBILE APP & ALL STUDENTS: {url}")
    print(f"[ADMIN]  ADMIN PORTAL:              http://localhost:8000/admin/login")
    print("------------------------------------------------------------------")
    print(f"[SAVED]  Updated LIVE_URL.txt & icons/phone-qr.png at {time.strftime('%H:%M:%S')}")
    print("[HEALTH] Watchdog Active: Auto-reconnects if connection drops")
    print("[NOTE]   KEEP THIS WINDOW OPEN to keep the mobile app active!")
    print("==================================================================\n")


def tunnel_reader(proc):
    global current_live_url
    url_pattern = re.compile(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com")
    try:
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            match = url_pattern.search(line)
            if match:
                url = match.group(0)
                with url_lock:
                    if url != current_live_url:
                        current_live_url = url
                        update_qr_and_assets(url)
                        print_live_banner(url)
    except Exception:
        pass


def start_server():
    return subprocess.Popen(
        [str(PYTHON_EXE), "-u", "server.py"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )


def start_tunnel():
    tunnel_cmd = [str(CLOUDFLARED_EXE), "tunnel", "--url", "http://127.0.0.1:8000"]
    proc = subprocess.Popen(
        tunnel_cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    t = threading.Thread(target=tunnel_reader, args=(proc,), daemon=True)
    t.start()
    return proc


def main():
    print("==================================================================")
    print("   [MCE PYQ HUB] HIGH AVAILABILITY AUTO-RUNNER & WATCHDOG")
    print("==================================================================")
    print("[1/3] Cleaning up any old background instances...")
    kill_process_on_port(8000)
    try:
        subprocess.run(
            "taskkill /f /im cloudflared.exe",
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception:
        pass

    print("[2/3] Starting Python Backend Server...")
    server_proc = start_server()
    time.sleep(2)

    print("[3/3] Establishing Secure Cloudflare Mobile Tunnel...")
    tunnel_proc = start_tunnel()

    # Wait up to 15 seconds for initial tunnel URL
    for _ in range(30):
        with url_lock:
            if current_live_url:
                break
        time.sleep(0.5)

    if not current_live_url:
        print("[INFO] Establishing tunnel connection, waiting for address...")

    try:
        while True:
            time.sleep(5)
            # Watchdog: Server Health
            if server_proc.poll() is not None:
                print(f"[{time.strftime('%H:%M:%S')}] [WATCHDOG] Server stopped. Auto-restarting...")
                kill_process_on_port(8000)
                server_proc = start_server()

            # Watchdog: Tunnel Health
            if tunnel_proc.poll() is not None:
                print(f"[{time.strftime('%H:%M:%S')}] [WATCHDOG] Tunnel dropped. Auto-restarting...")
                tunnel_proc = start_tunnel()

    except KeyboardInterrupt:
        print("\nStopping MCE PYQ Hub safely...")
        try:
            server_proc.terminate()
        except Exception:
            pass
        try:
            tunnel_proc.terminate()
        except Exception:
            pass
        kill_process_on_port(8000)
        try:
            subprocess.run(
                "taskkill /f /im cloudflared.exe",
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception:
            pass
        print("All processes stopped successfully.")


if __name__ == "__main__":
    main()
