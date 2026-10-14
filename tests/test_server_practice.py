from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock

from dashboard import create_app
from live_practice_worker import PracticeWorker, read_status, export_bars
from training_worker import atomic_json


def observation(offset=0, price=105):
    now = datetime.now(timezone.utc)
    minute = now.replace(second=0, microsecond=0)
    bars = [dict(timestamp=(minute-timedelta(minutes=40+offset-i)).isoformat(), open=100+i*.1,
                 high=100.2+i*.1, low=99.9+i*.1, close=100.1+i*.1, volume=1000+i*10) for i in range(40)]
    return dict(feed='iex', execution='FAKE_MONEY_ONLY', orders_sent=False, received_at=now.isoformat(),
                market_open=True, live=True, status='LIVE', reason='TEST FIXTURE / NOT REAL DATA', source='QA MOCK',
                stocks={s: dict(price=price, timestamp=now.isoformat(), fresh=True, bars=bars) for s in ['SPY','QQQ','AAPL','TSLA']})


class ServerPracticeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.directory=Path(self.temp.name)

    def test_worker_without_browser_persists_and_restart_never_backfills(self):
        if not shutil.which('node'): self.skipTest('Node required')
        feed=Mock();feed.snapshot.side_effect=lambda:observation()
        atomic_json(self.directory/'live_practice_control.json',{'running':True})
        worker=PracticeWorker(self.directory,feed=feed)
        first=worker.cycle()
        self.assertEqual(first['session']['trades'],[])
        self.assertEqual(first['session']['positions'],[])
        self.assertEqual(first['snapshot']['summary']['fresh_workers'],4)
        second=worker.cycle()
        self.assertEqual(first['session']['serial'],second['session']['serial'])
        restarted=PracticeWorker(self.directory,feed=feed).cycle()
        self.assertEqual(restarted['session']['serial'],second['session']['serial'])
        self.assertEqual(restarted['snapshot']['validation']['strategy_edge_verified'],False)
        view=read_status(self.directory)
        self.assertTrue(view['available']);self.assertNotIn('session',view)
        self.assertFalse(view['orders_sent']);self.assertTrue(view['live_locked'])
        atomic_json(self.directory/'live_practice_control.json',{'running':False})
        paused=worker.cycle()
        self.assertEqual(paused['session'],restarted['session'])
        self.assertEqual(paused['snapshot']['market_feed']['status'],'PAUSED')

    def test_positions_survive_process_recreation_and_fake_stops_record_costs(self):
        if not shutil.which('node'): self.skipTest('Node required')
        feed=Mock();feed.snapshot.return_value=observation(offset=1)
        atomic_json(self.directory/'live_practice_control.json',{'running':True})
        worker=PracticeWorker(self.directory,feed=feed);worker.cycle()
        feed.snapshot.return_value=observation()
        entered=worker.cycle()
        self.assertEqual(len(entered['session']['positions']),4)
        restored=PracticeWorker(self.directory,feed=feed).cycle()
        self.assertEqual(restored['session']['positions'],entered['session']['positions'])
        self.assertEqual(restored['session']['serial'],entered['session']['serial'])
        lines=export_bars(self.directory,'SPY').splitlines()
        self.assertEqual(len(lines),42) # Header plus 41 unique observed minute bars.
        self.assertEqual(lines[0],'timestamp,open,high,low,close,volume')
        with self.assertRaises(ValueError): export_bars(self.directory,'../../secret')
        feed.snapshot.return_value=observation(price=90)
        closed=worker.cycle()
        self.assertEqual(len(closed['session']['positions']),0)
        self.assertEqual(len(closed['session']['trades']),4)
        self.assertEqual(len({t['id'] for t in closed['session']['trades']}),4)
        self.assertTrue(all(t['net_cents']==t['gross_cents']-t['fees_cents'] for t in closed['session']['trades']))
        again=worker.cycle()
        self.assertEqual(len(again['session']['trades']),4)

    def test_corrupt_checkpoint_never_resets_account(self):
        if not shutil.which('node'): self.skipTest('Node required')
        path=self.directory/'live_practice_state.json';path.write_text('{bad checkpoint')
        with self.assertRaises(ValueError): PracticeWorker(self.directory).cycle()
        self.assertEqual(path.read_text(),'{bad checkpoint')

    def test_controls_require_csrf_origin_and_boolean(self):
        app=create_app(self.directory/'test.db',settings_path=self.directory/'.env.local')
        client=app.test_client();url='/api/server-practice/control'
        self.assertEqual(client.post(url,json={'running':True}).status_code,403)
        token=app.config['CONTROL_CSRF'];headers={'X-Laylow-CSRF':token}
        self.assertEqual(client.post(url,json={'running':'true'},headers=headers).status_code,400)
        self.assertEqual(client.post(url,json={'running':True},headers=dict(headers,Origin='https://foreign.example')).status_code,403)
        response=client.post(url,json={'running':True},headers=headers)
        self.assertEqual(response.status_code,200);self.assertFalse(response.json['orders_sent'])
        self.assertEqual(client.get('/api/server-practice',headers={'Host':'public.example'}).status_code,403)

    def test_failed_worker_never_claims_fresh_feed(self):
        if not shutil.which('node'): self.skipTest('Node required')
        worker=PracticeWorker(self.directory);worker.cycle()
        atomic_json(self.directory/'live_practice_status.json',{'status':'ERROR'})
        status=read_status(self.directory)
        self.assertFalse(status['snapshot']['market_feed']['live'])
        self.assertEqual(status['snapshot']['market_feed']['status'],'STALE')


if __name__=='__main__':unittest.main()
