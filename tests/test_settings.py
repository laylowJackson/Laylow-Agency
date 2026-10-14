import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from dotenv import dotenv_values
from dashboard import create_app


class SettingsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.path = root / '.env.local'
        self.app = create_app(root / 'test.db', settings_path=self.path)
        self.client = self.app.test_client()
        self.headers = {'X-Laylow-CSRF': self.app.config['CONTROL_CSRF'], 'Origin': 'http://localhost'}
        self.body = {'action': 'save', 'broker': 'alpaca-paper', 'key': 'test-key-123', 'secret': 'test-secret-456'}

    def post(self, body=None, headers=None):
        return self.client.post('/api/settings/broker', json=self.body if body is None else body,
                                headers=self.headers if headers is None else headers)

    def test_credentials_saved_once_masked_and_modes_untouched(self):
        original = '# Custom setup\nLAYLOW_MODE=observe\nLAYLOW_EXECUTION_MODE=PRACTICE\nLAYLOW_SHADOW_MODE=true\nALPACA_API_KEY=old\nexport ALPACA_API_KEY=duplicate\n'
        self.path.write_text(original, encoding='utf-8')
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['orders_sent'])
        self.assertTrue(response.json['restart_required'])
        values = dotenv_values(self.path)
        self.assertEqual(values['ALPACA_API_KEY'], self.body['key'])
        self.assertEqual(values['ALPACA_SECRET_KEY'], self.body['secret'])
        self.assertEqual(values['LAYLOW_MODE'], 'observe')
        self.assertEqual(values['LAYLOW_EXECUTION_MODE'], 'PRACTICE')
        self.assertEqual(values['LAYLOW_SHADOW_MODE'], 'true')
        self.assertEqual(self.path.read_text().count('ALPACA_API_KEY='), 1)
        status = self.client.get('/api/settings')
        for secret in ('old', 'test-key-123', 'test-secret-456'):
            self.assertNotIn(secret, json.dumps(status.json))
        self.assertTrue(status.json['credentials']['key_saved'])
        self.assertFalse(status.json['credentials']['connection_verified'])
        self.assertTrue(status.json['live_locked'])
        self.assertEqual(list(self.path.parent.glob('.broker-*')), [])

    def test_clear_only_removes_credentials(self):
        self.post()
        with self.path.open('a') as file:
            file.write('OPENAI_MODEL=example\n')
        self.assertEqual(self.post({'action': 'clear'}).status_code, 200)
        values = dotenv_values(self.path)
        self.assertEqual(values['ALPACA_API_KEY'], '')
        self.assertEqual(values['ALPACA_SECRET_KEY'], '')
        self.assertEqual(values['OPENAI_MODEL'], 'example')

    def test_reject_missing_token_remote_host_and_foreign_origin(self):
        for headers in ({}, dict(self.headers, Origin='https://evil.example'), dict(self.headers, Host='public.example')):
            self.assertEqual(self.post(headers=headers).status_code, 403)
        self.assertEqual(self.client.get('/api/settings', headers={'Host': 'public.example'}).status_code, 403)
        self.assertFalse(self.path.exists())

    def test_reject_live_unrecognized_fields_and_env_injection(self):
        bodies = [dict(self.body, broker='live'), dict(self.body, execution_mode='LIVE'),
                  dict(self.body, shadow=False), dict(self.body, key='key\nLAYLOW_MODE=paper'),
                  dict(self.body, key='${OTHER_KEY}'), dict(self.body, secret=''),
                  dict(self.body, key=123), [], {'action': 'clear', 'anything': True}]
        for body in bodies:
            self.assertEqual(self.post(body).status_code, 400)
        self.assertFalse(self.path.exists())

    def test_settings_fail_closed_on_invalid_execution_mode_and_disk_failure(self):
        with patch.dict(os.environ, {'LAYLOW_EXECUTION_MODE': 'LIVE'}):
            status = self.client.get('/api/settings')
            self.assertTrue(status.json['live_locked'])
            self.assertEqual(status.json['configuration']['execution_mode'], 'UNAVAILABLE')
        with patch('app_settings.os.replace', side_effect=OSError('sensitive internal detail')):
            response = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn(b'sensitive', response.data)
        self.assertEqual(list(self.path.parent.glob('.broker-*')), [])

    def test_settings_assets_available_and_get_has_no_write(self):
        for url in ('/settings-ui.js', '/settings.css', '/api/settings'):
            response = self.client.get(url)
            self.addCleanup(response.close)
            self.assertEqual(response.status_code, 200)
            self.assertIn('no-store', response.headers['Cache-Control'])
        self.assertFalse(self.path.exists())


if __name__ == '__main__':
    unittest.main()
