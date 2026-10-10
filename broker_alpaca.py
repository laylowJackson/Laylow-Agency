"""Alpaca stock PAPER adapter only. SDK imports and clients are lazy."""
from broker_adapter import (BrokerAdapter, BrokerOrder, BrokerSnapshot,
                            ExecutionMode, Position, safe_mode)
from datetime import datetime, timezone
from config import STOCK_TEAM_NAMES


def normalize_order(row):
    return BrokerOrder(str(row.client_order_id or ""), str(row.id), str(row.symbol),
                       str(getattr(row.status, "value", row.status)).upper(), int(row.qty),
                       "LONG" if str(getattr(row.side, "value", row.side)) == "buy" else "SHORT",
                       str(row.filled_qty or 0), str(row.filled_avg_price) if row.filled_avg_price else None)


def build_bracket(plan):
    safe_mode(plan.mode)
    if plan.mode != "PAPER":
        raise ValueError("Alpaca only accepts PAPER plans")
    from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
    from alpaca.trading.requests import MarketOrderRequest, StopLossRequest, TakeProfitRequest
    return MarketOrderRequest(symbol=plan.symbol, qty=plan.qty,
        side=OrderSide.BUY if plan.side == "LONG" else OrderSide.SELL,
        time_in_force=TimeInForce.DAY, order_class=OrderClass.BRACKET,
        client_order_id=plan.client_order_id,
        stop_loss=StopLossRequest(stop_price=float(plan.stop)),
        take_profit=TakeProfitRequest(limit_price=float(plan.target)))


class AlpacaPaperAdapter(BrokerAdapter):
    mode = ExecutionMode.PAPER
    broker_id = "alpaca-paper"
    symbols = frozenset(STOCK_TEAM_NAMES)

    def __init__(self, key, secret):
        from alpaca.trading.client import TradingClient
        from alpaca.data.historical import StockHistoricalDataClient
        # No URL override, paper=False flag, or environment-driven live endpoint.
        self._client = TradingClient(key, secret, paper=True)
        self._data = StockHistoricalDataClient(key, secret)
        self.account_id = str(self._client.get_account().id)

    def snapshot(self, symbol):
        from alpaca.data.enums import DataFeed
        from alpaca.data.requests import StockLatestQuoteRequest
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus
        account = self._client.get_account()
        if str(account.id) != self.account_id:
            raise ValueError("Paper account changed")
        clock = self._client.get_clock()
        asset = self._client.get_asset(symbol)
        positions = tuple(Position(str(p.symbol), str(p.qty)) for p in self._client.get_all_positions())
        # Fail closed rather than silently accepting a truncated account order list.
        orders = self._client.get_orders(filter=GetOrdersRequest(status=QueryOrderStatus.OPEN, limit=500))
        if len(orders) >= 500:
            raise ValueError("Open order snapshot may be truncated")
        quote = self._data.get_stock_latest_quote(StockLatestQuoteRequest(
            symbol_or_symbols=[symbol], feed=DataFeed.IEX))[symbol]
        return BrokerSnapshot(self.account_id, str(account.equity), str(account.last_equity),
            str(account.buying_power), bool(account.trading_blocked or account.account_blocked),
            bool(clock.is_open), str(quote.bid_price), str(quote.ask_price), quote.timestamp.isoformat(),
            datetime.now(timezone.utc).isoformat(), bool(asset.tradable),
            bool(asset.shortable and asset.easy_to_borrow), positions,
            tuple(normalize_order(o) for o in orders))

    def lookup(self, client_order_id):
        from alpaca.common.exceptions import APIError
        try:
            return normalize_order(self._client.get_order_by_client_id(client_order_id))
        except APIError as error:
            if error.status_code == 404:
                return None
            raise

    def submit(self, plan):
        safe_mode(plan.mode)
        if plan.mode != "PAPER" or plan.broker != self.broker_id or plan.account_id != self.account_id:
            raise ValueError("Paper route identity mismatch")
        if plan.symbol not in self.symbols:
            raise ValueError("Unsupported paper symbol")
        return normalize_order(self._client.submit_order(order_data=build_bracket(plan)))
