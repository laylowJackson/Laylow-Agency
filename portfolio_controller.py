"""Portfolio controls require broker exposure data, not counts of worker processes."""
from portfolio_manager import main

if __name__ == "__main__":
    print("Read-only status monitor. Account exposure/drawdown controls are not configured.")
    main()
