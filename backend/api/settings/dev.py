from .base import *

DEBUG = True  # Enable detailed error messages and auto-reload

CORS_ALLOWED_ORIGINS = [
    "https://dev.reha-advisor.ch",  # allow the dev subdomain
    "http://localhost:3000",        # allow Vite dev server
    "http://127.0.0.1:3000"
]
CORS_ALLOW_CREDENTIALS = True

ALLOWED_HOSTS = [
    "localhost", "127.0.0.1", "django", "nginx", "dev.reha-advisor.ch"
]

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False  # Disable forced HTTPS redirect in dev

STATICFILES_DIRS = [BASE_DIR / "static"]  # if using non-collected static
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Fitbit settings
FITBIT_CLIENT_ID = '23QHGK'
FITBIT_CLIENT_SECRET = 'ff87f98918198616ecf5c9b66a81482e'
FITBIT_REDIRECT_URI = 'https://dev.reha-advisor.ch/api/fitbit/callback/'
FRONTEND_URL = 'https://dev.reha-advisor.ch'