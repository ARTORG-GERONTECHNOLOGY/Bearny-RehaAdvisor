from .base import *

DEBUG = False
CORS_ALLOWED_ORIGINS = [
    "https://reha-advisor.ch",
    "https://www.reha-advisor.ch",
]
CORS_ALLOW_CREDENTIALS = True

ALLOWED_HOSTS = ['django', 'nginx', 'reha-advisor.ch', 'www.reha-advisor.ch', '127.0.0.1', 'localhost']

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'false').lower() == 'true'

STATIC_ROOT = BASE_DIR / "static"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True




