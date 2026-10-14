"""Durable server fake-money ledger. Reads data; never submits broker orders."""
from datetime import datetime, timezone
from contextlib import closing
import json
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import threading
import time

from config import DATA_DIR, ROOT_DIR
from live_market_data import LiveMarketData
from training_worker import atomic_json
from watchdog import InstanceLock


def archive_bars(directory, feed):
    """Capture provider OHLC separately from trade screenshots and fake fills."""
    from live_market_data import SYMBOLS
    with closing(sqlite3.connect(Path(directory) / 'observed_iex.db')) as connection:
        with connection:
            connection.execute('CREATE TABLE IF NOT EXISTS observed_bars (symbol TEXT, timestamp TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL, PRIMARY KEY(symbol,timestamp))')
            for symbol in SYMBOLS:
                for bar in feed.get('stocks', {}).get(symbol, {}).get('bars', []):
                    connection.execute('INSERT INTO observed_bars VALUES (?,?,?,?,?,?,?) ON CONFLICT(symbol,timestamp) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume',
                                       (symbol, bar['timestamp'], bar['open'], bar['high'], bar['low'], bar['close'], bar['volume']))


def export_bars(directory, symbol):
    import csv
    import io
    from live_market_data import SYMBOLS
    if symbol not in SYMBOLS:
        raise ValueError('Unsupported symbol')
    path = Path(directory) / 'observed_iex.db'
    output = io.StringIO(newline='')
    writer = csv.writer(output); writer.writerow(['timestamp','open','high','low','close','volume'])
    if path.exists():
        from contextlib import closing
        with closing(sqlite3.connect(path.as_uri()+'?mode=ro', uri=True)) as connection:
            writer.writerows(connection.execute('SELECT timestamp,open,high,low,close,volume FROM observed_bars WHERE symbol=? ORDER BY timestamp', (symbol,)))
    return output.getvalue()


class PracticeWorker:
    def __init__(self, directory=DATA_DIR, settings=None, feed=None, node=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.feed = feed or LiveMarketData(settings or DATA_DIR / '.env.local')
        self.node = node or shutil.which('node')
        self.continuation = False

    def cycle(self):
        control_path = self.directory / 'live_practice_control.json'
        control = json.loads(control_path.read_text()) if control_path.exists() else {'running': False}
        if set(control) != {'running'} or type(control['running']) is not bool:
            raise ValueError('Invalid server practice control')
        if not self.node:
            raise RuntimeError('Node runtime required')
        path = self.directory / 'live_practice_state.json'
        previous = json.loads(path.read_text()) if path.exists() else None
        if previous and not control['running']:
            state = previous
            state['running'] = False
            state['updated_at'] = datetime.now(timezone.utc).isoformat()
            state['snapshot']['practice_running'] = False
            state['snapshot']['market_feed'].update(live=False, status='PAUSED', reason='Server fake-money worker paused. Positions are not monitored while paused.')
            for team in state['snapshot']['teams']:
                if team['worker_state'] == 'RUNNING':
                    team['worker_state'] = 'PAUSED'
            atomic_json(path, state)
            atomic_json(self.directory / 'live_practice_status.json', {'status': 'PAUSED', 'updated_at': state['updated_at'], 'orders_sent': False})
            self.continuation = False
            return state
        # A corrupt checkpoint is never silently reset to $50,000.
        payload = {'session': previous['session'] if previous else None,
                   'continuation': self.continuation, 'running': control['running'],
                   'feed': self.feed.snapshot() if control['running'] else None}
        result = subprocess.run([self.node, str(ROOT_DIR / 'server-practice.cjs')],
                                input=json.dumps(payload), capture_output=True, text=True,
                                check=True, timeout=30)
        state = json.loads(result.stdout)
        if state['snapshot'].get('server_practice') is not True:
            raise ValueError('Invalid worker output')
        if control['running']:
            archive_bars(self.directory, payload['feed'])
        state['updated_at'] = datetime.now(timezone.utc).isoformat()
        state['running'] = control['running']
        atomic_json(path, state)
        atomic_json(self.directory / 'live_practice_status.json',
                    {'status': 'RUNNING' if control['running'] else 'PAUSED',
                     'updated_at': state['updated_at'], 'orders_sent': False})
        self.continuation = control['running']
        return state


def read_status(directory):
    directory = Path(directory)
    path = directory / 'live_practice_state.json'
    if not path.exists():
        return {'available': False, 'status': 'NOT_STARTED', 'live_locked': True}
    state = json.loads(path.read_text())
    age = time.time() - datetime.fromisoformat(state['updated_at']).timestamp()
    status_path = directory / 'live_practice_status.json'
    status = json.loads(status_path.read_text()) if status_path.exists() else {'status': 'UNKNOWN'}
    snapshot = state['snapshot']
    feed = snapshot['market_feed']
    if not -5 <= age <= 60 or status['status'] == 'ERROR':
        feed.update(live=False, status='STALE', reason='Server worker heartbeat unavailable; last saved ledger only.')
        snapshot['practice_running'] = False
        for team in snapshot['teams']:
            if team['worker_state'] == 'RUNNING':
                team['worker_state'] = 'PAUSED'
    # Credentials and internal session checkpoint are not included in this route.
    return {'available': True, 'status': status['status'], 'stale': not -5 <= age <= 60,
            'updated_at': state['updated_at'], 'running': state['running'],
            'snapshot': snapshot, 'live_locked': True, 'orders_sent': False}


def main():
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    with InstanceLock(DATA_DIR / 'live_practice.lock'):
        worker = PracticeWorker()
        while not stop.is_set():
            try:
                worker.cycle()
            except Exception as error:
                # Keep the last valid checkpoint and avoid exposing provider errors/secrets.
                worker.continuation = False
                atomic_json(DATA_DIR / 'live_practice_status.json',
                            {'status': 'ERROR', 'error_type': type(error).__name__,
                             'updated_at': datetime.now(timezone.utc).isoformat(), 'orders_sent': False})
            stop.wait(15)


if __name__ == '__main__':
    main()
