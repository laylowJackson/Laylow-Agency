"""Build a clean Windows source download; credentials/databases are excluded."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
FILES = [
    "README.md", "requirements.txt", ".env.example", ".gitignore",
    "SETUP_WINDOWS.bat", "SETUP_WINDOWS.ps1", "START_WINDOWS.bat", "CHECK_SETUP.bat",
    "check_setup.py", "run_all.py", "watchdog.py", "runtime_manager.py",
    "config.py", "db_utils.py", "dashboard.py", "dashboard_status.py", "index.html",
    "team_worker.py", "teams/__init__.py", "teams/aapl_team.py", "teams/tsla_team.py",
    "teams/spy_team.py", "teams/qqq_team.py", "teams/orchestrator.py",
    "package_build.py",
]


def build_archive(destination=None):
    destination = Path(destination or ROOT / "dist" / "Laylow-Agency-improved.zip")
    candidates = FILES + [
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in sorted((ROOT / "tests").glob("test_*.py"))
    ]
    missing = [name for name in candidates if not (ROOT / name).is_file()]
    if missing:
        raise FileNotFoundError("Missing package files: " + ", ".join(missing))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for name in candidates:
            archive.write(ROOT / name, "Laylow-Agency/" + name)
    return destination


if __name__ == "__main__":
    print(build_archive())
