# core/tasks.py
import logging
import os
import time

from celery import shared_task
from django.core.management import call_command

from core.views.fitbit_sync import fetch_fitbit_today_for_user

logger = logging.getLogger(__name__)
from core.models import (
    InterventionAssignment,
    Logs,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    SMSVerification,
    Therapist,
    User,
)


# If your PeriodicTask points to "core.tasks.run_delete_expired_videos"
@shared_task(
    name="core.tasks.run_delete_expired_videos",
    autoretry_for=(Exception,),
    retry_backoff=60,
    max_retries=5,
)
def run_delete_expired_videos():
    """
    Runs the Django management command 'delete_expired_videos'.

    Controlled by the ENABLE_MEDIA_AUTO_DELETE environment variable.
    Set it to "true" (or "1"/"yes") to enable automatic deletion of feedback
    videos and audios older than 14 days.  Defaults to disabled so existing
    deployments are unaffected until explicitly opted in.
    """
    enabled = os.environ.get("ENABLE_MEDIA_AUTO_DELETE", "").strip().lower()
    if enabled not in ("true", "1", "yes"):
        logger.info("[delete_expired_videos] skipped (ENABLE_MEDIA_AUTO_DELETE not set)")
        return "skipped"

    t0 = time.time()
    try:
        call_command("delete_expired_videos")
        elapsed = time.time() - t0
        logger.info("[delete_expired_videos] ✅ finished in %.1fs", elapsed)
        return "ok"
    except Exception:
        elapsed = time.time() - t0
        logger.exception("[delete_expired_videos] ❌ failed after %.1fs", elapsed)
        raise


# If your PeriodicTask points to "core.tasks.run_fetch_fitbit_data"
@shared_task(
    name="core.tasks.run_fetch_fitbit_data",
    autoretry_for=(Exception,),
    retry_backoff=60,
    max_retries=3,
)
def run_fetch_fitbit_data():
    t0 = time.time()
    try:
        call_command("fetch_fitbit_data")
        elapsed = time.time() - t0
        logger.info("[fetch_fitbit_data] ✅ finished in %.1fs", elapsed)
        return "ok"
    except Exception:
        elapsed = time.time() - t0
        logger.exception("[fetch_fitbit_data] ❌ failed after %.1fs", elapsed)
        raise


@shared_task(name="core.tasks.fetch_fitbit_data_async")
def fetch_fitbit_data_async(user_id):

    user = User.objects(pk=user_id).first()
    if user:
        fetch_fitbit_today_for_user(user)
