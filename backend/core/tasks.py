# core/tasks.py
import logging
import os
import subprocess
import time
from datetime import timedelta

from celery import shared_task
from django.core.management import call_command
from django.utils import timezone

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

    tokens = FitbitUserToken.objects.all()
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
