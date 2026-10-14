"""Import a complete closed-trade export; no broker/API credentials required."""
import argparse
import csv
from pathlib import Path
from trading_records import import_closed_trades

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("--source",required=True,help="Stable account/export name, reused on every import")
    parser.add_argument("--mode",choices=("paper","live"),default="paper")
    parser.add_argument("--as-of",required=True,help="Timezone-aware ISO timestamp of complete export coverage")
    parser.add_argument("--database",default=None)
    args=parser.parse_args()
    path=Path(args.csv_path)
    if path.stat().st_size>5_000_000:
        raise ValueError("CSV exceeds 5 MB")
    with path.open(encoding="utf-8-sig",newline="") as handle:
        rows=list(csv.DictReader(handle))
    imported=import_closed_trades(rows,args.source,args.mode,args.as_of,args.database)
    print(f"Processed {imported} closed-trade records; repeated IDs do not duplicate earnings.")

if __name__=="__main__":
    main()
