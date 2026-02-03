from .base import *
import os
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEBUG = os.environ.get('DEBUG', 'False') == 'True'  # Enable detailed error messages and auto-reload

# CORS
CORS_ALLOWED_ORIGINS = [
    "https://dev.reha-advisor.ch",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_CREDENTIALS = True
SECRET_KEY = os.environ.get('SECRET_KEY')

STATICFILES_DIRS = [BASE_DIR / "static"]

ALLOWED_HOSTS=["localhost", "127.0.0.1", "django", "nginx", "dev.reha-advisor.ch"]

SECURE_PROXY_SSL_HEADER = (
    os.getenv("SECURE_PROXY_SSL_HEADER_NAME", "HTTP_X_FORWARDED_PROTO"),
    os.getenv("SECURE_PROXY_SSL_HEADER_VALUE", "https"),
)

SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'False') == 'True'

SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False') == 'True'
CSRF_COOKIE_SECURE = os.environ.get('CSRF_COOKIE_SECURE', 'False')

# Fitbit settings
FITBIT_CLIENT_ID = os.environ.get('FITBIT_CLIENT_ID')
FITBIT_CLIENT_SECRET = os.environ.get('FITBIT_CLIENT_SECRET')
FITBIT_REDIRECT_URI = os.environ.get('FITBIT_REDIRECT_URI')
FRONTEND_URL = os.environ.get('FRONTEND_URL')

