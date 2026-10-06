import os
import subprocess

TEAM_FILES = [
    "teams/spy_team.py",
    "teams/qqq_team.py",
    "teams/aapl_team.py",
    "teams/tsla_team.py",
]


def start_team(path):
    print(f"[ORCHESTRATOR] Starting {path}")
    return subprocess.Popen(["python", path])


def main():
    processes = [start_team(path) for path in TEAM_FILES]
    try:
        for p in processes:
            p.wait()
    except KeyboardInterrupt:
        for p in processes:
            p.terminate()


if __name__ == "__main__":
    main()
