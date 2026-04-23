from .base import *

DEBUG = False

SECRET_KEY = os.environ.get("SECRET_KEY")

CORS_ALLOWED_ORIGINS = [
    "https://reha-advisor.ch",
    "https://www.reha-advisor.ch",
]
CORS_ALLOW_CREDENTIALS = True

ALLOWED_HOSTS = [
    "django",
    "nginx",
    "reha-advisor.ch",
    "www.reha-advisor.ch",
    "127.0.0.1",
    "localhost",
]

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "false").lower() == "true"

STATIC_ROOT = BASE_DIR / "static"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Fitbit settings (legacy — keep until all users have migrated)
FITBIT_CLIENT_ID = os.environ.get("FITBIT_CLIENT_ID", "")
FITBIT_CLIENT_SECRET = os.environ.get("FITBIT_CLIENT_SECRET", "")
FITBIT_REDIRECT_URI = os.environ.get("FITBIT_REDIRECT_URI", "https://reha-advisor.ch/api/fitbit/callback/")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://reha-advisor.ch")

# Google Health / Google Fit settings
GOOGLE_HEALTH_CLIENT_ID = os.environ.get("GOOGLE_HEALTH_CLIENT_ID", "")
GOOGLE_HEALTH_CLIENT_SECRET = os.environ.get("GOOGLE_HEALTH_CLIENT_SECRET", "")
GOOGLE_HEALTH_REDIRECT_URI = os.environ.get(
    "GOOGLE_HEALTH_REDIRECT_URI", "https://reha-advisor.ch/api/google-health/callback/"
)

# REDCap settings
REDCAP_API_URL = os.environ.get("REDCAP_API_URL", "https://redcap.unibe.ch/api/")
REDCAP_TOKEN_COPAIN = os.environ.get("REDCAP_TOKEN_COPAIN", "")
REDCAP_TOKEN_COMPASS = os.environ.get("REDCAP_TOKEN_COMPASS", "")

# Celery / Redis — the compose file injects CELERY_BROKER_URL directly,
# but we also read it here so manage.py commands outside compose work.
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", CELERY_BROKER_URL)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_RESULT_BACKEND)
