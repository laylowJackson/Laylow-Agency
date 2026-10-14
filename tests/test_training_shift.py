import json
import shutil
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
from dashboard import create_app
from training_worker import atomic_json, cycle, read_status


class TrainingShiftTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.client = create_app(db_path=self.directory / 'research.db').test_client()

    def test_js_shift(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node required for research engine')
        result = subprocess.run([node, str(Path(__file__).with_suffix('.cjs'))], capture_output=True, text=True, timeout=45)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_worker_resume_pause_error_and_api(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node required for worker')
        now = datetime.now(timezone.utc).isoformat()
        first = cycle(self.directory, node=node, now=now)
        self.assertEqual(first['round'], 1)
        self.assertEqual(cycle(self.directory, node=node, now=now)['round'], 2)
        read = self.client.get('/api/training').get_json()
        self.assertEqual(read['lab']['round'], 2)
        self.assertFalse(read['stale'])
        headers = {'X-Laylow-CSRF': self.client.get('/api/settings').get_json()['csrf_token']}
        self.assertEqual(self.client.post('/api/training/control', json={'paused': True, 'mode': 'deep'}).status_code, 403)
        self.assertEqual(self.client.post('/api/training/control', headers=headers, json={'paused': True, 'mode': 'deep'}).status_code, 200)
        self.assertEqual(cycle(self.directory, node=node, now=now)['status'], 'PAUSED')
        self.assertEqual(read_status(self.directory)['lab']['round'], 2)
        self.assertEqual(self.client.post('/api/training/control', headers={**headers, 'Origin': 'https://evil.invalid'}, json={'paused': False, 'mode': 'deep'}).status_code, 403)
        self.assertEqual(self.client.post('/api/training/control', headers=headers, json={'paused': False, 'mode': 'live'}).status_code, 400)
        atomic_json(self.directory / 'training_control.json', {'paused': False, 'mode': 'deep'})
        before = (self.directory / 'training_state.json').read_bytes()
        with patch('training_worker.subprocess.run', side_effect=subprocess.TimeoutExpired('node', 45)):
            with self.assertRaises(subprocess.TimeoutExpired):
                cycle(self.directory, node=node, now=now)
        self.assertEqual((self.directory / 'training_state.json').read_bytes(), before)
        third = cycle(self.directory, node=node, now=now)
        self.assertEqual(third['round'], 3)
        self.assertEqual(third['plan']['deepTeams'].__len__(), 10)
        third['updated_at'] = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
        atomic_json(self.directory / 'training_worker_status.json', third)
        self.assertTrue(read_status(self.directory)['stale'])

    def test_missing_node_and_no_worker(self):
        self.assertEqual(self.client.get('/api/training').get_json()['available'], False)
        with patch('training_worker.shutil.which', return_value=None):
            self.assertEqual(cycle(self.directory)['status'], 'NODE_REQUIRED')
        self.assertFalse((self.directory / 'training_state.json').exists())
        response = self.client.get('/training-policy.js')
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
