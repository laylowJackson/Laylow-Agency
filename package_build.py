"""Build a clean Windows source download; credentials/databases are excluded."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
FILES = [
    "README.md", "requirements.txt", ".env.example", ".gitignore",
    "SETUP_WINDOWS.bat", "SETUP_WINDOWS.ps1", "START_WINDOWS.bat", "CHECK_SETUP.bat",
    "check_setup.py", "run_all.py", "watchdog.py", "runtime_manager.py",
    "config.py", "db_utils.py", "dashboard.py", "dashboard_status.py", "index.html",
    "broker_adapter.py", "broker_alpaca.py", "broker_practice.py", "execution_config.py",
    "risk_engine.py", "order_store.py", "execution_service.py", "reconciliation_worker.py", "execution_bot.py",
    "practice-engine.js", "practice-ui.js", "training-engine.js", "training-ui.js", "team-offices.js",
    "wick-knowledge.js", "wick-knowledge.css", "WICK_KNOWLEDGE.md", "tests/test_wick_knowledge.cjs",
    "screenshot-lab.js", "screenshot-lab.css", "screenshot_analysis.py", "screenshot_reviews.py", "training-theater.js",
    "tests/__init__.py", "tests/browser_smoke.py", "tests/test_training_engine.cjs",
    "team_worker.py", "teams/__init__.py", "teams/aapl_team.py", "teams/tsla_team.py",
    "teams/spy_team.py", "teams/qqq_team.py", "teams/orchestrator.py",
    "world-3d.js", "council.py", "council-ui.js", "council.css", "trading_records.py", "import_trade_records.py",
    "settings-ui.js", "settings.css", "app_settings.py", "package_build.py", "team_specs.py", "specialist_engine.py", "entry_controls.py",
    "futures_worker.py", "manager_hierarchy.py", "manager_ai.py", "manager_worker.py",
    "teams/nq_team.py", "teams/es_team.py", "teams/mgc_team.py", "teams/mnq_team.py", "teams/mes_team.py", "teams/gc_team.py",
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
