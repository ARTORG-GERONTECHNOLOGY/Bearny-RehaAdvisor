# core/tasks.py
import logging
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
@shared_task(name="core.tasks.run_delete_expired_videos",
             autoretry_for=(Exception,), retry_backoff=60, max_retries=5)
def run_delete_expired_videos():
    """
    Runs the Django management command 'delete_expired_videos'.
    Prefer direct function calls if you have a service function.
    """
    call_command("delete_expired_videos")
    logger.info("✅ delete_expired_videos finished")
    return "ok"

# If your PeriodicTask points to "core.tasks.run_fetch_fitbit_data"
@shared_task(name="core.tasks.run_fetch_fitbit_data",
             autoretry_for=(Exception,), retry_backoff=60, max_retries=3)
def run_fetch_fitbit_data():
    """
    Runs the Django management command that fetches Fitbit data.
    If your command is named 'fetch_fitbit_data' or 'fetch_fitbit_extended',
    match that name here.
    """
    call_command("fetch_fitbit_extended")  # or "fetch_fitbit_data" if that's your command name
    logger.info("✅ fetch_fitbit_extended finished")
    return "ok"

@shared_task(name='core.tasks.fetch_fitbit_data_async') 
def fetch_fitbit_data_async(user_id):
    
    user = User.objects(pk=user_id).first()
    if user:
        fetch_fitbit_today_for_user(user)