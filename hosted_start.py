"""Start the existing supervisor with persistent server-local settings."""
import os
from pathlib import Path


def prepare_runtime(root=None, directory=None):
    root = Path(root or Path(__file__).resolve().parent)
    directory = Path(directory or os.environ.get("LAYLOW_DATA_DIR", root / "runtime"))
    directory.mkdir(parents=True, exist_ok=True)
    settings = directory / ".env.local"
    if not settings.exists():
        # Never copy a developer's credentials into a server image.
        settings.touch(mode=0o600)
    settings.chmod(0o600)
    link = root / ".env.local"
    if link.is_symlink():
        if link.resolve() != settings.resolve():
            raise RuntimeError("Unexpected settings symlink")
    elif link.exists():
        raise RuntimeError("Refusing to replace existing local settings")
    else:
        link.symlink_to(settings.resolve())
    return directory


def main():
    prepare_runtime()
    from watchdog import main as supervise
    return supervise()


if __name__ == "__main__":
    raise SystemExit(main())
