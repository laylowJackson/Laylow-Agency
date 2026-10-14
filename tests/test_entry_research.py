import shutil
import subprocess
import unittest
from pathlib import Path


class EntryResearchTests(unittest.TestCase):
    def test_engine(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js required for entry-research checks')
        result = subprocess.run([node, str(Path(__file__).with_suffix('.cjs'))], capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_asset(self):
        from dashboard import create_app
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            response = create_app(db_path=Path(directory) / 'test.db').test_client().get('/entry-research.js')
            self.addCleanup(response.close)
            self.assertEqual(response.status_code, 200)
            self.assertIn('javascript', response.content_type)
