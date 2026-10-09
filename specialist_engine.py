"""Deterministic specialist votes from validated OHLCV bars; no order capability."""
import math
from collections import Counter
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo
from config import STOCK_TEAM_NAMES
from entry_controls import parse_utc
from team_specs import TEAM_SPECS

def validate_bars(bars):
    if not isinstance(bars, list) or len(bars) > 10000:
        raise ValueError("Expected at most 10000 OHLCV bars")
    clean, previous = [], None
    for raw in bars:
        if not isinstance(raw, dict):
            raise ValueError("Each bar must be a dictionary")
        stamp = parse_utc(raw.get("timestamp"))
        values = {}
        for field in ("open", "high", "low", "close", "volume"):
            value = raw.get(field)
            if isinstance(value, bool):
                raise ValueError("Boolean OHLCV value")
            value = float(value)
            if not math.isfinite(value) or value < 0 or (field != "volume" and value == 0):
                raise ValueError("Invalid OHLCV value")
            values[field] = value
        if values["high"] < max(values["open"], values["close"], values["low"]) or values["low"] > min(values["open"], values["close"]):
            raise ValueError("Inconsistent OHLC range")
        if previous is not None and stamp <= previous:
            raise ValueError("Bar timestamps must strictly increase")
        clean.append(dict(values, timestamp=stamp))
        previous = stamp
    return clean

def ema(values, period):
    result = values[0]
    alpha = 2 / (period + 1)
    for value in values[1:]:
        result += alpha * (value - result)
    return result

def evaluate_team(team_name, bars, source="market_data", observed_at=None,
                  max_age_seconds=300, session_start=None):
    spec = TEAM_SPECS[team_name]
    current = parse_utc(observed_at) if observed_at is not None else datetime.now(timezone.utc)
    bars = validate_bars(bars)
    result = {"team_name": team_name, "source": str(source), "observed_at": current.isoformat(),
              "bar_time": bars[-1]["timestamp"].isoformat() if bars else None,
              "direction": "SKIP", "agreement": 0, "required": spec["required"],
              "votes": [], "indicators": {}, "watch_only": team_name not in STOCK_TEAM_NAMES,
              "reason": "Insufficient bars", "state": "INSUFFICIENT_DATA",
              "bars": [dict(row, timestamp=row["timestamp"].isoformat()) for row in bars[-240:]]}
    def skip(reason, state="INSUFFICIENT_DATA"):
        result.update(reason=reason, state=state)
        return result
    if len(bars) < 35:
        return skip("At least 35 bars required")
    age = (current - bars[-1]["timestamp"]).total_seconds()
    if age < -30 or age > max_age_seconds:
        return skip("Latest bar is stale or ahead of the clock", "STALE")
    # Stock VWAP uses today's regular Eastern session, not yesterday's bars.
    if session_start is not None:
        start = parse_utc(session_start)
        session = [bar for bar in bars if bar["timestamp"] >= start]
    elif team_name in STOCK_TEAM_NAMES:
        local = current.astimezone(ZoneInfo("America/New_York"))
        if local.weekday() >= 5 or not time(9,30) <= local.time().replace(tzinfo=None) < time(16):
            return skip("Outside the regular stock session", "WAITING_SESSION")
        session = [bar for bar in bars
                   if bar["timestamp"].astimezone(ZoneInfo("America/New_York")).date() == local.date()
                   and time(9,30) <= bar["timestamp"].astimezone(ZoneInfo("America/New_York")).time().replace(tzinfo=None) < time(16)]
    else:
        # A rolling window is deliberate for CSV futures: no exchange-session inference.
        session = bars[-120:]
    if len(session) < 10:
        return skip("At least 10 current-session bars required")
    closes = [bar["close"] for bar in bars]
    true_ranges = [max(bar["high"] - bar["low"],
                       abs(bar["high"] - bars[index-1]["close"]),
                       abs(bar["low"] - bars[index-1]["close"]))
                   for index, bar in enumerate(bars) if index > 0]
    atr = sum(true_ranges[-14:]) / 14
    total_volume = sum(bar["volume"] for bar in session)
    prior_volume = sum(bar["volume"] for bar in bars[-21:-1]) / 20
    if atr <= 0 or total_volume <= 0 or prior_volume <= 0:
        return skip("ATR and volume must be positive", "INVALID_DATA")
    vwap = sum(((bar["high"]+bar["low"]+bar["close"])/3) * bar["volume"]
               for bar in session) / total_volume
    price = closes[-1]
    fast, slow = ema(closes, 9), ema(closes, 21)
    momentum = price - closes[-6]
    rvol = bars[-1]["volume"] / prior_volume
    extension = abs(price - vwap) / atr
    breakout = price - max(bar["high"] for bar in bars[-21:-1])
    if breakout <= 0:
        breakout = price - min(bar["low"] for bar in bars[-21:-1])
        if breakout >= 0:
            breakout = 0
    trend = fast - slow
    def vote(name, delta, threshold, reason):
        direction = "LONG" if delta > threshold else "SHORT" if delta < -threshold else "SKIP"
        # This bounded evidence score is a formula, not an estimated win probability.
        confidence = min(1.0, abs(delta) / atr / 2) if direction != "SKIP" else 0.0
        return {"name": name, "direction": direction, "confidence": round(confidence, 4),
                "confidence_formula": "min(1, abs(rule_delta) / ATR / 2)", "reason": reason}
    votes = []
    for name in spec["bots"]:
        if name == "Trend":
            row = vote(name, trend, atr*.1, "EMA9 versus EMA21")
        elif name == "VWAP":
            row = vote(name, price-vwap, atr*.1, "Close versus volume-weighted typical price")
        elif name == "Momentum":
            row = vote(name, momentum, atr*.3, "Five-bar price move")
        elif name == "Breakout":
            row = vote(name, breakout, 0, "Close beyond the previous twenty-bar range")
        elif name == "Mean Reversion":
            row = vote(name, vwap-price, atr*1.5, "Deviation beyond 1.5 ATR from rolling VWAP")
        else:
            valid = rvol >= 1 and atr/price <= .03
            row = vote(name, momentum if valid else 0, atr*.3,
                       "Momentum confirmed by RVOL >= 1 and ATR/price <= 3%")
        votes.append(row)
    counts = Counter(row["direction"] for row in votes if row["direction"] != "SKIP")
    direction = max(counts, key=counts.get) if counts else "SKIP"
    agreement = counts.get(direction, 0)
    tied = len(counts) == 2 and counts["LONG"] == counts["SHORT"]
    gates = []
    if agreement < spec["required"] or tied:
        gates.append("Insufficient directional agreement")
    if team_name in STOCK_TEAM_NAMES:
        if rvol < 1:
            gates.append("Relative volume below 1")
        if extension > 2:
            gates.append("Price more than 2 ATR from session VWAP")
        if atr/price > .03:
            gates.append("ATR/price above 3%")
    result.update(votes=votes, agreement=agreement,
                  direction=direction if not gates else "SKIP",
                  state="READY", reason="; ".join(gates) if gates else "Specialist consensus",
                  indicators={"atr": atr, "vwap": vwap, "relative_volume": rvol,
                              "extension_atr": extension, "ema9": fast, "ema21": slow,
                              "vwap_window": "regular_session" if team_name in STOCK_TEAM_NAMES else "rolling_120_bars",
                              "stop_distance": atr * spec["atr_factor"]})
    return result
