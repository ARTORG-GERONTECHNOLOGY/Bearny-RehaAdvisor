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

# Replace JWT authentication with a no-op test authenticator so that
# views decorated with @api_view + @permission_classes([IsAuthenticated])
# don't reject plain test-client requests.  Tests that specifically verify
# 401/403 behaviour should patch the permission class or use
# APIRequestFactory.force_authenticate().
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405  — imported via * above
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.test_auth.AlwaysAuthenticate",
    ],
}
