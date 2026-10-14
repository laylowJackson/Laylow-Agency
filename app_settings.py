"""Local credential setup only: no broker calls or execution-mode controls."""
import os
import re
import tempfile
from pathlib import Path
from dotenv import dotenv_values

FIELDS = ("ALPACA_API_KEY", "ALPACA_SECRET_KEY")


def credential_status(path):
    values = dotenv_values(path) if Path(path).exists() else {}
    return {"key_saved": bool(values.get(FIELDS[0]) or os.getenv(FIELDS[0])),
            "secret_saved": bool(values.get(FIELDS[1]) or os.getenv(FIELDS[1])),
            "connection_verified": False}


def save_credentials(path, body):
    if not isinstance(body, dict):
        raise ValueError("Invalid settings")
    if body == {"action": "clear"}:
        values = {name: "" for name in FIELDS}
    elif set(body) == {"action", "broker", "key", "secret"} and body.get("action") == "save" and body.get("broker") == "alpaca-paper":
        if any(not isinstance(body.get(field), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,512}", body[field]) for field in ("key", "secret")):
            raise ValueError("Invalid credential format")
        values = dict(zip(FIELDS, (body["key"], body["secret"])))
    else:
        raise ValueError("Unsupported settings")
    path = Path(path)
    original = path.read_text(encoding="utf-8-sig") if path.exists() else ""
    # Preserve all other settings and comments. Replace every duplicate key assignment.
    lines = [line for line in original.splitlines() if not any(
        re.match(r"^\s*(?:export\s+)?" + name + r"\s*=", line) for name in FIELDS)]
    lines += [name + "=" + values[name] for name in FIELDS]
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".broker-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(lines) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"saved": True, "restart_required": True, "orders_sent": False,
            "message": "Local credentials updated. Restart the app to load them. Execution modes are unchanged; connection has not been verified."}
