"""Opt-in private HTTPS access through Tailscale Serve.

The Python dashboard still binds to loopback. Only a request locally forwarded
to an explicitly configured tailnet hostname may be recognized as HTTPS.
Do not use with Tailscale Funnel or an untrusted reverse proxy.
"""
import os
import re


LOOPBACK = frozenset({"127.0.0.1", "::1", "localhost"})
_TAILNET_NAME = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.ts\.net$"
)


def configured_hostname():
    name = os.getenv("LAYLOW_TAILSCALE_HOSTNAME", "").strip().lower()
    if not name:
        return None
    if len(name) > 253 or not _TAILNET_NAME.fullmatch(name):
        raise ValueError("LAYLOW_TAILSCALE_HOSTNAME must be an exact *.ts.net device hostname")
    return name


def _bare_host(value):
    if not isinstance(value, str) or "," in value or "@" in value:
        return ""
    return value.strip().split(":", 1)[0].lower()


class TailnetHttpsProxy:
    """Recognize HTTPS *only* via a configured localhost Tailscale Serve proxy."""

    def __init__(self, app, hostname):
        self.app = app
        self.hostname = hostname

    def __call__(self, environ, start_response):
        remote = environ.get("REMOTE_ADDR")
        host = _bare_host(environ.get("HTTP_HOST", ""))
        forwarded_host = _bare_host(environ.get("HTTP_X_FORWARDED_HOST", ""))
        proto = environ.get("HTTP_X_FORWARDED_PROTO", "")
        if (self.hostname and remote in {"127.0.0.1", "::1"}
                and (host == self.hostname or forwarded_host == self.hostname)
                and proto == "https"
                and environ.get("HTTP_TAILSCALE_USER_LOGIN")):
            # Normalize the origin used by existing login / CSRF protections.
            environ["wsgi.url_scheme"] = "https"
            environ["HTTP_HOST"] = self.hostname
        return self.app(environ, start_response)


def allowed_request(host, scheme, remote, hostname, tailscale_user=None):
    if host in LOOPBACK:
        return True
    return bool(hostname and host == hostname and scheme == "https"
                and remote in {"127.0.0.1", "::1"} and tailscale_user)
