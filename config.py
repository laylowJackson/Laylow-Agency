DB_PATH = "team_status.db"
TEAM_NAMES = ["SPY", "QQQ", "AAPL", "TSLA"]
REFRESH_SECONDS = 300
DASHBOARD_PORT = 5000
WATCHDOG_INTERVAL_SECONDS = 30
STARTUP_PROCESSES = [
    "watchdog.py",
    "runtime_manager.py",
    "dashboard.py",
    "portfolio_manager.py",
    "portfolio_controller.py",
    "teams/orchestrator.py",
]
