from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from live_market_data import LiveMarketData, SYMBOLS, normalize_bars
from dashboard import create_app


class LiveDataTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / '.env.local'
        self.now = datetime(2026, 10, 12, 15, 30, tzinfo=timezone.utc)
        self.calls = []

    def provider(self, url, key, secret):
        self.calls.append(url)
        self.assertEqual((key, secret), ('dummy-key', 'dummy-secret'))
        if url.endswith('/clock'):
            return {'timestamp': self.now.isoformat(), 'is_open': True}
        query = parse_qs(urlsplit(url).query)
        self.assertEqual(query['feed'], ['iex'])
        self.assertEqual(set(query['symbols'][0].split(',')), set(SYMBOLS))
        if '/trades/latest?' in url:
            return {'trades': {s: {'p': 100, 't': self.now.isoformat()} for s in SYMBOLS}}
        return {'bars': {s: [dict(t=(self.now - timedelta(minutes=i)).isoformat(), o=99, h=101, l=98, c=100, v=10) for i in range(40, -1, -1)] for s in SYMBOLS}, 'next_page_token': None}

    def feed(self):
        self.path.write_text('ALPACA_API_KEY=dummy-key\nALPACA_SECRET_KEY=dummy-secret\n', encoding='utf-8')
        return LiveMarketData(self.path, self.provider, lambda: self.now)

    def test_no_credentials_no_network(self):
        with patch.dict('os.environ', {'ALPACA_API_KEY': '', 'ALPACA_SECRET_KEY': ''}):
            result = LiveMarketData(self.path, self.provider, lambda: self.now).snapshot()
        self.assertEqual(result['status'], 'NOT_CONFIGURED')
        self.assertEqual(self.calls, [])

    def test_read_only_iex_completed_bars_cache_and_no_secrets(self):
        feed = self.feed()
        result = feed.snapshot()
        self.assertTrue(result['live'])
        self.assertFalse(result['orders_sent'])
        self.assertEqual(result['execution'], 'FAKE_MONEY_ONLY')
        self.assertEqual(len(self.calls), 3)
        self.assertTrue(all('/orders' not in url for url in self.calls))
        self.assertEqual(len(result['stocks']['SPY']['bars']), 40)
        self.assertNotIn('dummy-key', json.dumps(result))
        self.assertNotIn('dummy-secret', json.dumps(result))
        feed.snapshot()
        self.assertEqual(len(self.calls), 3)

    def test_stale_trade_and_closed_market_not_live(self):
        for closed in (True, False):
            feed = self.feed()
            provider = feed.transport
            def altered(url, key, secret):
                result = provider(url, key, secret)
                if '/clock' in url and closed:
                    result['is_open'] = False
                if '/trades/latest?' in url:
                    for row in result['trades'].values():
                        row['t'] = (self.now - timedelta(minutes=15)).isoformat()
                return result
            feed.transport = altered
            result = feed.snapshot()
            self.assertFalse(result['live'])
            self.assertEqual(result['status'], 'MARKET_CLOSED' if closed else 'STALE')

    def test_provider_failure_redacted_and_no_fallback(self):
        feed = self.feed()
        feed.transport = lambda *args: (_ for _ in ()).throw(ValueError('dummy-secret'))
        result = feed.snapshot()
        self.assertEqual(result['status'], 'UNAVAILABLE')
        self.assertEqual(result['stocks'], {})
        self.assertNotIn('dummy-secret', json.dumps(result))

    def test_local_route_foreign_origin_rejected(self):
        app = create_app(Path(self.directory.name)/'test.db', settings_path=self.path)
        app.config['LIVE_MARKET_DATA'] = self.feed()
        client = app.test_client()
        self.assertEqual(client.get('/api/market-data', headers={'Origin': 'https://evil.example'}).status_code, 403)
        self.assertEqual(client.get('/api/market-data', headers={'Host': 'public.example'}).status_code, 403)
        result = client.get('/api/market-data')
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json['live'])
        asset = client.get('/live-practice.js')
        self.addCleanup(asset.close)
        self.assertEqual(asset.status_code, 200)

    def test_bad_geometry_rejected(self):
        with self.assertRaises(ValueError):
            normalize_bars([dict(t=(self.now-timedelta(minutes=1)).isoformat(), o=100, h=101, l=102, c=100, v=1)], self.now)

    def test_fake_ledger_engine(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js needed')
        result = subprocess.run([node, str(Path(__file__).with_name('test_live_practice.cjs'))], capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
