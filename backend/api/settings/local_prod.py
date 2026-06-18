from .prod import *

# Local prod: running over HTTP, so secure-cookie flags must be off
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Allow localhost origin for the React dev/prod UI
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://reha-advisor.ch")
CORS_ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "https://reha-advisor.ch",
    "https://www.reha-advisor.ch",
    "http://localhost:8080",
    "http://localhost",
    "http://127.0.0.1:8080",
    "http://127.0.0.1",
]

ALLOWED_HOSTS = [
    "reha-advisor.ch",
    "www.reha-advisor.ch",
    "django-localprod",
    "nginx-localprod",
    "localhost",
    "127.0.0.1",
]
