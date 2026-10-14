"""Observed worker dashboard with token-protected local event controls."""
from contextlib import closing
from pathlib import Path
import sqlite3
import secrets
from urllib.parse import urlsplit

from flask import Flask, jsonify, send_file, request
from config import DB_PATH, DASHBOARD_HOST, DASHBOARD_PORT, ROOT_DIR, DATA_DIR
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
    application.config["BROKER_SETTINGS_PATH"] = Path(settings_path or Path(DATA_DIR) / ".env.local")
    from live_market_data import LiveMarketData
    application.config["LIVE_MARKET_DATA"] = LiveMarketData(application.config["BROKER_SETTINGS_PATH"])
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

    @application.get("/big-manager-bot.js")
    def big_manager_bot_asset():
        return send_file(Path(ROOT_DIR) / "big-manager-bot.js", mimetype="text/javascript", conditional=False)

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

    @application.get("/live-practice.js")
    def live_practice_script():
        return send_file(Path(ROOT_DIR) / "live-practice.js", mimetype="text/javascript", conditional=False)

    @application.get("/api/market-data")
    def live_market_data():
        origin = request.headers.get("Origin")
        if origin is not None and origin != request.host_url.rstrip("/"):
            return jsonify({"error": "local_origin_required"}), 403
        return jsonify(application.config["LIVE_MARKET_DATA"].snapshot())

    @application.get("/server-practice-ui.js")
    def server_practice_script():
        return send_file(Path(ROOT_DIR) / "server-practice-ui.js", mimetype="text/javascript", conditional=False)

    @application.get("/api/server-practice")
    def server_practice_status():
        from live_practice_worker import read_status
        try:
            return jsonify(read_status(Path(database).parent))
        except (ValueError, OSError, KeyError):
            return jsonify({"available": False, "status": "ERROR", "live_locked": True}), 503

    @application.get("/api/server-practice/bars/<symbol>.csv")
    def server_observed_bars(symbol):
        from live_practice_worker import export_bars
        try:
            response = application.response_class(export_bars(Path(database).parent, symbol), mimetype="text/csv")
            response.headers['Content-Disposition'] = f'attachment; filename="{symbol}-observed-iex-1m.csv"'
            response.headers['X-Laylow-Data-Source'] = 'Alpaca IEX / observed 1-minute OHLC / not verified execution'
            return response
        except ValueError:
            return jsonify({"error": "unsupported_symbol"}), 400
        except (OSError, sqlite3.Error):
            return jsonify({"error": "data_archive_unavailable"}), 503

    @application.post("/api/server-practice/control")
    def server_practice_control():
        origin = request.headers.get("Origin")
        token = request.headers.get("X-Laylow-CSRF", "")
        if not secrets.compare_digest(token.encode(), application.config["CONTROL_CSRF"].encode()) or (origin is not None and origin != request.host_url.rstrip("/")):
            return jsonify({"error": "invalid_control_token_or_origin"}), 403
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {"running"} or type(body["running"]) is not bool:
            return jsonify({"error": "invalid_control"}), 400
        from training_worker import atomic_json
        try:
            atomic_json(Path(database).parent / "live_practice_control.json", body)
        except OSError:
            return jsonify({"error": "control_write_failed"}), 503
        return jsonify({"saved": True, "orders_sent": False, "live_locked": True,
                        "message": "Worker will apply this control on its next cycle; closing the viewer does not pause it."})

    @application.get("/team-offices.js")
    def team_offices():
        return send_file(Path(ROOT_DIR) / "team-offices.js", mimetype="text/javascript", conditional=False)

    @application.get("/wick-knowledge.js")
    def wick_knowledge():
        return send_file(Path(ROOT_DIR) / "wick-knowledge.js", mimetype="text/javascript", conditional=False)

    @application.get("/strategy-research.js")
    def strategy_research_js():
        return send_file(Path(ROOT_DIR) / "strategy-research.js", mimetype="text/javascript", conditional=False)

    @application.get("/strategy-research.css")
    def strategy_research_css():
        return send_file(Path(ROOT_DIR) / "strategy-research.css", mimetype="text/css", conditional=False)

    @application.get("/research-evidence.js")
    @application.get("/entry-research.js")
    @application.get("/exit-research.js")
    @application.get("/historical-research.js")
    @application.get("/historical-research-worker.js")
    @application.get("/research-station-ui.js")
    def research_station_assets():
        # Only these exact routes are registered; this is not an arbitrary file endpoint.
        return send_file(Path(ROOT_DIR) / request.path.lstrip("/"), mimetype="text/javascript", conditional=False)

    @application.get("/training-engine.js")
    def training_engine():
        return send_file(Path(ROOT_DIR) / "training-engine.js", mimetype="text/javascript", conditional=False)

    @application.get("/training-policy.js")
    def training_policy():
        return send_file(Path(ROOT_DIR) / "training-policy.js", mimetype="text/javascript", conditional=False)

    @application.get("/api/training")
    def training_status():
        from training_worker import read_status
        try:
            return jsonify(read_status(Path(database).parent))
        except (OSError, ValueError, KeyError):
            return jsonify({"available": True, "status": "ERROR", "message": "Research state unavailable"}), 503

    @application.post("/api/training/control")
    def training_control():
        token = request.headers.get("X-Laylow-CSRF", "")
        origin = request.headers.get("Origin")
        if not secrets.compare_digest(token.encode("utf-8"), application.config["CONTROL_CSRF"].encode("utf-8")) or (origin is not None and origin != request.host_url.rstrip("/")):
            return jsonify({"error": "invalid_control_token_or_origin"}), 403
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {"paused", "mode"} or type(body["paused"]) is not bool or body["mode"] not in {"auto", "deep"}:
            return jsonify({"error": "invalid_research_control"}), 400
        from training_worker import atomic_json
        try:
            atomic_json(Path(database).parent / "training_control.json", body)
            return jsonify({"saved": True})
        except OSError:
            return jsonify({"error": "research_control_write_failed"}), 503

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
            result = save_credentials(application.config["BROKER_SETTINGS_PATH"], request.get_json(silent=True))
            feed = application.config["LIVE_MARKET_DATA"]
            with feed.lock:
                feed.cache = None
            return jsonify(result)
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

    from dashboard_auth import install_auth
    install_auth(application, database)
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
