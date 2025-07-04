# api/celery.py
import os
from celery import Celery

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
