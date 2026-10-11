import shutil
import subprocess
import unittest
from pathlib import Path


class WickKnowledgeTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for the browser math module')
    def test_context_and_measurements(self):
        result = subprocess.run([shutil.which('node'), str(Path(__file__).with_suffix('.cjs'))],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
