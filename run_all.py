import os
import subprocess
import sys


def start_process(target):
    print(f"[RUNNER] Starting {target}")
    return subprocess.Popen([sys.executable, target], cwd=os.getcwd())


def main():
    processes = [
        start_process("watchdog.py"),
        start_process("runtime_manager.py"),
        start_process("dashboard.py"),
        start_process("teams/orchestrator.py"),
        start_process("portfolio_manager.py"),
        start_process("portfolio_controller.py"),
    ]

    try:
        for process in processes:
            process.wait()
    except KeyboardInterrupt:
        for process in processes:
            if process.poll() is None:
                process.terminate()


if __name__ == "__main__":
    main()
