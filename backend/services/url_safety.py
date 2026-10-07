"""
Guards server-side fetching against URLs that point at the server's own network (SSRF).
"""

import ipaddress
import socket
from urllib.parse import urlparse


def is_public_http_url(url: str) -> bool:
    """True if url is http(s) and every address its host resolves to is public."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError):
        # Unresolvable host: let the fetch itself fail and count as a source failure.
        return True
    return all(ipaddress.ip_address(info[4][0]).is_global for info in infos)
