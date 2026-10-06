import subprocess
import sys


def start_process(target):
    print(f"[RUNNER] Starting {target}")
    return subprocess.Popen([sys.executable, target])


def main():
    processes = [
        start_process("teams/orchestrator.py"),
        start_process("portfolio_manager.py"),
        start_process("portfolio_controller.py"),
    ]

    try:
        for process in processes:
            process.wait()
    except KeyboardInterrupt:
        for process in processes:
            process.terminate()


if __name__ == "__main__":
    main()
