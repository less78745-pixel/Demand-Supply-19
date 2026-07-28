import os
import sys
import psutil
import subprocess
import time

PORT = 8000

def kill_process_on_port(port):
    """Gracefully kills any process listening on the specified port."""
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            for conn in proc.connections(kind='inet'):
                if conn.laddr.port == port:
                    print(f"Stopping process {proc.info['name']} (PID: {proc.info['pid']}) on port {port}...")
                    proc.terminate()
                    proc.wait(timeout=3)
                    print("Process stopped.")
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

if __name__ == "__main__":
    print("============================================")
    print(" WMS Backend - Safe Start")
    print("============================================")
    print("\n[1/2] Checking port 8000...")
    
    try:
        kill_process_on_port(PORT)
    except Exception as e:
        print(f"Warning: Could not check/kill processes on port {PORT}: {e}")

    print("\n[2/2] Starting FastAPI server...")
    print(f"Backend will be available at http://127.0.0.1:{PORT}")
    print("Press Ctrl+C to stop\n")
    
    # Run uvicorn
    try:
        subprocess.run([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT), "--reload"])
    except KeyboardInterrupt:
        print("\nServer stopped manually.")
