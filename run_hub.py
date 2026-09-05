import os
import sys
import time
import re
import socket
import subprocess
import signal
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
PYTHON_EXE = ROOT / "venv" / "Scripts" / "python.exe"
if not PYTHON_EXE.exists():
    PYTHON_EXE = Path(sys.executable)
CLOUDFLARED_EXE = ROOT / "cloudflared.exe"

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
                        try:
                            os.kill(pid, 9)
                        except Exception:
                            pass
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
            text = re.sub(r'https://[a-zA-Z0-9\-]+\.trycloudflare\.com', url, text)
            poster_path.write_text(text, encoding="utf-8")
    except Exception:
        pass

    try:
        Path(ROOT / "LIVE_URL.txt").write_text(f"{url}\nLast updated: {time.ctime()}\n", encoding="utf-8")
    except Exception:
        pass

def main():
    os.system("cls" if os.name == "nt" else "clear")
    print("==================================================================")
    print("   [MCE PYQ HUB] HIGH AVAILABILITY AUTO-RUNNER & WATCHDOG")
    print("==================================================================")
    print("[1/3] Cleaning up any old background instances...")
    kill_process_on_port(8000)
    try:
        subprocess.run("taskkill /f /im cloudflared.exe", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    print("[2/3] Starting Python Backend Server...")
    server_proc = subprocess.Popen(
        [str(PYTHON_EXE), "-u", "server.py"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Wait for server to bind
    time.sleep(2)

    print("[3/3] Establishing Secure Cloudflare Mobile Tunnel...")
    tunnel_cmd = [str(CLOUDFLARED_EXE), "tunnel", "--url", "http://127.0.0.1:8000"]
    tunnel_proc = subprocess.Popen(
        tunnel_cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    live_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com")

    # Read tunnel output to extract URL
    for _ in range(50):
        line = tunnel_proc.stdout.readline()
        if not line:
            time.sleep(0.5)
            continue
        match = url_pattern.search(line)
        if match:
            live_url = match.group(0)
            break

    if live_url:
        update_qr_and_assets(live_url)
        os.system("cls" if os.name == "nt" else "clear")
        print("==================================================================")
        print("[ACTIVE] MCE PYQ HUB IS LIVE AND ONLINE!")
        print("==================================================================")
        print(f"[PC]     LAPTOP / PC BROWSER:       http://localhost:8000")
        print(f"[PHONE]  MOBILE APP & ALL STUDENTS: {live_url}")
        print(f"[ADMIN]  ADMIN PORTAL:              http://localhost:8000/admin/login")
        print("------------------------------------------------------------------")
        print("[SAVED]  Saved to: LIVE_URL.txt")
        print("[HEALTH] Watchdog Active: Auto-restarts server if connection ever drops")
        print("[NOTE]   KEEP THIS WINDOW OPEN to keep the mobile app active!")
        print("==================================================================")
    else:
        print("[WARNING] Tunnel URL not captured immediately, checking connection...")

    try:
        while True:
            time.sleep(4)
            # Check server
            if server_proc.poll() is not None:
                print("[WATCHDOG] Server stopped. Auto-restarting server...")
                kill_process_on_port(8000)
                server_proc = subprocess.Popen(
                    [str(PYTHON_EXE), "-u", "server.py"],
                    cwd=str(ROOT),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )

            # Check tunnel
            if tunnel_proc.poll() is not None:
                print("[WATCHDOG] Tunnel dropped. Auto-restarting mobile tunnel...")
                tunnel_proc = subprocess.Popen(
                    tunnel_cmd,
                    cwd=str(ROOT),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )
    except KeyboardInterrupt:
        print("\nStopping MCE PYQ Hub safely...")
        server_proc.terminate()
        tunnel_proc.terminate()
        kill_process_on_port(8000)
        print("All processes stopped.")

if __name__ == "__main__":
    main()
