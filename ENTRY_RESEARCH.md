# Selective entry experiment

Declared before downloading the additional SPY sample. Four fixed variants use
the balanced entry, 24-bar hold, fixed 2R exit and $125 planned risk including
modeled costs. Existing team votes and execution strategies are unchanged.

1. Control: existing frozen balanced entry.
2. Higher timeframe: last eight completed, contiguous 15-minute closes; three-close
   mean above/below eight-close mean and latest close moving in the entry direction.
3. Quality: completed candle body at least 35% of its range, close in the favorable
   outer 35%, range no larger than 2.5 prior ATR, break of the prior five-candle
   high/low, volume at least the prior 20-candle mean. Unknown volume fails.
4. Combined: both filters.

Only standard 5-minute OHLC is supported by this experiment. Aggregation reads
completed candles at the signal, uses aligned UTC buckets and resets across gaps.
It never uses unfinished higher-timeframe candles or later price movements.

Chronological 60% training, 20% validation, 20% final comparison. Selection needs
20 training trades, 10 validation trades, positive training/validation/stressed
validation net, higher validation win rate and net than control, and no greater
validation drawdown. Rank eligible variants by validation net. Final results never
choose the variant. No automatic promotion, even if the final result is favorable.

Additional provider bars must precede September 10, 2026; September 10–October 9
was already inspected. This is retrospective research, not independent forward
validation. Four trials add selection bias; 45–50% is a test goal, not a promise.
No verified spread, news, borrow or liquidity data is supplied; these protections
are not claimed to have been tested. Generated practice results remain separate.
