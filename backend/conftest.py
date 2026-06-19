"""
Root pytest configuration — loaded before any test module.

Sets settings.TESTING = True so JWTAuthMiddleware skips token enforcement
during tests.

The container always exports DJANGO_SETTINGS_MODULE=api.settings.dev, which
would override pytest.ini's api.settings.test if Django were set up before
the env var is patched.  This hook explicitly forces the test settings module
before Django starts, then reloads DRF's cached settings so the AlwaysAuthenticate
swap also takes effect.
"""

import os

# Force test settings BEFORE anything else loads, including pytest-django's
# pytest_configure hook.  The container always exports api.settings.dev via
# the environment variable; overriding it here makes sure Django is
# initialised with the test settings module.
os.environ["DJANGO_SETTINGS_MODULE"] = "api.settings.test"


def pytest_configure(config):
    import django
    from django.conf import settings as _settings

    # Ensure Django is configured.  If pytest-django already called setup()
    # first (using the now-overridden env var), this is a no-op, but the
    # correct settings module will be in use because we set the env var above
    # at module-import time.
    django.setup()

    _settings.TESTING = True  # belt-and-suspenders (already in test.py)

    # DRF caches api_settings at first import.  Reload so the AlwaysAuthenticate
    # override in test.py is actually picked up by @api_view decorated views.
    try:
        from rest_framework.settings import api_settings

        api_settings.reload()
    except Exception:
        pass
