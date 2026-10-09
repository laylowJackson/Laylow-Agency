"""Verify local prerequisites without printing secrets or contacting providers."""
import importlib.util
import sys

from config import DB_PATH, DASHBOARD_HOST, DASHBOARD_PORT
from db_utils import ensure_system_tables
from team_worker import load_settings, missing_settings


def main():
    if sys.version_info < (3, 11):
        print("Python 3.11 or newer is required.")
        return 1
    missing = [name for name in ("flask", "waitress", "dotenv", "openai", "alpaca")
               if importlib.util.find_spec(name) is None]
    if missing:
        print("Missing packages: " + ", ".join(missing) + ". Run setup.")
        return 1
    try:
        ensure_system_tables()
        settings = load_settings()
    except Exception as error:
        print("Setup failed (" + type(error).__name__ + "). Check paths and mode values.")
        return 1
    print("Database: " + str(DB_PATH))
    print("Dashboard: http://" + DASHBOARD_HOST + ":" + str(DASHBOARD_PORT))
    print("Mode: " + settings["mode"])
    for label, key in (("OpenAI key", "openai_key"), ("Alpaca key", "alpaca_key"),
                       ("Alpaca secret", "alpaca_secret")):
        print(label + ": " + ("configured" if settings[key] else "blank"))
    waiting = missing_settings(settings)
    if waiting:
        print("Workers will wait for: " + ", ".join(waiting))
    print("Teams: 4 stock + 6 futures watch teams; 10 Team Managers and a six-member Council.")
    print("Futures CSV directory: " + ("configured" if __import__("os").getenv("LAYLOW_FUTURES_CSV_DIR", "").strip() else "blank"))
    print("Setup checks passed. No provider requests or orders were made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
