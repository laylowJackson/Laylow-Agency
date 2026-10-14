"""AAPL stock worker, supervised by run_all.py."""
from team_worker import run_team as _run_team


def run_team():
    _run_team("AAPL")


if __name__ == "__main__":
    run_team()
