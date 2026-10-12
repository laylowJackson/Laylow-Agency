import shutil
import subprocess
import unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone
from wick_knowledge import review_candles


class WickKnowledgeTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for the browser math module')
    def test_context_and_measurements(self):
        result = subprocess.run([shutil.which('node'), str(Path(__file__).with_suffix('.cjs'))],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_provider_completion_and_future_evidence(self):
        now = datetime(2026, 10, 8, 15, tzinfo=timezone.utc)
        rows = [dict(timestamp=now-timedelta(minutes=6-i), open=105-i,
                     high=106-i, low=103-i, close=104-i) for i in range(7)]
        rows[5].update(open=100, high=102, low=90, close=102)
        review = review_candles(rows, now, source='fixture', duration_seconds=60, chart_type='standard')
        self.assertTrue(review['available'])
        self.assertEqual(review['candle_time'], rows[5]['timestamp'].isoformat())
        self.assertEqual(review['metrics']['lower_wick'], 10)
        self.assertEqual(review['pattern'], 'Possible hammer')
        self.assertIsNone(review['signal'])
        self.assertEqual(review['outcome'], 'unknown')
        rows[-1]['high'] = 99999
        self.assertEqual(review, review_candles(rows, now, source='fixture', duration_seconds=60, chart_type='standard'))
        self.assertFalse(review_candles(rows, now, source='fixture')['available'])

    def test_specialists_managers_and_council_share_evidence(self):
        from tests.test_specialists import bars, NOW
        from specialist_engine import evaluate_team
        from council import assess_council, fingerprint
        analysis = evaluate_team('SPY', bars(), observed_at=NOW, bar_duration_seconds=60, chart_type='standard')
        self.assertTrue(analysis['candle_review']['available'])
        self.assertTrue(all(v['candle_review'] == analysis['candle_review'] for v in analysis['votes']))
        report = assess_council('SPY', analysis, {}, {}, now=NOW)
        self.assertEqual(report['candle_review'], analysis['candle_review'])
        before = fingerprint(analysis)
        analysis['candle_review']['summary'] = 'changed'
        self.assertNotEqual(before, fingerprint(analysis))

    def test_browser_module_is_served_locally(self):
        import tempfile
        from dashboard import create_app
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        app = create_app(db_path=Path(directory.name)/'review.db')
        with app.test_client() as client:
            response = client.get('/wick-knowledge.js')
            self.addCleanup(response.close)
            self.assertEqual(response.status_code, 200)
            self.assertIn(b'reviewCandles', response.data)
            self.assertNotIn(b'CANDLE SCHOOL', response.data)
