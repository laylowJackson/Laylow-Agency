"""Single deterministic risk policy, shared by every manager/worker executor."""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from broker_adapter import TradePlan, money, timestamp


@dataclass(frozen=True)
class RiskPolicy:
    max_daily_loss_fraction: Decimal = Decimal(".05")
    max_open_positions: int = 4
    max_daily_trades: int = 20
    max_team_daily_trades: int = 10
    max_signal_age_seconds: int = 300
    max_quote_age_seconds: int = 60
    max_snapshot_age_seconds: int = 30


class RiskEngine:
    def __init__(self, policy=None):
        self.policy = policy or RiskPolicy()

    def evaluate(self, *, team, decision_id, decision, adapter, snapshot, client_id,
                 controls, council_error, reservations=(), daily_trades=0,
                 team_daily_trades=0, now=None):
        now = timestamp(now or datetime.now(timezone.utc))
        p = self.policy
        reasons = []
        plan = None
        if council_error: reasons.append(council_error)
        if controls.get("entry_locked") or not controls.get("enabled"):
            reasons.append("Entry blocked: " + (controls.get("lock_reason") or "Team disabled"))
        if decision.get("direction") not in {"LONG", "SHORT"} or decision.get("action") not in {"APPROVE", "REDUCE_RISK"}:
            reasons.append("Analysis says skip or has an invalid decision")
        try:
            age = (now - timestamp(decision.get("analysis_time"))).total_seconds()
            if not -30 <= age <= p.max_signal_age_seconds: reasons.append("Specialist analysis is stale")
            age = (now - timestamp(snapshot.captured_at)).total_seconds()
            if not -5 <= age <= p.max_snapshot_age_seconds: reasons.append("Broker snapshot is stale")
            age = (now - timestamp(snapshot.quote_at)).total_seconds()
            if not -5 <= age <= p.max_quote_age_seconds: reasons.append("Quote is stale")
            if snapshot.account_id != adapter.account_id: reasons.append("Account identity mismatch")
            if type(snapshot.market_open) is not bool or not snapshot.market_open: reasons.append("Market is closed")
            if type(snapshot.trading_blocked) is not bool or snapshot.trading_blocked: reasons.append("Account is blocked")
            if type(snapshot.tradable) is not bool or not snapshot.tradable: reasons.append("Asset is not tradable")
            if decision.get("direction") == "SHORT" and snapshot.shortable is not True: reasons.append("Asset is not eligible for a short entry")
            equity, previous, power = map(money, (snapshot.equity, snapshot.day_start_equity, snapshot.buying_power))
            bid, ask, distance, atr, vwap = map(money, (snapshot.quote_bid, snapshot.quote_ask,
                decision.get("stop_distance"), decision.get("atr"), decision.get("vwap")))
            if min(equity, previous, power, bid, ask, distance, atr, vwap) <= 0 or ask < bid:
                raise ValueError("Invalid positive account or price data")
            price = (bid + ask) / 2
            if (ask - bid) / price > Decimal(".01"): reasons.append("Quote spread exceeds 1%")
            if equity <= previous * (1 - p.max_daily_loss_fraction): reasons.append("Daily loss limit reached")
            if abs(price - vwap) > 2 * atr: reasons.append("Current quote exceeds the VWAP extension limit")
            reserved_symbols = {r["team_name"] for r in reservations}
            position_symbols = {x.symbol for x in snapshot.positions if money(x.qty) != 0}
            open_symbols = {x.symbol for x in snapshot.open_orders}
            if team in position_symbols: reasons.append("Existing position blocks another entry")
            if team in open_symbols: reasons.append("Open order blocks another entry")
            if team in reserved_symbols: reasons.append("Pending or uncertain order blocks another entry")
            if any(r["status"] in {"SUBMITTING", "UNCERTAIN"} for r in reservations):
                reasons.append("Account requires broker reconciliation")
            if len(position_symbols | open_symbols | reserved_symbols) >= p.max_open_positions:
                reasons.append("Open position limit reached")
            if daily_trades >= p.max_daily_trades or team_daily_trades >= p.max_team_daily_trades:
                reasons.append("Daily trade limit reached")
            reduced = decision.get("action") == "REDUCE_RISK"
            scale = Decimal(".5") if reduced else Decimal(1)
            budget = equity * (Decimal(".0025") if team == "TSLA" else Decimal(".005")) * scale
            cap = Decimal(500 if team == "TSLA" else 1000) * scale
            long = decision.get("direction") == "LONG"
            stop = (price - distance if long else price + distance).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
            target = (price + 2 * distance if long else price - 2 * distance).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
            if min(stop, target) <= 0 or not (stop < price < target if long else target < price < stop):
                raise ValueError("Invalid stop/target geometry after rounding")
            # Conservative one-percent entry slippage allowance for sizing only.
            # This is an estimate; a market order cannot guarantee a fill or maximum loss.
            adverse = price * Decimal(".01")
            per_share_risk = abs(price - stop) + adverse
            reserved_notional = sum((money(r["notional"]) for r in reservations), Decimal(0))
            free_power = max(Decimal(0), power - reserved_notional)
            sizing_price = price + adverse
            qty = max(0, min(int(budget / per_share_risk), int(free_power / sizing_price), int(cap / sizing_price)))
            if qty == 0: reasons.append("Account limits or order cap block this entry")
            plan = TradePlan(client_id, decision_id, team, team, adapter.broker_id, adapter.account_id,
                adapter.mode.value, decision.get("direction", "SKIP"), qty, str(price), str(stop), str(target),
                str(per_share_risk * qty), str(price * qty), timestamp(decision["analysis_time"]).isoformat(), now.isoformat(),
                reserved_buying_power=str(sizing_price * qty))
        except (ValueError, TypeError, KeyError, AttributeError, ArithmeticError, OverflowError):
            reasons.append("Invalid account, signal, position, or stop/target data")
        return plan, list(dict.fromkeys(reasons))
