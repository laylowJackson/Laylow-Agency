"""One read-only manager per team, reporting to a read-only Big Manager."""
from datetime import datetime, timezone
from config import TEAM_NAMES, STOCK_TEAM_NAMES
from entry_controls import parse_utc

SEVERITY = {"INFO": 0, "CAUTION": 1, "CRITICAL": 2}

class TeamManager:
    def __init__(self, team_name):
        self.team_name = team_name

    def assess(self, worker, analysis, controls, ledger, mode, now):
        findings, severity = [], "INFO"
        def flag(level, message):
            nonlocal severity
            if SEVERITY[level] > SEVERITY[severity]:
                severity = level
            findings.append(message)
        state = worker.get("worker_state", "NOT_STARTED")
        if worker.get("health") != "fresh" or state in {"ERROR", "FAILED", "STOPPED", "NOT_STARTED"}:
            flag("CRITICAL", "Worker is missing, stale, stopped, or reporting an error")
        if not controls.get("enabled"):
            flag("CAUTION", "Team is disabled")
        if self.team_name in STOCK_TEAM_NAMES and controls.get("entry_locked"):
            if mode == "paper" or controls.get("headline_locked"):
                flag("CAUTION", "Entries blocked: " + controls.get("lock_reason", "event lock"))
        if ledger.get("pending_or_uncertain", 0):
            flag("CRITICAL", "Pending or uncertain order intent requires broker reconciliation")
        if state == "WAITING_CONFIGURATION":
            flag("CAUTION", "Worker is awaiting configuration")
        elif mode != "observe":
            try:
                age = (now - parse_utc(analysis.get("bar_time"))).total_seconds()
                if age < -30 or age > 300:
                    flag("CAUTION", "Specialist source bars are stale")
            except (ValueError, TypeError, OverflowError):
                flag("CAUTION", "Specialist bar timestamp unavailable")
            if analysis.get("state") != "READY":
                flag("CAUTION", analysis.get("reason", "Specialist analysis unavailable"))
        if not findings:
            findings.append("Observe standby; analysis awaits configuration" if mode == "observe"
                            else "Recorded health checks have no reported issue")
        indicators = analysis.get("indicators", {})
        return {"team_name": self.team_name, "kind": "team_manager",
                "manager_name": self.team_name + " Team Manager", "engine": "rules",
                "severity": severity, "status": severity, "generated_at": now.isoformat(),
                "summary": "; ".join(findings), "findings": findings,
                "worker_health": {"state": state, "heartbeat_fresh": worker.get("health") == "fresh",
                                  "pid": worker.get("pid")},
                "bot_votes": analysis.get("votes", []),
                "consensus": {"direction": analysis.get("direction"), "agreement": analysis.get("agreement"),
                              "required": analysis.get("required")},
                "atr": {"value": indicators.get("atr")}, "rvol": {"value": indicators.get("relative_volume")},
                "lockout": controls, "execution_health": ledger,
                "analysis_updated_at": analysis.get("updated_at")}

def build_manager_reports(status_payload, analyses, controls, ledger_summary, now=None):
    current = parse_utc(now) if now is not None else datetime.now(timezone.utc)
    teams = {team["name"]: team for team in status_payload.get("teams", [])}
    mode = status_payload.get("mode", "observe")
    reports = [TeamManager(name).assess(teams.get(name, {}), analyses.get(name, {}),
               controls.get(name, {}), ledger_summary.get(name, {}), mode, current) for name in TEAM_NAMES]
    severity = max((row["severity"] for row in reports), key=SEVERITY.get)
    attention = [row for row in reports if row["severity"] != "INFO"]
    big = {"team_name": "BIG_MANAGER", "kind": "big_manager", "manager_name": "Big Manager",
           "engine": "rules", "ai_status": "disabled", "severity": severity, "status": severity,
           "generated_at": current.isoformat(), "team_count": len(reports),
           "summary": str(len(attention)) + " of "+str(len(TEAM_NAMES))+" teams need attention" if attention
                      else "All "+str(len(TEAM_NAMES))+" team reports have no reported issue",
           "reports": [{"team_name": row["team_name"], "severity": row["severity"],
                        "summary": row["summary"]} for row in reports],
           "severity_counts": {level: sum(row["severity"] == level for row in reports) for level in SEVERITY}}
    return reports + [big]
