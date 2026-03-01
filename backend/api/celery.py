# api/celery.py
import os

from celery import Celery
from mongoengine import connect


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


if not _as_bool(os.environ.get("DISABLE_MONGO_CONNECT"), default=False):
    kwargs = {
        "db": os.environ.get("DB_NAME"),
        "host": os.environ.get("DB_HOST") or os.environ.get("MONGODB_URI"),
        "port": int(os.environ.get("DB_PORT", "27017")),
        "username": os.environ.get("MONGO_INITDB_ROOT_USERNAME"),
        "password": os.environ.get("MONGO_INITDB_ROOT_PASSWORD"),
        "authentication_source": os.environ.get("MONGO_INITDB_AUTH_SOURCE", "admin"),
    }

    if _as_bool(os.environ.get("MONGO_TLS"), default=True):
        kwargs["tls"] = True
        ca_file = os.environ.get("MONGO_TLS_CA_FILE", "/etc/ssl/mongo/ca.crt")
        if os.path.exists(ca_file):
            kwargs["tlsCAFile"] = ca_file
    else:
        kwargs["tls"] = False

    connect(**kwargs)

# Must come before Celery starts
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings.base")

app = Celery("api")

# Load settings with CELERY_ prefix
app.config_from_object("django.conf:settings", namespace="CELERY")

# Optional: configure additional Celery settings explicitly
app.conf.worker_state_db = os.getenv("CELERY_WORKER_STATE_DB", "celery_worker.state")

# 🔧 Fix for crashing issue:
# Celery expects `worker_prefetch_multiplier` in lowercase, not namespaced
app.conf.worker_prefetch_multiplier = int(os.getenv("CELERY_WORKER_PREFETCH_MULTIPLIER", 1))

app.autodiscover_tasks()
