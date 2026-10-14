# Live prices with fake money

The local Windows app supports SPY, QQQ, AAPL and TSLA using Alpaca IEX. It only GETs the paper market clock and IEX bars/latest trades; it contains no order submission call. LIVE execution remains hard locked. Futures need a separate compatible data feed.

1. Create an Alpaca paper account and generate paper API keys. Verify your market-data entitlement. The free Basic plan supplies IEX single-exchange data, not consolidated SIP prices.
2. Run SETUP_WINDOWS.bat once, then START_WINDOWS.bat. Open http://127.0.0.1:5000/ on that computer.
3. In Settings, save the paper API key and secret locally. Never paste keys in chat or put them in the public site. Live-price data reads saved keys directly; unrelated worker processes may still need a restart.
4. Click **Open live-price practice**. The separate account begins with $50,000 fake dollars. Existing generated practice history is preserved separately. Export each ledger before moving computers.

The public GitHub Pages viewer cannot run this private data proxy. A securely hosted, authenticated backend would be needed to support remote live-price practice. Credentials are only returned as saved/not-saved status, never plaintext.

## What actually happens

- Poll every 15 seconds while the page is visible. Provider observations are displayed with timestamps and LIVE / MARKET_CLOSED / STALE / UNAVAILABLE labels.
- Use completed one-minute regular-session bars. Warm-up/reconnection does not trade old bars. New entries require 30 contiguous minute bars and a new completed bar; missing candles are not manufactured.
- Rule-based specialists and the existing Council run on these bars. This does not promote research candidates or enable external AI.
- Entries, stops, targets and manual closes use observed IEX last trades with modeled one-tick slippage and $1 each-side fees. This is a local fake ledger, not an Alpaca paper order account.
- Polling misses intraperiod prices. Stops/targets are triggered only when an observed last trade crosses the level; fills and borrow availability are not verified. Modeled results are not verified real execution performance.
- No entry or close on a stale/missing feed or closed session. No generated-candle fallback. Open fake positions wait for fresh observations. The page must stay open to monitor them; no unattended overnight trade management is promised.
- Shared four-position cap, $250 planned risk, $1,000 account loss brake and $300 team profit brake remain. These do not guarantee maximum losses. No news/spread filter or profitable edge is established.

IEX volume differs from the whole market. Current strategies have not passed final real-market validation. This mode is for forward observation with fake money.

Sources: https://docs.alpaca.markets/us/docs/market-data-faq and https://docs.alpaca.markets/us/reference/stockbars
