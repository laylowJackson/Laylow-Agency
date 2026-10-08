import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from package_build import build_archive


class PackageTests(unittest.TestCase):
    def test_archive_has_blank_template_and_no_runtime_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = build_archive(Path(directory) / "download.zip")
            with ZipFile(path) as archive:
                names = archive.namelist()
                self.assertIn("Laylow-Agency/START_WINDOWS.bat", names)
                self.assertIn("Laylow-Agency/team_worker.py", names)
                self.assertFalse(any(name.endswith((".db", ".env", ".env.local", ".log"))
                                     or ".venv" in name for name in names))
                template = archive.read("Laylow-Agency/.env.example").decode()
                for name in ("OPENAI_API_KEY", "ALPACA_API_KEY", "ALPACA_SECRET_KEY"):
                    self.assertIn(name + "=\n", template)


if __name__ == "__main__":
    unittest.main()
