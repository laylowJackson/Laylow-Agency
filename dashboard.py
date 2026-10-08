"""Read-only web view of supervisor and worker observations."""
from contextlib import closing
from pathlib import Path
import sqlite3

from flask import Flask, jsonify, send_file
from config import DB_PATH, DASHBOARD_HOST, DASHBOARD_PORT, ROOT_DIR
from dashboard_status import build_dashboard_payload
from db_utils import ensure_system_tables


def create_app(db_path=None):
    application = Flask(__name__, static_folder=None)
    database_path = str(db_path if db_path is not None else DB_PATH)
    application.config["DATABASE_PATH"] = database_path
    try:
        ensure_system_tables(db_path=database_path)
    except sqlite3.Error:
        application.logger.exception("Could not initialize the status database")

    @application.after_request
    def response_headers(response):
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @application.get("/")
    def index():
        return send_file(Path(ROOT_DIR) / "index.html", conditional=False)

    @application.get("/api/status")
    def status():
        try:
            payload = build_dashboard_payload(db_path=application.config["DATABASE_PATH"])
            return jsonify(payload), (200 if payload["database_available"] else 503)
        except Exception:
            application.logger.exception("Could not read dashboard status")
            return jsonify({"error": "status_unavailable",
                            "message": "The status database cannot be read. Check the runner log."}), 503

    @application.get("/healthz")
    def health():
        path = Path(application.config["DATABASE_PATH"]).resolve()
        try:
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
                connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
            return jsonify({"status": "ok", "database": "readable"})
        except (sqlite3.Error, OSError, ValueError):
            return jsonify({"status": "unavailable", "database": "unreadable"}), 503

    return application


def main():
    application = create_app()
    print(f"[DASHBOARD] http://{DASHBOARD_HOST}:{DASHBOARD_PORT}", flush=True)
    try:
        from waitress import serve
    except ImportError:
        application.run(host=DASHBOARD_HOST, port=DASHBOARD_PORT, debug=False, use_reloader=False)
    else:
        serve(application, host=DASHBOARD_HOST, port=DASHBOARD_PORT)


if __name__ == "__main__":
    main()
