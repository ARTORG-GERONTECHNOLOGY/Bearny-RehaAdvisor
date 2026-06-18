"""
Test-environment Django settings.

Extends dev settings and adds TESTING = True so that JWTAuthMiddleware skips
token enforcement — allowing DRF's force_authenticate() to work in tests
without every test needing to generate a real JWT token.
"""

from .dev import *  # noqa: F401, F403

# Signals to JWTAuthMiddleware (and any other auth layer) that requests come
# from the test runner and should not require a real Bearer token.
TESTING = True
