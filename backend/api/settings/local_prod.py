from .prod import *

# Local prod: running over HTTP, so secure-cookie flags must be off
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Allow localhost origin for the React dev/prod UI
CORS_ALLOWED_ORIGINS = [
    "https://reha-advisor.ch",
    "https://www.reha-advisor.ch",
    "http://localhost:8080",
    "http://localhost",
]

ALLOWED_HOSTS = [
    "reha-advisor.ch",
    "www.reha-advisor.ch",
    "django-localprod",
    "nginx-localprod",
    "localhost",
    "127.0.0.1",
]
