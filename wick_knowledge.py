"""Completed OHLC evidence for specialists. No order, signal or outcome inference."""
import math
from datetime import timedelta
from entry_controls import parse_utc


def review_candles(bars, observed_at, *, source, duration_seconds=None, chart_type=None):
    result = dict(version=1, available=False, candle_time=None, metrics=None,
                  shape=None, pattern=None, entry_evidence=False, signal=None,
                  outcome="unknown", confidence=None, provenance="provider_ohlc",
                  summary="Candle evidence unavailable: interval or chart type is unverified.",
                  limitations=["OHLC does not reveal which extreme happened first.",
                               "No wick-only signal or inferred trade outcome."])
    if (chart_type != "standard" or isinstance(duration_seconds, bool)
            or not isinstance(duration_seconds, (int, float))
            or not math.isfinite(duration_seconds) or duration_seconds <= 0):
        return result
    cutoff = parse_utc(observed_at)
    rows, previous = [], None
    for bar in bars:
        stamp = parse_utc(bar.get("timestamp"))
        if previous is not None and stamp <= previous:
            return result
        previous = stamp
        if stamp + timedelta(seconds=duration_seconds) > cutoff or bar.get("closed") is False:
            continue
        values = [bar.get(k) for k in ("open", "high", "low", "close")]
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
            return result
        o, h, low, c = values
        if h < max(o, c, low) or low > min(o, c):
            return result
        rows.append(bar)
    if not rows:
        result["summary"] = "No completed candle available at the decision cutoff."
        return result
    candle = rows[-1]
    o, h, low, c = [candle[k] for k in ("open", "high", "low", "close")]
    body, span = abs(c-o), h-low
    upper, lower = h-max(o, c), min(o, c)-low
    m = dict(valid=True, body=body, range=span, upper_wick=upper, lower_wick=lower,
             upper_body_ratio=upper/body if body else None,
             lower_body_ratio=lower/body if body else None,
             close_location=(c-low)/span if span else None,
             body_fraction=body/span if span else None)
    prior = rows[-6:-1]
    average = sum(b["close"] for b in prior)/len(prior) if prior else None
    trend = ("up" if prior[-1]["close"] > average else "down" if prior[-1]["close"] < average else "unknown") if len(prior) == 5 else "unknown"
    shape, pattern = "Body and wicks measured", None
    if not span:
        shape = "No range"
    elif body/span <= .05:
        shape = "Doji-like"
    elif lower >= 2*body and upper <= .1*span and body/span <= .3:
        shape = "Long lower wick"
        pattern = {"down": "Possible hammer", "up": "Possible hanging man"}.get(trend)
    elif upper >= 2*body and lower <= .1*span and body/span <= .3:
        shape = "Long upper wick"
        pattern = {"up": "Possible shooting star", "down": "Possible inverted hammer"}.get(trend)
    elif upper > body and lower > body:
        shape = "Two-sided wicks / small body"
    result.update(available=True, candle_time=parse_utc(candle["timestamp"]).isoformat(),
                  as_of=cutoff.isoformat(), source=source, metrics=m, shape=shape,
                  pattern=pattern, prior_trend=trend, entry_evidence=True,
                  summary=f"{pattern or shape}; upper wick {upper:.4f}, lower wick {lower:.4f}, body {body:.4f}. Completed provider candle; context only, not a trade signal.")
    result["limitations"].append("Pattern thresholds and five-bar prior trend are heuristics; a wick does not prove a structure break, liquidity sweep or supply/demand zone.")
    return result
