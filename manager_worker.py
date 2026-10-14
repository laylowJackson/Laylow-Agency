"""Run configured team assessments and aggregate them without order authority."""
import argparse
import copy
import json
import logging
import signal
import threading
from db_utils import connect_db, ensure_system_tables
from manager_hierarchy import build_manager_reports
from config import TEAM_NAMES

def save_reports(reports, db_path=None):
    if len(reports) != len(TEAM_NAMES) + 1 or {row["team_name"] for row in reports} != set(TEAM_NAMES) | {"BIG_MANAGER"}:
        raise ValueError(f"Expected {len(TEAM_NAMES)} team reports and one Big Manager")
    prepared = [(row["team_name"], json.dumps(row, allow_nan=False), row["generated_at"]) for row in reports]
    with connect_db(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.executemany("""INSERT INTO manager_reports (team_name,payload_json,updated_at) VALUES (?,?,?)
            ON CONFLICT(team_name) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at""",
                               prepared)

def run_cycle(db_path=None, enricher=None):
    from dashboard_status import load_manager_inputs
    from manager_ai import enrich_big_manager
    ensure_system_tables(db_path)
    payload, analyses, controls, ledger = load_manager_inputs(db_path)
    reports = build_manager_reports(payload, analyses, controls, ledger)
    try:
        enriched = (enricher or enrich_big_manager)(copy.deepcopy(reports[-1]))
        for field in ("ai_summary", "ai_status", "ai_error", "engine", "ai_model"):
            if field in enriched:
                reports[-1][field] = enriched[field]
    except Exception as error:
        reports[-1].update(ai_status="unavailable", ai_error=type(error).__name__)
    save_reports(reports, db_path)
    return reports

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    def shutdown(_signal, _frame):
        stop.set()
    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), shutdown)
    while not stop.is_set():
        try:
            run_cycle()
        except Exception as error:
            logging.error("Manager cycle failed (%s)", type(error).__name__)
        if args.once:
            return
        stop.wait(30)

if __name__ == "__main__":
    main()
