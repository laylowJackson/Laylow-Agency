"""Review recent recorded analysis without inventing trade outcomes or making AI calls."""
from db_utils import connect_db, ensure_system_tables
from team_worker import ensure_ledger


def main():
    ensure_system_tables()
    ensure_ledger()
    with connect_db() as conn:
        rows = conn.execute(
            "SELECT team_name,direction,action,reason,created_at FROM worker_decisions "
            "ORDER BY created_at DESC LIMIT 20"
        ).fetchall()
    if not rows:
        print("No recorded analysis yet. Add credentials and select analyze mode when ready.")
    for row in rows:
        print(f"{row['created_at']} {row['team_name']} {row['direction']}/{row['action']}: {row['reason']}")
    print("These are analysis records, not verified fills or realized trading results.")


if __name__ == "__main__":
    main()
