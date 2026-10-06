import subprocess
import sys


def main():
    print("[RUNNER] Starting portfolio controller...")
    process = subprocess.Popen([sys.executable, "portfolio_controller.py"])
    try:
        process.wait()
    except KeyboardInterrupt:
        process.terminate()


if __name__ == "__main__":
    main()
