# core/tasks.py
import json
import logging
import os
import subprocess
import time
from datetime import timedelta
from datetime import timezone as datetime_timezone

from celery import shared_task
from django.conf import settings
from django.core.management import call_command
from django.utils import timezone
from mongoengine.errors import NotUniqueError

from core.views.fitbit_sync import fetch_fitbit_today_for_user
from core.views.google_health_sync import fetch_google_health_today_for_user

logger = logging.getLogger(__name__)
from core.models import (
    InterventionAssignment,
    Logs,
    Patient,
    PatientInterventionLogs,
    PushSubscription,
    RehabilitationPlan,
    SentPushNotification,
    SMSVerification,
    Therapist,
    User,
)
from core.notifications.categorize import resolve_notification_category
from core.notifications.push_translations import get_push_content
from utils.interventions import _safe_intervention

_LOG_RETENTION_DAYS = int(os.getenv("LOG_RETENTION_DAYS", "365"))
_AUDIT_EXPORT_RETENTION_DAYS = int(os.getenv("AUDIT_EXPORT_RETENTION_DAYS", "1825"))  # 5 years


@shared_task(
    name="core.tasks.prune_old_logs",
    autoretry_for=(Exception,),
    retry_backoff=120,
    max_retries=3,
)
def prune_old_logs():
    """
    Delete audit log entries older than LOG_RETENTION_DAYS (default 365).

    ADMIN_EXPORT entries are kept for AUDIT_EXPORT_RETENTION_DAYS (default 5 years)
    because they document who downloaded patient data and must be retained for
    compliance purposes.

    Set LOG_RETENTION_DAYS / AUDIT_EXPORT_RETENTION_DAYS in the environment to
    override. Set LOG_RETENTION_DAYS=0 to disable pruning.
    """
    if _LOG_RETENTION_DAYS <= 0:
        logger.info("[prune_old_logs] disabled (LOG_RETENTION_DAYS=0)")
        return {"deleted": 0}

    cutoff = timezone.now() - timedelta(days=_LOG_RETENTION_DAYS)
    export_cutoff = timezone.now() - timedelta(days=_AUDIT_EXPORT_RETENTION_DAYS)

    # Regular activity logs older than retention window
    regular = Logs.objects(
        timestamp__lt=cutoff,
        action__nin=["ADMIN_EXPORT"],
    ).delete()

    # Admin export audit trail — kept longer for compliance
    exports = Logs.objects(
        action="ADMIN_EXPORT",
        timestamp__lt=export_cutoff,
    ).delete()

    logger.info(
        "[prune_old_logs] deleted %d activity logs (cutoff=%s), %d export audit logs (cutoff=%s)",
        regular,
        cutoff.date(),
        exports,
        export_cutoff.date(),
    )
    return {"deleted_activity": regular, "deleted_exports": exports}


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


@shared_task(
    name="core.tasks.run_fetch_fitbit_data_today_all",
    autoretry_for=(Exception,),
    retry_backoff=120,
    max_retries=2,
)
def run_fetch_fitbit_data_today_all():
    """Fetch today's Fitbit data for every connected user (runs every 4 h).

    This keeps wearable data current even for patients who haven't opened the
    app, without the expense of a full 30-day back-fill on every run.
    """
    from core.models import FitbitUserToken

    tokens = FitbitUserToken.objects(is_revoked__ne=True).all()
    synced = 0
    errors = 0
    for token in tokens:
        try:
            result = fetch_fitbit_today_for_user(token.user, bypass_cooldown=False)
            synced += result
        except Exception:
            logger.exception("[fetch_fitbit_today_all] failed for user=%s", token.user)
            errors += 1

    logger.info("[fetch_fitbit_today_all] synced=%d errors=%d", synced, errors)
    return {"synced": synced, "errors": errors}


@shared_task(name="core.tasks.fetch_fitbit_data_async")
def fetch_fitbit_data_async(user_id):

    user = User.objects(pk=user_id).first()
    if user:
        fetch_fitbit_today_for_user(user, bypass_cooldown=True)


@shared_task(
    name="core.tasks.run_fetch_google_health_data",
    autoretry_for=(Exception,),
    retry_backoff=60,
    max_retries=3,
)
def run_fetch_google_health_data():
    t0 = time.time()
    try:
        call_command("fetch_google_health_data")
        elapsed = time.time() - t0
        logger.info("[fetch_google_health_data] ✅ finished in %.1fs", elapsed)
        return "ok"
    except Exception:
        elapsed = time.time() - t0
        logger.exception("[fetch_google_health_data] ❌ failed after %.1fs", elapsed)
        raise


@shared_task(name="core.tasks.fetch_google_health_data_async")
def fetch_google_health_data_async(user_id: str):
    user = User.objects(pk=user_id).first()
    if user:
        fetch_google_health_today_for_user(user)


@shared_task(
    name="core.tasks.sync_wearables_to_redcap_patient",
    autoretry_for=(Exception,),
    retry_backoff=60,
    max_retries=3,
)
def sync_wearables_to_redcap_patient(patient_id: str):
    """Sync wearables data to REDCap for a single patient by Patient ID."""
    from core.services.wearables_redcap_service import export_wearables_to_redcap

    patient = Patient.objects(pk=patient_id).first()
    if not patient:
        logger.warning("[sync_wearables] Patient not found")
        return {"error": "Patient not found"}

    results = export_wearables_to_redcap(patient)
    logger.info("[sync_wearables] %s → %s", patient.patient_code, results)
    return results


@shared_task(
    name="core.tasks.sync_wearables_to_redcap_all",
    autoretry_for=(Exception,),
    retry_backoff=120,
    max_retries=2,
)
def sync_wearables_to_redcap_all():
    """
    Nightly task: sync wearables to REDCap for all patients that have both
    a project and a reha_end_date set.
    """
    from core.services.wearables_redcap_service import export_wearables_to_redcap

    patients = Patient.objects(project__ne="", reha_end_date__ne=None)

    synced = 0
    errors = 0
    for patient in patients:
        if not (patient.project or "").strip():
            continue
        try:
            results = export_wearables_to_redcap(patient)
            logger.info("[sync_wearables_all] %s → %s", patient.patient_code, results)
            synced += 1
        except Exception as e:
            logger.warning("[sync_wearables_all] Skipped %s: %s", patient.patient_code, e)
            errors += 1

    logger.info("[sync_wearables_all] Done: %d synced, %d errors/skipped", synced, errors)
    return {"synced": synced, "errors": errors}


@shared_task(
    name="core.tasks.renew_certificates",
    autoretry_for=(Exception,),
    retry_backoff=300,
    max_retries=3,
)
def renew_certificates():
    """
    Renew Let's Encrypt certificates via certbot and reload the nginx gateway.

    Requires the following environment variables:
      CERTBOT_ENABLED=true           — set to enable; skipped if absent/false
      CERTBOT_CONF_PATH              — host path to ./nginx/certbot/conf (default: /etc/letsencrypt inside container)
      CERTBOT_WWW_PATH               — host path to ./nginx/certbot/www
      CERTBOT_NGINX_CONTAINER        — name of the container running gateway nginx (default: gateway)

    The task runs certbot via `docker run certbot/certbot renew` using the
    Docker socket mounted at /var/run/docker.sock. This avoids installing
    certbot inside the backend image and lets the dedicated certbot image
    handle OS-level certificate operations.

    Add the following to celery services in docker-compose:
      volumes:
        - /var/run/docker.sock:/var/run/docker.sock
        - ./nginx/certbot/conf:/etc/letsencrypt
        - ./nginx/certbot/www:/var/www/certbot
      environment:
        - CERTBOT_ENABLED=true
        - CERTBOT_CONF_PATH=<host-absolute-path>/nginx/certbot/conf
        - CERTBOT_WWW_PATH=<host-absolute-path>/nginx/certbot/www
        - CERTBOT_NGINX_CONTAINER=gateway
    """
    enabled = os.environ.get("CERTBOT_ENABLED", "").strip().lower()
    if enabled not in ("true", "1", "yes"):
        logger.info("[renew_certificates] skipped (CERTBOT_ENABLED not set)")
        return "skipped"

    conf_path = os.environ.get("CERTBOT_CONF_PATH", "").strip()
    www_path = os.environ.get("CERTBOT_WWW_PATH", "").strip()
    nginx_container = os.environ.get("CERTBOT_NGINX_CONTAINER", "gateway").strip()

    if not conf_path or not www_path:
        logger.error("[renew_certificates] CERTBOT_CONF_PATH and CERTBOT_WWW_PATH must be set")
        raise ValueError("CERTBOT_CONF_PATH and CERTBOT_WWW_PATH are required")

    logger.info("[renew_certificates] starting renewal (conf=%s, nginx=%s)", conf_path, nginx_container)
    t0 = time.time()

    cmd = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{conf_path}:/etc/letsencrypt",
        "-v",
        f"{www_path}:/var/www/certbot",
        "certbot/certbot",
        "renew",
        "--non-interactive",
        "--quiet",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    elapsed = time.time() - t0

    if result.stdout:
        logger.info("[renew_certificates] certbot stdout:\n%s", result.stdout.strip())
    if result.stderr:
        logger.warning("[renew_certificates] certbot stderr:\n%s", result.stderr.strip())

    if result.returncode != 0:
        logger.error(
            "[renew_certificates] certbot exited with code %d after %.1fs",
            result.returncode,
            elapsed,
        )
        raise RuntimeError(f"certbot renew failed (exit {result.returncode})")

    logger.info("[renew_certificates] certbot finished in %.1fs — reloading %s", elapsed, nginx_container)

    reload = subprocess.run(
        ["docker", "exec", nginx_container, "nginx", "-s", "reload"],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if reload.returncode != 0:
        logger.error(
            "[renew_certificates] nginx reload failed: %s",
            reload.stderr.strip() or reload.stdout.strip(),
        )
        raise RuntimeError(f"nginx reload failed (exit {reload.returncode})")

    logger.info("[renew_certificates] ✅ certificates renewed and nginx reloaded")
    return "renewed"


def _as_aware_utc(dt):
    """
    Treat naive datetimes as UTC, not local server time.

    The mongoengine connection uses tz_aware=False (core/apps.py), so any
    aware datetime written to InterventionAssignment.dates round-trips back
    as a naive value holding the UTC instant, not local time. This mirrors
    patient_views.py::_as_aware_utc, the convention already established for
    this exact field (all writers there normalize to UTC before saving, e.g.
    reschedule_intervention_date's past_utc/future_utc/existing_utc).
    """
    if dt is None:
        return None
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, datetime_timezone.utc)
    return dt.astimezone(datetime_timezone.utc)


def _send_push_to_patient(patient: Patient, category: str) -> None:
    from pywebpush import WebPushException, webpush

    content = get_push_content(patient.preferred_language, category)
    if not content.get("title"):
        return

    payload = json.dumps(
        {
            "title": content["title"],
            "body": content.get("body", ""),
            "url": "/",
            "tag": f"bearny-{category}",
        }
    )

    for subscription in PushSubscription.objects(patient=patient):
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.keys_p256dh,
                        "auth": subscription.keys_auth,
                    },
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"},
                # requests has no default timeout, so set one to avoid hanging the worker.
                timeout=10,
            )
            subscription.last_used_at = timezone.now()
            subscription.save()
        except WebPushException as e:
            status_code = getattr(e.response, "status_code", None)
            if status_code in (404, 410):
                logger.info("[send_push] stale subscription removed (patient=%s)", patient.id)
                subscription.delete()
            else:
                logger.warning("[send_push] webpush failed for patient=%s: %s", patient.id, e)
        except Exception:
            # Don't let one bad subscription abort the loop for other patients.
            logger.exception("[send_push] unexpected error sending to patient=%s", patient.id)


def _due_assignment_dates(plan, window_start, window_end):
    """Yield (assignment, dt) pairs from plan.interventions whose date falls in the window."""
    for assignment in plan.interventions:
        for raw_dt in assignment.dates:
            dt = _as_aware_utc(raw_dt)
            if dt is not None and window_start <= dt < window_end:
                yield assignment, dt


def _notify_if_due(plan, patient, assignment, dt) -> str:
    """Send (or skip) one due notification. Returns 'sent', 'skipped', or 'duplicate'."""
    intervention = _safe_intervention(assignment)
    if intervention is None:
        return "skipped"
    category = resolve_notification_category(intervention.aim)

    # Fail closed: missing prefs or attribute means "not enabled".
    prefs = patient.notification_preferences
    category_enabled = bool(getattr(prefs, category, False)) if prefs is not None else False
    if not category_enabled:
        return "skipped"

    try:
        SentPushNotification(
            patient=patient,
            rehab_plan=plan,
            intervention=intervention,
            scheduled_at=dt,
            category=category,
        ).save()
    except NotUniqueError:
        return "duplicate"  # already sent for this exact scheduled date

    _send_push_to_patient(patient, category)
    return "sent"


@shared_task(
    name="core.tasks.send_due_intervention_push_notifications",
    autoretry_for=(Exception,),
    retry_backoff=30,
    max_retries=2,
)
def send_due_intervention_push_notifications():
    """
    Runs hourly, on the hour (see seed_periodic_tasks). Finds
    InterventionAssignment scheduled `dates` entries due in the past hour,
    and pushes a notification to each patient who has that intervention's
    category (Intervention.aim, mapped via resolve_notification_category)
    enabled in their notification_preferences.

    Note: because this only runs once per hour, a date scheduled just after
    the top of the hour won't notify until up to ~59 minutes later, at the
    next run. There is no catch-up logic: if Beat/the worker is down for
    longer than an hour, any dates that fell in the resulting gap are
    permanently skipped, not just delayed — the next run only ever looks at
    the hour immediately before it.

    Dedup is enforced by SentPushNotification's unique compound index, not by
    mutating the embedded InterventionAssignment.dates list in place — safer
    under retried/concurrent task runs.
    """
    window_end = timezone.now().replace(minute=0, second=0, microsecond=0)
    window_start = window_end - timedelta(hours=1)

    # Coarse DB-level pre-filter: narrows candidate plans. Mongo can't
    # guarantee the $gte/$lte conditions land on the same array element two
    # levels deep (interventions[].dates[]), so we re-check exactly in Python.
    candidates = RehabilitationPlan.objects(
        status="active",
        startDate__lte=window_end,
        endDate__gte=window_start,
        interventions__dates__gte=window_start,
        interventions__dates__lte=window_end,
    )

    counts = {"sent": 0, "skipped": 0, "duplicate": 0}
    for plan in candidates:
        patient = plan.patientId
        if patient is None:
            continue
        for assignment, dt in _due_assignment_dates(plan, window_start, window_end):
            outcome = _notify_if_due(plan, patient, assignment, dt)
            counts[outcome] += 1

    logger.info("[send_due_intervention_push_notifications] %s", counts)
    return counts
