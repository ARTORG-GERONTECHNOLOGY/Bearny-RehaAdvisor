"""
Tests for the Web Push endpoint allowlist (SSRF guard)
========================================================

Covers core.notifications.push_endpoints.is_allowed_push_endpoint.
"""

import pytest

from core.notifications.push_endpoints import is_allowed_push_endpoint


@pytest.mark.parametrize(
    "url",
    [
        "https://android.googleapis.com/gcm/send/abc123",
        "https://fcm.googleapis.com/fcm/send/abc123",
        "https://jmt17.google.com/gcm/send/abc123",
        "https://updates.push.services.mozilla.com/wpush/v2/abc123",
        "https://updates-autopush.stage.mozaws.net/wpush/v2/abc123",
        "https://updates-autopush.dev.mozaws.net/wpush/v2/abc123",
        "https://client.notify.windows.com/abc123",
        "https://sub.client.notify.windows.com/abc123",
        "https://web.push.apple.com/QAbc123",
        "https://api.push.apple.com/QAbc123",
    ],
)
def test_allows_known_vendor_endpoints(url):
    assert is_allowed_push_endpoint(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "http://fcm.googleapis.com/fcm/send/abc123",  # not https
        "https://169.254.169.254/latest/meta-data/",  # raw IP (cloud metadata)
        "https://127.0.0.1/abc",  # raw IP (loopback)
        "https://evil.example.com/abc",  # unknown host
        "https://fcm.googleapis.com.evil.com/abc",  # lookalike suffix, not a subdomain
        "https://notify.windows.com.evil.com/abc",  # lookalike suffix for wildcard host
        "https://push.apple.com.evil.com/abc",  # lookalike suffix for wildcard host
        "https://push.apple.com/abc",  # bare host, not a subdomain — wildcard requires one
        "not-a-url",
        "",
        None,
    ],
)
def test_rejects_disallowed_endpoints(url):
    assert is_allowed_push_endpoint(url) is False
