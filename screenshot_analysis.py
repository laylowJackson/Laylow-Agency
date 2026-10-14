"""Two review layers. No provider calls, trade signals, or broker side effects.

AI is deliberately disconnected until a server-side provider is configured.
Screenshot pixels are never converted into an OHLC backtest or monetary P&L.
"""
import math

LIMITATION = "Screenshot analysis provides visual estimates. Use OHLC data and explicit strategy rules for reliable backtesting or live execution."


def extraction_layer(images):
    """Conservative extraction envelope; an unavailable model leaves fields unknown."""
    return {
        "provider": None, "analysis_kind": "visual_estimation", "confidence": 0.0,
        "instrument": None, "entry_timeframe": None, "higher_timeframe": None,
        "direction": None, "entry": {"value": None, "estimated": True},
        "stop": {"value": None, "estimated": True}, "target_1": {"value": None, "estimated": True},
        "targets": [], "reward_risk": None, "outcome": "unknown", "outcome_evidence": None,
        "visible_conditions": [], "missing_conditions": [], "invalidation": None,
        "chart_quality": "unassessed", "annotations": [], "drawn_trade": None,
        "suggested_setup": None,
        "screenshots": [{"role": i["role"], "width": i["width"], "height": i["height"],
                         "chart_region": None, "price_scale": None, "time_axis": None,
                         "candles": [], "swing_highs": [], "swing_lows": [],
                         "structure": None, "visible_annotations": []} for i in images],
        "explanation": "AI is not connected. No chart pattern, price, or outcome was automatically inferred. Add manual estimates and supported observations to prepare a review.",
        "analysis_limitations": ["AI not connected", "No automatic candle or annotation detection",
                                 "Pre-entry knowledge has not been established", LIMITATION],
    }


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def strategy_layer(values, rules=None):
    """Evaluate explicit, pre-entry observations; a tag alone is not a rule set."""
    entry, stop, target = (values.get(k) for k in ("entry_value", "stop_value", "target_value"))
    direction = values.get("direction")
    geometry = all(finite(v) and v > 0 for v in (entry, stop, target)) and (
        direction == "LONG" and stop < entry < target or direction == "SHORT" and target < entry < stop)
    rr = round(abs(target-entry)/abs(entry-stop), 4) if geometry else None
    result = {"reward_risk": rr, "geometry_valid": bool(geometry), "status": "descriptive_only",
              "matched_conditions": [], "missing_conditions": [], "unverified_conditions": [],
              "explanation": "No explicit strategy rules supplied. Strategy labels do not prove a setup."}
    if not rules:
        return result
    if not isinstance(rules, dict) or set(rules) - {"required_conditions", "min_reward_risk"}:
        raise ValueError("Use required_conditions and optional min_reward_risk")
    required = rules.get("required_conditions", [])
    minimum = rules.get("min_reward_risk")
    if not isinstance(required, list) or len(required) > 20 or not all(isinstance(x, str) and 0 < len(x) <= 120 for x in required):
        raise ValueError("Invalid strategy conditions")
    if minimum is not None and (not finite(minimum) or not 0 < minimum <= 100):
        raise ValueError("Invalid reward/risk rule")
    conditions = values.get("conditions", [])
    for name in required:
        seen = next((c for c in conditions if c.get("label", "").casefold() == name.casefold()), None)
        if seen is None:
            result["missing_conditions"].append(name)
        elif seen.get("timing") != "pre_entry":
            result["unverified_conditions"].append(name)
        else:
            result["matched_conditions"].append(name)
    if minimum is not None and (rr is None or rr < minimum):
        result["missing_conditions"].append("Valid geometry and minimum reward/risk")
    result["status"] = "needs_evidence" if result["missing_conditions"] or result["unverified_conditions"] else "user_observations_match"
    result["explanation"] = "Checked only user-marked pre-entry observations. This is not an execution signal or a backtest."
    return result
