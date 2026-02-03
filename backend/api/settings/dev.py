from .base import *
import os

DEBUG = os.environ.get('DEBUG', 'False') == 'True'  # Enable detailed error messages and auto-reload

CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',')
CORS_ALLOW_CREDENTIALS = os.environ.get('CORS_ALLOW_CREDENTIALS', 'True') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

SECURE_PROXY_SSL_HEADER = os.environ.get('SECURE_PROXY_SSL_HEADER', None)
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'False') == 'True'

STATICFILES_DIRS = os.environ.get('STATICFILES_DIRS', BASE_DIR / 'frontend_static')
SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False') == 'True'
CSRF_COOKIE_SECURE = os.environ.get('CSRF_COOKIE_SECURE', 'False')

# Fitbit settings
FITBIT_CLIENT_ID = os.environ.get('FITBIT_CLIENT_ID')
FITBIT_CLIENT_SECRET = os.environ.get('FITBIT_CLIENT_SECRET')
FITBIT_REDIRECT_URI = os.environ.get('FITBIT_REDIRECT_URI')
FRONTEND_URL = os.environ.get('FRONTEND_URL')

