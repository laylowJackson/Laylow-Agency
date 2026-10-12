"""Read-only Alpaca IEX data. No trading client, order endpoint, or URL override."""
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from zoneinfo import ZoneInfo
from dotenv import dotenv_values

SYMBOLS = ("SPY", "QQQ", "AAPL", "TSLA")
SOURCE = "Alpaca IEX · single exchange · 15-second polling"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_json(url, key, secret):
    if not url.startswith(("https://data.alpaca.markets/v2/stocks/", "https://paper-api.alpaca.markets/v2/clock")):
        raise ValueError("Unsupported read-only endpoint")
    req = Request(url, headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret}, method="GET")
    with build_opener(NoRedirect()).open(req, timeout=6) as response:
        raw = response.read(3_000_001)
    if len(raw) > 3_000_000:
        raise ValueError("Data response too large")
    return json.loads(raw)


def timestamp(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Timestamp requires timezone")
    return dt.astimezone(timezone.utc)


def number(value, positive=True):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < 0 or (positive and value == 0):
        raise ValueError("Invalid market value")
    return value


def normalize_bars(rows, now):
    result = {}
    for row in rows:
        dt = timestamp(row["t"])
        eastern = dt.astimezone(ZoneInfo("America/New_York"))
        # Only complete regular-session minute bars. No invented missing candles.
        if dt + timedelta(minutes=1) > now or eastern.weekday() > 4 or not 570 <= eastern.hour * 60 + eastern.minute < 960:
            continue
        o, h, l, c = [number(row[k]) for k in ("o", "h", "l", "c")]
        v = number(row["v"], positive=False)
        if l > min(o, c) or h < max(o, c) or l > h:
            raise ValueError("Invalid OHLC geometry")
        result[dt] = {"timestamp": dt.isoformat(), "open": o, "high": h, "low": l, "close": c, "volume": v}
    return [result[t] for t in sorted(result)][-120:]


class LiveMarketData:
    def __init__(self, settings_path, transport=read_json, clock=None):
        self.path = Path(settings_path)
        self.transport = transport
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.lock = threading.Lock()
        self.cache = None
        self.checked = 0

    def snapshot(self):
        with self.lock:
            if self.cache is not None and time.monotonic() - self.checked < 15:
                return self.cache
            now = self.clock()
            base = {"source": SOURCE, "feed": "iex", "execution": "FAKE_MONEY_ONLY", "orders_sent": False,
                    "received_at": now.isoformat(), "symbols": list(SYMBOLS), "market_open": False,
                    "live": False, "status": "NOT_CONFIGURED", "stocks": {}, "reason": "Save Alpaca paper API keys in local Settings, then connect live-price practice."}
            try:
                values = dotenv_values(self.path, interpolate=False) if self.path.exists() else {}
                key = values.get("ALPACA_API_KEY") or os.getenv("ALPACA_API_KEY", "")
                secret = values.get("ALPACA_SECRET_KEY") or os.getenv("ALPACA_SECRET_KEY", "")
                if key and secret:
                    clock = self.transport("https://paper-api.alpaca.markets/v2/clock", key, secret)
                    if type(clock.get("is_open")) is not bool or abs((now - timestamp(clock["timestamp"])).total_seconds()) > 90:
                        raise ValueError("Unverified session clock")
                    base["market_open"] = clock["is_open"]
                    common = {"symbols": ",".join(SYMBOLS), "feed": "iex"}
                    trades = self.transport("https://data.alpaca.markets/v2/stocks/trades/latest?" + urlencode(common), key, secret)["trades"]
                    eastern = now.astimezone(ZoneInfo("America/New_York"))
                    start = eastern.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
                    params = dict(common, timeframe="1Min", start=start.isoformat(), end=now.isoformat(), limit=10000, adjustment="raw", sort="asc")
                    bars = self.transport("https://data.alpaca.markets/v2/stocks/bars?" + urlencode(params), key, secret)
                    if bars.get("next_page_token"):
                        raise ValueError("Incomplete history page")
                    for symbol in SYMBOLS:
                        trade = trades[symbol]
                        ts = timestamp(trade["t"])
                        price = number(trade["p"])
                        history = normalize_bars(bars["bars"].get(symbol, []), now)
                        age = (now - ts).total_seconds()
                        fresh = -5 <= age <= 90
                        base["stocks"][symbol] = {"price": price, "timestamp": ts.isoformat(), "age_seconds": round(age, 1), "fresh": fresh, "bars": history}
                    all_fresh = all(s["fresh"] for s in base["stocks"].values())
                    base["live"] = base["market_open"] and all_fresh
                    base["status"] = "LIVE" if base["live"] else "MARKET_CLOSED" if not base["market_open"] else "STALE"
                    base["reason"] = "Real IEX last trades; simulated fills only. Not consolidated market prices." if base["live"] else "Market closed. Entries paused; last prices are historical." if not base["market_open"] else "One or more prices are stale. Entries paused."
            except Exception:
                # Never return/log provider exceptions, requests, or credentials.
                base.update(status="UNAVAILABLE", live=False, market_open=False, stocks={}, reason="Could not verify Alpaca IEX data. Check paper API keys, network access, and data entitlement. No generated-price fallback.")
            self.cache = base
            self.checked = time.monotonic()
            return base
