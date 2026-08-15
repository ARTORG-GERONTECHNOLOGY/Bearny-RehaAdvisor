# Web Push endpoint allowlist — SSRF guard.
#
# Patients submit `endpoint` directly via POST /push-subscription/, and
# core.tasks._send_push_to_patient later makes a server-side HTTP request to
# it (pywebpush.webpush). Without validation, a patient could register an
# internal URL (cloud metadata, an internal service, ...) and the hourly
# task would dutifully POST to it.
#
# Hardcoded rather than configurable: this is a fixed set of trusted push
# vendor hosts, not environment-specific config, and changing it should
# require a code review.
#
# The host list below covers all major browser push services. Some entries
# (e.g. the legacy GCM hosts) are for older subscriptions predating a
# vendor's migration to their current push service, and are kept so those
# patients don't silently stop receiving push notifications.

import ipaddress
from urllib.parse import urlparse

ALLOWED_PUSH_ENDPOINT_HOSTS = (
    "android.googleapis.com",  # legacy GCM (pre-FCM Chrome/Android subscriptions)
    "fcm.googleapis.com",  # Chrome, Edge, Opera, Brave, Samsung Internet (all Chromium/FCM)
    "jmt17.google.com",  # legacy GCM front-end
    "updates.push.services.mozilla.com",  # Firefox
    "updates-autopush.stage.mozaws.net",  # Firefox Beta
    "updates-autopush.dev.mozaws.net",  # Firefox Nightly/dev
    "*.notify.windows.com",  # legacy pre-Chromium Edge
    "*.push.apple.com",  # Safari (macOS 13+ / iOS 16.4+)
)


def _host_matches_allowlist(host: str) -> bool:
    for allowed in ALLOWED_PUSH_ENDPOINT_HOSTS:
        if allowed.startswith("*."):
            if host.endswith(allowed[1:]):  # e.g. ".notify.windows.com"
                return True
        elif host == allowed:
            return True
    return False


def is_allowed_push_endpoint(url: str) -> bool:
    """https, non-IP host, host on (or a subdomain of, for the wildcard case)
    ALLOWED_PUSH_ENDPOINT_HOSTS."""
    parsed = urlparse(url or "")
    if parsed.scheme != "https":
        return False

    host = (parsed.hostname or "").lower()
    if not host:
        return False

    try:
        ipaddress.ip_address(host)
        return False  # real push endpoints are always FQDNs, never raw IP literals
    except ValueError:
        pass

    return _host_matches_allowlist(host)
