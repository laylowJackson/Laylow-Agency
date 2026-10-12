"""Observed worker dashboard with token-protected local event controls."""
from contextlib import closing
from pathlib import Path
import sqlite3
import secrets
from urllib.parse import urlsplit

from flask import Flask, jsonify, send_file, request
from config import DB_PATH, DASHBOARD_HOST, DASHBOARD_PORT, ROOT_DIR
from dashboard_status import build_dashboard_payload
from db_utils import database_path, ensure_system_tables
from entry_controls import update_control
from config import STOCK_TEAM_NAMES


def create_app(db_path=None, settings_path=None):
    application = Flask(__name__, static_folder=None)
    database = database_path(db_path)
    application.config["DATABASE_PATH"] = database
    application.config["CONTROL_CSRF"] = secrets.token_urlsafe(32)
    application.config["MAX_CONTENT_LENGTH"] = 9 * 1024 * 1024
    application.config["BROKER_SETTINGS_PATH"] = Path(settings_path or Path(ROOT_DIR) / ".env.local")
    try:
        ensure_system_tables(db_path=database)
    except sqlite3.Error:
        application.logger.exception("Could not initialize the status database")

    @application.before_request
    def local_host_only():
        if urlsplit(request.host_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
            return jsonify({"error": "local_host_required"}), 403

    @application.before_request
    def bounded_control_requests():
        if not request.path.startswith("/api/reviews") and request.content_length and request.content_length > 4096:
            return jsonify({"error":"request_too_large"}),413

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

    @application.get("/world-3d.js")
    def world_script():
        return send_file(Path(ROOT_DIR) / "world-3d.js",mimetype="text/javascript",conditional=False)

    @application.get("/council-ui.js")
    def council_script():
        return send_file(Path(ROOT_DIR)/"council-ui.js",mimetype="text/javascript",conditional=False)

    @application.get("/council.css")
    def council_styles():
        return send_file(Path(ROOT_DIR)/"council.css",mimetype="text/css",conditional=False)

    @application.get("/practice-engine.js")
    def practice_engine():
        return send_file(Path(ROOT_DIR) / "practice-engine.js", mimetype="text/javascript", conditional=False)

    @application.get("/practice-ui.js")
    def practice_ui():
        return send_file(Path(ROOT_DIR) / "practice-ui.js", mimetype="text/javascript", conditional=False)

    @application.get("/team-offices.js")
    def team_offices():
        return send_file(Path(ROOT_DIR) / "team-offices.js", mimetype="text/javascript", conditional=False)

    @application.get("/wick-knowledge.js")
    def wick_knowledge():
        return send_file(Path(ROOT_DIR) / "wick-knowledge.js", mimetype="text/javascript", conditional=False)

    @application.get("/training-engine.js")
    def training_engine():
        return send_file(Path(ROOT_DIR) / "training-engine.js", mimetype="text/javascript", conditional=False)

    @application.get("/training-ui.js")
    def training_ui():
        return send_file(Path(ROOT_DIR) / "training-ui.js", mimetype="text/javascript", conditional=False)

    @application.get("/settings-ui.js")
    def settings_ui():
        return send_file(Path(ROOT_DIR) / "settings-ui.js", mimetype="text/javascript", conditional=False)

    @application.get("/settings.css")
    def settings_styles():
        return send_file(Path(ROOT_DIR) / "settings.css", mimetype="text/css", conditional=False)

    @application.get("/api/settings")
    def read_settings():
        from app_settings import credential_status
        from execution_config import load_execution_settings
        from dataclasses import asdict
        from risk_engine import RiskPolicy
        try:
            configuration = load_execution_settings()
        except ValueError:
            configuration = {"execution_mode": "UNAVAILABLE", "shadow": True}
        try:
            credentials = credential_status(application.config["BROKER_SETTINGS_PATH"])
        except (OSError, ValueError):
            return jsonify({"error": "settings_unavailable"}), 503
        return jsonify({"local_setup": True, "csrf_token": application.config["CONTROL_CSRF"],
                        "credentials": credentials, "configuration": configuration,
                        "live_locked": True, "risk_policy": {k: str(v) for k, v in asdict(RiskPolicy()).items()}})

    @application.post("/api/settings/broker")
    def broker_settings():
        token = request.headers.get("X-Laylow-CSRF", "")
        origin = request.headers.get("Origin")
        if not secrets.compare_digest(token.encode("utf-8"), application.config["CONTROL_CSRF"].encode("utf-8")) or (
            origin is not None and origin != request.host_url.rstrip("/")
        ):
            return jsonify({"error": "invalid_control_token_or_origin"}), 403
        from app_settings import save_credentials
        try:
            return jsonify(save_credentials(application.config["BROKER_SETTINGS_PATH"], request.get_json(silent=True)))
        except ValueError:
            return jsonify({"error": "invalid_broker_settings"}), 400
        except OSError:
            return jsonify({"error": "settings_write_failed"}), 503

    @application.post("/api/teams/<team_name>/profit-brake")
    def profit_brake(team_name):
        return change_control(team_name,"profit")

    @application.get("/api/status")
    def status():
        try:
            payload = build_dashboard_payload(db_path=application.config["DATABASE_PATH"])
            payload["csrf_token"] = application.config["CONTROL_CSRF"]
            return jsonify(payload), (200 if payload["database_available"] else 503)
        except Exception:
            application.logger.exception("Could not read dashboard status")
            return jsonify({"error": "status_unavailable",
                            "message": "The status database cannot be read. Check the runner log."}), 503

    @application.get("/api/execution")
    def execution_audit():
        from order_store import execution_status
        from execution_config import load_execution_settings
        try:
            payload = execution_status(database)
            payload["configuration"] = load_execution_settings()
            return jsonify(payload)
        except (ValueError, sqlite3.Error):
            return jsonify({"live_locked": True, "error": "execution_configuration_or_database_unavailable"}), 503

    @application.post("/api/teams/<team_name>/headline-lock")
    def headline_lock(team_name):
        return change_control(team_name, "headline")

    @application.post("/api/teams/<team_name>/earnings")
    def earnings(team_name):
        return change_control(team_name, "earnings")

    def change_control(team_name, kind):
        if team_name not in STOCK_TEAM_NAMES:
            return jsonify({"error": "unknown_stock_team"}), 404
        token = request.headers.get("X-Laylow-CSRF", "")
        origin = request.headers.get("Origin")
        if not secrets.compare_digest(token.encode("utf-8"), application.config["CONTROL_CSRF"].encode("utf-8")) or (
            origin is not None and origin != request.host_url.rstrip("/")
        ):
            return jsonify({"error": "invalid_control_token_or_origin"}), 403
        body = request.get_json(silent=True)
        field = "locked" if kind == "headline" else "amount" if kind == "profit" else "earnings_at"
        if not isinstance(body, dict) or set(body) != {field} or (kind == "headline" and type(body.get(field)) is not bool):
            return jsonify({"error": "invalid_control_body"}), 400
        try:
            if kind == "profit":
                from trading_records import set_profit_brake
                set_profit_brake(team_name,body[field],database)
            elif kind == "headline":
                update_control(team_name, headline_locked=body[field], db_path=database)
            else:
                update_control(team_name, earnings_at=body[field], db_path=database)
        except (ValueError, TypeError, OverflowError):
            return jsonify({"error": "invalid_control_value"}), 400
        except sqlite3.Error:
            return jsonify({"error": "control_database_unavailable"}), 503
        return jsonify({"saved": True, "team_name": team_name})

    @application.get("/healthz")
    def health():
        path = Path(application.config["DATABASE_PATH"]).resolve()
        try:
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
                connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
            return jsonify({"status": "ok", "database": "readable"})
        except (sqlite3.Error, OSError, ValueError):
            return jsonify({"status": "unavailable", "database": "unreadable"}), 503

    from screenshot_reviews import register_review_routes
    register_review_routes(application, database, Path(database).parent / "screenshot_reviews")

    @application.get("/screenshot-lab.js")
    @application.get("/training-theater.js")
    @application.get("/screenshot-lab.css")
    def review_static():
        name=request.path.lstrip("/")
        return send_file(Path(ROOT_DIR)/name,mimetype="text/css" if name.endswith(".css") else "text/javascript")

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
