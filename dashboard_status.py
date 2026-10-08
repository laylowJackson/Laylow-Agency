"""Read-only dashboard snapshots of observed workers and supervisor records."""
import json
import math
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from config import HEARTBEAT_STALE_SECONDS, LAYLOW_MODE, ROOT_DIR, TEAM_NAMES
from db_utils import database_path
from entry_controls import assess_controls
from team_specs import TEAM_SPECS


def _now(value=None):
    value = value or datetime.now(timezone.utc)
    if not isinstance(value, datetime):
        raise TypeError("now must be a datetime")
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _heartbeat_health(heartbeat, now):
    if heartbeat is None or not str(heartbeat).strip():
        return "missing", None
    try:
        timestamp = datetime.fromisoformat(str(heartbeat).replace("Z", "+00:00"))
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            return "invalid", None
        age = (now - timestamp.astimezone(timezone.utc)).total_seconds()
        if not math.isfinite(age) or age < 0:
            return "invalid", None
    except (ValueError, TypeError, OverflowError):
        return "invalid", None
    return ("fresh" if age <= HEARTBEAT_STALE_SECONDS else "stale"), round(age, 3)


def _read_rows(conn, table, limit=None):
    exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                          (table,)).fetchone()
    if not exists:
        return []
    if limit is None:
        rows = conn.execute(f"SELECT rowid AS _rowid,* FROM {table} ORDER BY rowid").fetchall()
    else:
        rows = conn.execute(f"SELECT rowid AS _rowid,* FROM {table} "
                            "ORDER BY rowid DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def _latest_by(rows, key):
    result = {}
    for row in rows:
        name = row.get(key)
        if isinstance(name, str) and name.strip():
            result[name] = row
    return result


def _flag(value):
    return value is True or value == 1 or value == "1"


def _score(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError, OverflowError):
        return None

def _json_records(rows):
    records = {}
    for row in rows:
        try:
            parsed = json.loads(row["payload_json"])
            if isinstance(parsed, dict):
                parsed["updated_at"] = row.get("updated_at")
                records[row["team_name"]] = parsed
        except (ValueError, TypeError, KeyError):
            continue
    return records


def build_dashboard_payload(db_path=None, now=None):
    """Read one transaction; missing files are not created and old rows remain intact."""
    explicit_now = now
    now = _now(now)
    path = database_path(db_path)
    data = {name: [] for name in
            ("team_status","team_scores","worker_status","process_status","system_events",
             "team_analysis","team_controls","manager_reports","paper_orders")}
    errors, available = [], False
    if path != ":memory:" and Path(path).is_file():
        try:
            with closing(sqlite3.connect(Path(path).as_uri() + "?mode=ro",
                                         uri=True, timeout=5)) as conn:
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA query_only = ON")
                conn.execute("BEGIN")
                for table in data:
                    data[table] = _read_rows(conn, table, 20 if table == "system_events" else None)
                available = True
        except (sqlite3.Error, OSError):
            data = {table: [] for table in data}
            errors.append({"source":"status_database","message":"Status database cannot be read"})
    else:
        errors.append({"source":"status_database","message":"Status database has not been created"})

    if explicit_now is None:
        now = _now()
    controls = _latest_by(data["team_status"], "team_name")
    scores = _latest_by(data["team_scores"], "team_name")
    workers = _latest_by(data["worker_status"], "team_name")
    names = list(dict.fromkeys(TEAM_NAMES + sorted(set(controls) | set(scores) | set(workers))))
    analyses = _json_records(data["team_analysis"])
    managers = _json_records(data["manager_reports"])
    entry_controls = _latest_by(data["team_controls"], "team_name")
    ledger = {}
    for row in data["paper_orders"]:
        name = row.get("team_name")
        summary = ledger.setdefault(name, {"order_count": 0, "pending_or_uncertain": 0})
        summary["order_count"] += 1
        summary["pending_or_uncertain"] += str(row.get("status")).upper() in {"PENDING", "UNCERTAIN"}
        summary["latest_status"] = row.get("status")
    teams = []
    for name in names:
        control, score, worker = controls.get(name, {}), scores.get(name, {}), workers.get(name, {})
        heartbeat = worker.get("last_heartbeat")
        health, age = _heartbeat_health(heartbeat, now)
        enabled = (_flag(control.get("active"))
                   and str(control.get("status","")).upper() not in {"DISABLED","PAUSED","STOPPED"}
                   and not _flag(score.get("is_disabled")))
        teams.append({
            "name":name, "enabled":enabled,
            "controls":assess_controls(name, entry_controls.get(name), enabled, now),
            "analysis":analyses.get(name), "specialists":TEAM_SPECS.get(name, {}),
            "execution_health":ledger.get(name, {"order_count":0,"pending_or_uncertain":0}), "worker_state":worker.get("state") or "NOT_STARTED",
            "health":health, "heartbeat":heartbeat, "heartbeat_age_seconds":age,
            "pid":worker.get("pid"), "notes":worker.get("notes") or control.get("notes") or "",
            "score":_score(score.get("score")),
            "score_source":"legacy_unverified" if score else None,
            "control_status":control.get("status"), "updated_at":worker.get("updated_at"),
        })
    processes = []
    for row in data["process_status"]:
        process = {key:row.get(key) for key in
                   ("name","pid","status","exit_code","restarts","notes","last_heartbeat","updated_at")}
        process["notes"] = process["notes"] or ""
        process["health"], process["heartbeat_age_seconds"] = _heartbeat_health(
            process["last_heartbeat"], now)
        processes.append(process)
    processes.sort(key=lambda item:str(item["name"] or ""))
    events = [{key:row.get(key,row.get("_rowid") if key=="id" else None)
               for key in ("id","team_name","event_type","details","created_at")}
              for row in data["system_events"]]
    managed = [team for team in teams if team["name"] in TEAM_NAMES]
    summary = {
        "total_teams":len(managed), "observed_teams":len(teams), "enabled_teams":sum(team["enabled"] for team in managed),
        "fresh_workers":sum(team["health"]=="fresh" for team in managed),
        "stale_workers":sum(team["health"]=="stale" for team in managed),
        "missing_workers":sum(team["health"]=="missing" for team in managed),
        "invalid_workers":sum(team["health"]=="invalid" for team in managed),
        "running_processes":sum(str(item["status"]).upper()=="RUNNING" and item["health"]=="fresh"
                                for item in processes),
    }
    return {"generated_at":now.isoformat(), "mode":LAYLOW_MODE, "database_available":available,
            "teams":teams, "managers":[managers[name] for name in TEAM_NAMES if name in managers],
            "big_manager":managers.get("BIG_MANAGER"), "processes":processes, "events":events, "summary":summary, "errors":errors}


def get_dashboard_payload(db_path=None, now=None):
    payload = build_dashboard_payload(db_path=db_path, now=now)
    payload["team_status"] = [
        {"team_name":team["name"], "status":team["worker_state"], "active":team["enabled"],
         "last_heartbeat":team["heartbeat"], "notes":team["notes"],
         "updated_at":team["updated_at"], "health":team["health"]} for team in payload["teams"]]
    payload["strategy_readiness"], payload["backtest_summary"] = [], []
    payload["recent_events"] = payload["events"]
    return payload


def get_team_status_summary(db_path=None):
    return get_dashboard_payload(db_path)["team_status"]


def get_strategy_readiness_summary():
    return []


def get_backtest_summary():
    return []


def get_system_events_summary(limit=20, db_path=None):
    if not isinstance(limit,int) or limit < 0:
        raise ValueError("limit must be a nonnegative integer")
    return build_dashboard_payload(db_path)["events"][:limit]


def save_dashboard_snapshot(path="dashboard_snapshot.json", db_path=None):
    target = Path(path).expanduser()
    if not target.is_absolute():
        target = ROOT_DIR / target
    target.parent.mkdir(parents=True, exist_ok=True)
    payload, temporary = get_dashboard_payload(db_path), None
    try:
        with tempfile.NamedTemporaryFile(mode="w",encoding="utf-8",dir=target.parent,
                                         prefix=target.name+".",suffix=".tmp",delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(payload,handle,indent=2,allow_nan=False)
            handle.write("\n")
        os.replace(temporary,target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return payload


def print_dashboard_summary():
    payload = build_dashboard_payload()
    print("LAYLOW AGENCY - OBSERVED WORKER STATUS")
    print(f"Generated: {payload['generated_at']}")
    for team in payload["teams"]:
        print(f"{team['name']}: {team['worker_state']} | heartbeat={team['health']} "
              f"| enabled={team['enabled']}")
    for error in payload["errors"]:
        print(f"{error['source']}: {error['message']}")


if __name__ == "__main__":
    print_dashboard_summary()

def load_manager_inputs(db_path=None):
    payload = build_dashboard_payload(db_path)
    analyses = {team["name"]: team["analysis"] or {} for team in payload["teams"]}
    controls = {team["name"]: team["controls"] for team in payload["teams"]}
    ledger = {team["name"]: team["execution_health"] for team in payload["teams"]}
    return payload, analyses, controls, ledger
