"""Explicit execution configuration. LIVE fails closed regardless of .env values."""
import os
from broker_adapter import safe_mode, ExecutionMode, BrokerRouter


def load_execution_settings():
    mode = safe_mode(os.getenv("LAYLOW_EXECUTION_MODE", "PRACTICE").strip().upper())
    shadow_value = os.getenv("LAYLOW_SHADOW_MODE", "true").strip().lower()
    if shadow_value not in {"true", "false"}: raise ValueError("LAYLOW_SHADOW_MODE must be true or false")
    return dict(execution_mode=mode.value, shadow=shadow_value == "true")


def build_router(settings, db_path=None):
    mode = safe_mode(settings.get("execution_mode", "PRACTICE"))
    if mode is ExecutionMode.PRACTICE:
        from broker_practice import PracticeAdapter
        return BrokerRouter([PracticeAdapter(db_path)])
    if not settings.get("alpaca_key") or not settings.get("alpaca_secret"):
        raise ValueError("Paper broker credentials are missing")
    if not settings.get("shadow", True) and settings.get("paper_enabled") is not True:
        raise ValueError("Paper submission requires explicit LAYLOW_ALLOW_PAPER_ORDERS=true")
    from broker_alpaca import AlpacaPaperAdapter
    return BrokerRouter([AlpacaPaperAdapter(settings["alpaca_key"], settings["alpaca_secret"])])
