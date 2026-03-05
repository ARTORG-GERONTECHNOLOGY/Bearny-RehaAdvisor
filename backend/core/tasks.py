# core/tasks.py
import logging
import os

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
        logger.info("ENABLE_MEDIA_AUTO_DELETE is not set to true — skipping media cleanup")
        return "skipped"

    call_command("delete_expired_videos")
    logger.info("✅ delete_expired_videos finished")
    return "ok"


# If your PeriodicTask points to "core.tasks.run_fetch_fitbit_data"
@shared_task(
    name="core.tasks.run_fetch_fitbit_data",
    autoretry_for=(Exception,),
    retry_backoff=60,
    max_retries=3,
)
def run_fetch_fitbit_data():
    try:
        call_command("fetch_fitbit_data")  # ✅ correct command name
        logger.info("✅ fetch_fitbit finished")
        return "ok"
    except Exception:
        logger.exception("❌ fetch_fitbit failed")
        raise


@shared_task(name="core.tasks.fetch_fitbit_data_async")
def fetch_fitbit_data_async(user_id):

    user = User.objects(pk=user_id).first()
    if user:
        fetch_fitbit_today_for_user(user)
