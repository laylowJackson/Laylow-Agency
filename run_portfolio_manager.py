import subprocess
import sys


def main():
    print("[RUNNER] Starting portfolio manager...")
    process = subprocess.Popen([sys.executable, "portfolio_manager.py"])
    try:
        process.wait()
    except KeyboardInterrupt:
        process.terminate()


if __name__ == "__main__":
    main()
