import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


class ResearchEvidenceTests(unittest.TestCase):
    def test_engine(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js required for bot research checks')
        result = subprocess.run([node, str(Path(__file__).with_suffix('.cjs'))], capture_output=True, text=True, timeout=45)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_explicit_assets_only(self):
        from dashboard import create_app
        with tempfile.TemporaryDirectory() as directory:
            client = create_app(db_path=Path(directory) / 'test.db').test_client()
            for name in ['research-evidence.js', 'historical-research.js', 'historical-research-worker.js', 'research-station-ui.js']:
                response = client.get('/' + name)
                self.addCleanup(response.close)
                self.assertEqual(response.status_code, 200)
                self.assertIn('javascript', response.content_type)
            response = client.get('/../.env.local')
            self.assertEqual(response.status_code, 404)
