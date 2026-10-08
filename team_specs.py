"""Explicit specialist definitions; rule scores are not success probabilities."""
from config import STOCK_TEAM_NAMES, FUTURES_TEAM_NAMES
TEAM_SPECS = {
    "AAPL": {"bots": ["Trend", "VWAP", "Momentum", "Volume Confirmation"], "required": 2, "atr_factor": 1.25},
    "TSLA": {"bots": ["Breakout", "Momentum", "Volume-Volatility", "Trend"], "required": 3, "atr_factor": 1.75},
    "SPY": {"bots": ["Trend", "VWAP", "Momentum"], "required": 2, "atr_factor": 1.25},
    "QQQ": {"bots": ["Trend", "VWAP", "Momentum"], "required": 2, "atr_factor": 1.25},
    "NQ1!": {"bots": ["Trend", "Momentum", "Breakout"], "required": 2, "atr_factor": 1.5},
    "ES1!": {"bots": ["Trend", "VWAP", "Momentum"], "required": 2, "atr_factor": 1.5},
    "MGC1!": {"bots": ["Trend", "Breakout", "Mean Reversion"], "required": 2, "atr_factor": 1.5},
    "MNQ1!": {"bots": ["Trend", "Momentum", "Breakout"], "required": 2, "atr_factor": 1.5},
}
