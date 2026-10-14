import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from hosted_start import prepare_runtime


class HostedStartTests(unittest.TestCase):
    def test_existing_local_settings_are_never_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            local = root / '.env.local'
            local.write_text('existing-private-settings')
            with self.assertRaises(RuntimeError):
                prepare_runtime(root, root / 'runtime')
            self.assertEqual(local.read_text(), 'existing-private-settings')

    def test_server_settings_survive_restart(self):
        # Mock only symlink creation so this is portable to Windows without
        # administrator/developer-mode symlink privileges.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runtime = root / 'runtime'
            with patch.object(Path, 'symlink_to'):
                prepare_runtime(root, runtime)
                settings = runtime / '.env.local'
                self.assertEqual(settings.read_text(), '')
                settings.write_text('retained-test-setting')
                prepare_runtime(root, runtime)
                self.assertEqual(settings.read_text(), 'retained-test-setting')

    def test_container_keeps_existing_security_defaults(self):
        root = Path(__file__).resolve().parents[1]
        compose = (root / 'compose.yaml').read_text()
        self.assertIn('network_mode: host', compose)
        self.assertNotIn('ports:', compose)
        self.assertIn('LAYLOW_EXECUTION_MODE: PRACTICE', compose)
        self.assertIn('LAYLOW_SHADOW_MODE: "true"', compose)
        self.assertIn('LAYLOW_ALLOW_PAPER_ORDERS: "false"', compose)
        self.assertIn('agency-runtime:/app/runtime', compose)
        dockerfile = (root / 'Dockerfile').read_text()
        self.assertIn('USER laylow', dockerfile)
        self.assertIn('ln -s /app/runtime/.env.local /app/.env.local', dockerfile)


if __name__ == '__main__':
    unittest.main()
