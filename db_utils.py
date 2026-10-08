"""Shared SQLite schema and transactional status writes."""
import math
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from config import DB_PATH, ROOT_DIR


def database_path(db_path=None):
    value = str(DB_PATH if db_path is None else db_path)
    if value == ":memory:":
        raise ValueError("Status helpers require a file database")
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT_DIR / path
    return str(path.resolve())


def utc_now():
    return datetime.now(timezone.utc).isoformat()


class ClosingConnection(sqlite3.Connection):
    """Commit or roll back on context exit, then release Windows file handles."""
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


def connect_db(db_path=None):
    path = database_path(db_path)
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10, factory=ClosingConnection)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


LEGACY_COLUMNS = {
    "team_status": {
        "team_name": "TEXT", "status": "TEXT DEFAULT 'NOT_STARTED'",
        "active": "INTEGER DEFAULT 0", "last_heartbeat": "TEXT",
        "notes": "TEXT DEFAULT ''", "created_at": "TEXT", "updated_at": "TEXT",
    },
    "team_scores": {
        "team_name": "TEXT", "score": "REAL", "wins": "INTEGER DEFAULT 0",
        "losses": "INTEGER DEFAULT 0", "streak": "INTEGER DEFAULT 0",
        "last_updated": "TEXT", "cool_down_until": "TEXT",
        "is_disabled": "INTEGER DEFAULT 0",
    },
    "learning_log": {"team_name": "TEXT", "timestamp": "TEXT", "summary": "TEXT"},
    "system_events": {
        "team_name": "TEXT", "event_type": "TEXT", "details": "TEXT", "created_at": "TEXT",
    },
}


def ensure_system_tables(db_path=None):
    with closing(connect_db(db_path)) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            for table, columns in LEGACY_COLUMNS.items():
                definitions = ", ".join(f"{name} {kind}" for name, kind in columns.items())
                conn.execute(f"CREATE TABLE IF NOT EXISTS {table} "
                             f"(id INTEGER PRIMARY KEY AUTOINCREMENT, {definitions})")
                existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
                for name, kind in columns.items():
                    if name not in existing:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")
            for table in ("team_status", "team_scores"):
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_team ON {table}(team_name)")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS worker_status (
                    team_name TEXT PRIMARY KEY, state TEXT NOT NULL,
                    notes TEXT DEFAULT '', pid INTEGER, last_heartbeat TEXT,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS process_status (
                    name TEXT PRIMARY KEY, pid INTEGER, status TEXT NOT NULL,
                    exit_code INTEGER, restarts INTEGER DEFAULT 0, notes TEXT,
                    last_heartbeat TEXT, updated_at TEXT
                )
            """)

            for table in ("team_analysis", "manager_reports"):
                conn.execute(f"""CREATE TABLE IF NOT EXISTS {table} (
                    team_name TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)""")
            conn.execute("""CREATE TABLE IF NOT EXISTS team_controls (
                team_name TEXT PRIMARY KEY, headline_locked INTEGER NOT NULL DEFAULT 0,
                earnings_at TEXT, updated_at TEXT NOT NULL)""")


def _write_connection(db_path=None):
    ensure_system_tables(db_path)
    conn = connect_db(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        return conn
    except sqlite3.Error:
        conn.close()
        raise


def _name(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 128:
        raise ValueError("A nonempty name of at most 128 characters is required")
    return value.strip()


def _latest_rowid(conn, table, team_name):
    row = conn.execute(f"SELECT rowid AS canonical_rowid FROM {table} "
                       "WHERE team_name=? ORDER BY rowid DESC LIMIT 1", (team_name,)).fetchone()
    return row["canonical_rowid"] if row else None


def ensure_team_control(team_name, db_path=None):
    team_name = _name(team_name)
    with closing(_write_connection(db_path)) as conn, conn:
        if _latest_rowid(conn, "team_status", team_name) is None:
            now = utc_now()
            conn.execute("INSERT INTO team_status "
                         "(team_name,status,active,last_heartbeat,notes,created_at,updated_at) "
                         "VALUES (?, 'ENABLED', 1, NULL, '', ?, ?)", (team_name, now, now))


def upsert_team_status(team_name, status="RUNNING", active=1, notes="",
                       heartbeat=None, db_path=None):
    team_name, status = _name(team_name), _name(status)
    now = utc_now()
    heartbeat = now if heartbeat is None else heartbeat
    with closing(_write_connection(db_path)) as conn, conn:
        rowid = _latest_rowid(conn, "team_status", team_name)
        if rowid is None:
            conn.execute("INSERT INTO team_status "
                         "(team_name,status,active,last_heartbeat,notes,created_at,updated_at) "
                         "VALUES (?,?,?,?,?,?,?)",
                         (team_name, status, int(bool(active)), heartbeat, str(notes), now, now))
        else:
            conn.execute("UPDATE team_status SET status=?,active=?,last_heartbeat=?,"
                         "notes=?,updated_at=? WHERE rowid=?",
                         (status, int(bool(active)), heartbeat, str(notes), now, rowid))


def upsert_team_scores(team_name, score=0, wins=0, losses=0, streak=0,
                       is_disabled=0, cool_down_until="", db_path=None):
    team_name, score = _name(team_name), float(score)
    if not math.isfinite(score):
        raise ValueError("Score must be finite")
    now = utc_now()
    values = (score, int(wins), int(losses), int(streak), now,
              cool_down_until or now, int(bool(is_disabled)))
    with closing(_write_connection(db_path)) as conn, conn:
        rowid = _latest_rowid(conn, "team_scores", team_name)
        if rowid is None:
            conn.execute("INSERT INTO team_scores "
                         "(team_name,score,wins,losses,streak,last_updated,cool_down_until,is_disabled) "
                         "VALUES (?,?,?,?,?,?,?,?)", (team_name,) + values)
        else:
            conn.execute("UPDATE team_scores SET score=?,wins=?,losses=?,streak=?,"
                         "last_updated=?,cool_down_until=?,is_disabled=? WHERE rowid=?",
                         values + (rowid,))


def record_worker_status(team_name, state, notes="", pid=None, heartbeat=None, db_path=None):
    team_name, state = _name(team_name), _name(state)
    now = utc_now()
    heartbeat = now if heartbeat is None else heartbeat
    with closing(_write_connection(db_path)) as conn, conn:
        conn.execute("""
            INSERT INTO worker_status (team_name,state,notes,pid,last_heartbeat,updated_at)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(team_name) DO UPDATE SET state=excluded.state,notes=excluded.notes,
                pid=excluded.pid,last_heartbeat=excluded.last_heartbeat,updated_at=excluded.updated_at
        """, (team_name, state, str(notes), pid, heartbeat, now))


def upsert_process_status(name, pid, status, exit_code=None, restarts=0, notes="", db_path=None):
    name, status = _name(name), _name(status)
    restarts = int(restarts)
    if restarts < 0:
        raise ValueError("Restarts must be nonnegative")
    now = utc_now()
    with closing(_write_connection(db_path)) as conn, conn:
        conn.execute("""
            INSERT INTO process_status
                (name,pid,status,exit_code,restarts,notes,last_heartbeat,updated_at)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(name) DO UPDATE SET pid=excluded.pid,status=excluded.status,
                exit_code=excluded.exit_code,restarts=excluded.restarts,notes=excluded.notes,
                last_heartbeat=excluded.last_heartbeat,updated_at=excluded.updated_at
        """, (name, pid, status, exit_code, restarts, str(notes), now, now))


def record_system_event(team_name, event_type, details="", db_path=None):
    """Append a real state transition for dashboard history."""
    team_name, event_type = _name(team_name), _name(event_type)
    with closing(_write_connection(db_path)) as conn, conn:
        conn.execute("INSERT INTO system_events (team_name,event_type,details,created_at) "
                     "VALUES (?,?,?,?)", (team_name,event_type,str(details),utc_now()))

def save_analysis(team_name, payload, db_path=None):
    payload = dict(payload, updated_at=utc_now())
    encoded = json.dumps(payload, allow_nan=False)
    with _write_connection(db_path) as connection:
        connection.execute("""INSERT INTO team_analysis (team_name,payload_json,updated_at) VALUES (?,?,?)
            ON CONFLICT(team_name) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at""",
                           (team_name, encoded, payload["updated_at"]))
