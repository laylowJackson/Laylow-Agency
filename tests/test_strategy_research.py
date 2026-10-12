import shutil
import subprocess
import unittest
from pathlib import Path

class StrategyResearchTests(unittest.TestCase):
    def test_research_engine(self):
        node=shutil.which('node')
        if not node:
            self.skipTest('Node.js required for browser research engine checks')
        result=subprocess.run([node,str(Path(__file__).with_suffix('.cjs'))],capture_output=True,text=True,timeout=45)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_routes(self):
        import tempfile
        from dashboard import create_app
        directory=tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        client=create_app(db_path=Path(directory.name)/'research.db').test_client()
        for name,mime in [('strategy-research.js','javascript'),('strategy-research.css','text/css')]:
            response=client.get('/'+name)
            self.addCleanup(response.close)
            self.assertEqual(response.status_code,200)
            self.assertIn(mime,response.content_type)
