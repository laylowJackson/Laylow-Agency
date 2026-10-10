"""Broker-neutral records and routing. No live implementation exists."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from enum import Enum


class ExecutionMode(str, Enum):
    PRACTICE = "PRACTICE"
    PAPER = "PAPER"
    LIVE = "LIVE"


class LiveLockedError(ValueError):
    pass


def safe_mode(value):
    mode = ExecutionMode(value)
    if mode is ExecutionMode.LIVE:
        raise LiveLockedError("LIVE is hard locked in this build; no live adapter or unlock switch exists")
    return mode


def money(value):
    if isinstance(value, bool):
        raise ValueError("Boolean is not a price")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError("Invalid decimal") from None
    if not result.is_finite():
        raise ValueError("Nonfinite decimal")
    return result


def timestamp(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timezone-aware timestamp required")
    return value.astimezone(timezone.utc)


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: str


@dataclass(frozen=True)
class BrokerOrder:
    client_order_id: str
    broker_order_id: str
    symbol: str
    status: str
    qty: int
    side: str = "LONG"
    filled_qty: str = "0"
    filled_price: str | None = None


@dataclass(frozen=True)
class BrokerSnapshot:
    account_id: str
    equity: str
    day_start_equity: str
    buying_power: str
    trading_blocked: bool
    market_open: bool
    quote_bid: str
    quote_ask: str
    quote_at: str
    captured_at: str
    tradable: bool
    shortable: bool
    positions: tuple[Position, ...] = ()
    open_orders: tuple[BrokerOrder, ...] = ()


@dataclass(frozen=True)
class TradePlan:
    client_order_id: str
    decision_id: str
    team: str
    symbol: str
    broker: str
    account_id: str
    mode: str
    side: str
    qty: int
    entry_reference: str
    stop: str
    target: str
    estimated_risk: str
    notional: str
    signal_at: str
    created_at: str
    reserved_buying_power: str = "0"
    policy_version: str = "central-risk-v1"

    def payload(self):
        return asdict(self)


class BrokerAdapter(ABC):
    mode: ExecutionMode
    broker_id: str
    account_id: str
    symbols: frozenset[str]

    @abstractmethod
    def snapshot(self, symbol) -> BrokerSnapshot: ...

    @abstractmethod
    def lookup(self, client_order_id) -> BrokerOrder | None:
        """None means authoritative not-found. Network/auth errors must raise."""

    @abstractmethod
    def submit(self, plan: TradePlan) -> BrokerOrder: ...


class BrokerRouter:
    def __init__(self, adapters=(), routes=None):
        self.adapters = {}
        for adapter in adapters:
            mode = safe_mode(adapter.mode)
            key = (mode.value, adapter.broker_id)
            if key in self.adapters:
                raise ValueError("Duplicate broker route")
            self.adapters[key] = adapter
        self.routes = dict(routes or {})

    def resolve(self, symbol, mode):
        mode = safe_mode(mode)
        broker = self.routes.get((mode.value, symbol))
        candidates = [a for (m, b), a in self.adapters.items()
                      if m == mode.value and symbol in a.symbols and (broker is None or b == broker)]
        if len(candidates) != 1:
            raise ValueError("No unambiguous supported broker route for this symbol/mode")
        adapter = candidates[0]
        if safe_mode(adapter.mode) != mode:
            raise ValueError("Broker mode mismatch")
        return adapter
