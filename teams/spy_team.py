import os
import sqlite3
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from openai import OpenAI

from alpaca.data import DataClient
from alpaca.data.historical.stock import StockLatestQuoteRequest
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ALPACA_API_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY")

SYMBOL = "SPY"
DB_PATH = "spy_team.db"
RISK_PER_TRADE = 0.01
MAX_DAILY_LOSS = 0.05
STOP_LOSS_PCT = 0.02
TAKE_PROFIT_PCT = 0.04

openai_client = OpenAI(api_key=OPENAI_API_KEY)
data_client = DataClient(ALPACA_API_KEY, ALPACA_SECRET_KEY)
trading_client = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=True)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            symbol TEXT,
            direction TEXT,
            strategy TEXT,
            ai_reason TEXT,
            confidence REAL,
            price REAL,
            risk_pct REAL,
            stop_loss REAL,
            take_profit REAL,
            pnl REAL,
            result REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER,
            review TEXT
        )
    """)
    conn.commit()
    conn.close()


def get_account():
    account = trading_client.get_account()
    return {
        "equity": float(account.equity),
        "buying_power": float(account.buying_power),
        "unrealized_pl": float(account.unrealized_pl),
    }


def get_quote(symbol):
    req = StockLatestQuoteRequest(symbol_or_symbols=[symbol])
    quote = data_client.get_stock_latest_quote(req)
    q = quote[symbol]
    return (float(q.bid_price) + float(q.ask_price)) / 2.0


def ask_ai(prompt):
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[AI ERROR] {e}")
        return "SKIP"


class StrategyAI:
    def recent_history(self, limit=8):
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("""
            SELECT direction, strategy, ai_reason, confidence, pnl, result FROM trades
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()
        conn.close()
        return rows

    def decide(self, price):
        account = get_account()
        history = self.recent_history()
        history_text = "No recent trades yet." if not history else "\n".join(
            f"- {direction} via {strategy} | confidence={confidence}% | pnl={pnl} | reason={reason}"
            for direction, strategy, reason, confidence, pnl, _ in history
        )

        prompt = f"""
        You are the SPY strategy AI.
        Use recent trade history to decide if this trade is good.

        Recent history:
        {history_text}

        Current setup:
        - Symbol: {SYMBOL}
        - Price: ${price:.2f}
        - Equity: ${account['equity']:.2f}
        - Risk per trade: {RISK_PER_TRADE * 100:.1f}%

        Return only one of:
        LONG
        SHORT
        SKIP
        """
        decision = ask_ai(prompt).strip().upper()
        return decision


class HistoryAI:
    def summarize(self):
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("""
            SELECT direction, strategy, pnl, result FROM trades ORDER BY id DESC LIMIT 10
        """).fetchall()
        conn.close()

        if not rows:
            return "No trade history yet."

        summary = []
        for direction, strategy, pnl, result in rows:
            summary.append(f"- {direction} via {strategy}, pnl={pnl}, result={result}")
        return "\n".join(summary)

    def assess(self):
        summary = self.summarize()
        prompt = f"""
        Review this symbol's trade behavior and tell me if the system should reduce risk or skip.
        Symbol: {SYMBOL}
        History:
        {summary}

        Return exactly:
        STATUS: GOOD / CAUTION / BAD
        ACTION: APPROVE / REDUCE_RISK / SKIP
        REASON: one sentence
        """
        return ask_ai(prompt)


class RiskManager:
    def check(self, account):
        daily_loss_limit = account["equity"] * MAX_DAILY_LOSS
        return account["unrealized_pl"] > -daily_loss_limit


class ExecutionBot:
    def __init__(self):
        self.risk = RiskManager()

    def size_trade(self, account, price):
        risk_amount = account["equity"] * RISK_PER_TRADE
        return max(1, int(risk_amount / max(price, 1.0)))

    def submit(self, direction, price):
        account = get_account()
        if not self.risk.check(account):
            print(f"[SPY RISK] daily loss limit reached: {account['unrealized_pl']}")
            return

        qty = self.size_trade(account, price)
        side = OrderSide.BUY if direction == "LONG" else OrderSide.SELL
        stop_loss = price * (1 - STOP_LOSS_PCT) if direction == "LONG" else price * (1 + STOP_LOSS_PCT)
        take_profit = price * (1 + TAKE_PROFIT_PCT) if direction == "LONG" else price * (1 - TAKE_PROFIT_PCT)

        try:
            order = MarketOrderRequest(
                symbol=SYMBOL,
                qty=qty,
                side=side,
                time_in_force=TimeInForce.DAY,
            )
            response = trading_client.submit_order(order_data=order)
            print(f"[SPY EXECUTE] {direction} {qty} @ {price} | stop={stop_loss} | tp={take_profit} | status={response.status}")
        except Exception as e:
            print(f"[SPY EXECUTE ERROR] {e}")


def run_team():
    init_db()
    while True:
        try:
            price = get_quote(SYMBOL)
            if price is None:
                time.sleep(60)
                continue

            strategy = StrategyAI().decide(price)
            history = HistoryAI().assess()
            print(f"[SPY STRATEGY] {strategy}")
            print(f"[SPY HISTORY] {history}")

            if strategy == "SKIP":
                time.sleep(300)
                continue

            if "REDUCE_RISK" in history.upper():
                print("[SPY] history says reduce risk")

            ExecutionBot().submit(strategy, price)
        except Exception as e:
            print(f"[SPY TEAM ERROR] {e}")
        time.sleep(300)


if __name__ == "__main__":
    run_team()
