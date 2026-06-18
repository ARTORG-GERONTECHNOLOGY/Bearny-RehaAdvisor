"""
Root pytest configuration — loaded before any test module.

Sets settings.TESTING = True so JWTAuthMiddleware skips token enforcement
during tests. This works regardless of which DJANGO_SETTINGS_MODULE is
active (the container always exports api.settings.dev via the environment
variable, which takes precedence over pytest.ini).
"""

import django
from django.conf import settings


def pytest_configure(config):
    # Ensure Django is set up before we touch settings
    django.setup()
    settings.TESTING = True
