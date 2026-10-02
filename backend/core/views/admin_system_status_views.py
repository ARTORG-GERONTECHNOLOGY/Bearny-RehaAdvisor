"""Admin-only snapshot of background jobs and services, so prod can be checked without shell access."""

import datetime
from datetime import timedelta

import redis
import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django_celery_beat.models import PeriodicTask
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.models import FitbitUserToken, GoogleHealthUserToken, SentPushNotification, TaskRun
from core.permissions import IsAdmin
from core.signals import summarize_error

CACHE_KEY = "admin_system_status"
CACHE_SECONDS = 60
EXTERNAL_TIMEOUT_S = 2
TRANSLATION_TIMEOUT_S = 3

OVERDUE_GRACE = timedelta(minutes=30)
QUEUE_WARN_LENGTH = 50
STALE_SYNC_AFTER = timedelta(hours=24)
STALE_SYNC_WARN = 3
REVOKED_WINDOW = timedelta(days=7)
REVOKED_WARN = 3
RECENT_START = timedelta(minutes=30)
EXPECTED_LANGUAGES = 6  # LT_LOAD_ONLY in the prod compose file

# Set when this worker first imports the view, i.e. close to the gunicorn worker start.
STARTED_AT = timezone.now()

_RANK = {"error": 3, "warn": 2, "ok": 1}


def _aware(value):
    # Mongo returns naive UTC datetimes.
    if value is None or timezone.is_aware(value):
        return value
    return value.replace(tzinfo=datetime.timezone.utc)


def _iso(value):
    value = _aware(value)
    return value.isoformat() if value else None


def _worst(statuses):
    ranked = [s for s in statuses if s in _RANK]
    return max(ranked, key=_RANK.get) if ranked else "unknown"


def _schedule_label(pt: PeriodicTask) -> str:
    if pt.crontab_id:
        c = pt.crontab
        return f"{c.minute} {c.hour} {c.day_of_month} {c.month_of_year} {c.day_of_week}"
    if pt.interval_id:
        return f"every {pt.interval.every} {pt.interval.period}"
    return ""


def job_status(pt: PeriodicTask, run: TaskRun | None) -> tuple[str, str]:
    """Return (status, reason); reason is a stable code the frontend translates."""
    if not pt.enabled:
        return "info", "disabled"
    run = run or TaskRun()
    started = _aware(run.last_started_at)
    success = _aware(run.last_success_at)
    failure = _aware(run.last_failure_at)
    if failure and (success is None or failure > success):
        return "error", "failed"
    if success is None and started is None:
        # No TaskRun yet: beat's own dispatch time (or worker start) still reveals a dead scheduler.
        if _is_overdue(pt, _aware(pt.last_run_at) or STARTED_AT):
            return "error", "overdue"
        return "unknown", "no_data"

    running = _is_running(started, success)
    # Anchor on the last success: killed runs record no outcome, so each new start would otherwise reset the clock.
    slack = timedelta(seconds=run.last_duration_s or 0) if running else timedelta(0)
    if _is_overdue(pt, success or started, slack):
        return "error", "overdue"
    return ("ok", "running") if running else ("ok", "ok")


def _is_running(started, success) -> bool:
    return started is not None and (success is None or started > success)


def _is_overdue(pt: PeriodicTask, reference, slack=timedelta(0)) -> bool:
    if not (pt.crontab_id or pt.interval_id) or pt.one_off:
        return False
    schedule = pt.schedule
    tz = getattr(schedule, "tz", None)
    if tz is not None:
        # Crontab fields are read in the datetime's own zone; beat converts the same way in is_due.
        reference = reference.astimezone(tz)
    # remaining_estimate is the time from now until the next run due after `reference`; negative means missed.
    return schedule.remaining_estimate(reference) < -(OVERDUE_GRACE + slack)


def _jobs_section():
    runs = {r.name: r for r in TaskRun.objects()}
    jobs = []
    for pt in PeriodicTask.objects.select_related("crontab", "interval").order_by("name"):
        run = runs.get(pt.name)
        status, reason = job_status(pt, run)
        jobs.append(
            {
                "name": pt.name,
                "task": pt.task,
                "schedule": _schedule_label(pt),
                "timezone": str(pt.crontab.timezone) if pt.crontab_id else None,
                "enabled": pt.enabled,
                "status": status,
                "reason": reason,
                "last_run_at": _iso(pt.last_run_at),
                "last_started_at": _iso(run.last_started_at) if run else None,
                "last_success_at": _iso(run.last_success_at) if run else None,
                "last_failure_at": _iso(run.last_failure_at) if run else None,
                "last_duration_s": run.last_duration_s if run else None,
                "last_error": (run.last_error or None) if run else None,
            }
        )
    return {"status": _worst(j["status"] for j in jobs), "items": jobs}


def _queue_section():
    url = settings.CELERY_BROKER_URL
    kwargs = {"socket_timeout": EXTERNAL_TIMEOUT_S, "socket_connect_timeout": EXTERNAL_TIMEOUT_S}
    ssl_options = getattr(settings, "BROKER_USE_SSL", None)
    if url.startswith("rediss://") and ssl_options:
        kwargs.update(ssl_options)
    client = redis.Redis.from_url(url, **kwargs)
    try:
        client.ping()
        length = client.llen(getattr(settings, "CELERY_TASK_DEFAULT_QUEUE", "celery"))
    finally:
        client.close()
    return {"status": "warn" if length > QUEUE_WARN_LENGTH else "ok", "length": length}


def _provider_counts(model, now):
    stale_cutoff = now - STALE_SYNC_AFTER
    return {
        "connected": model.objects(is_revoked__ne=True).count(),
        "stale_sync": model.objects(
            Q(is_revoked__ne=True) & (Q(last_fetched_at=None) | Q(last_fetched_at__lt=stale_cutoff))
        ).count(),
        "revoked_recent": model.objects(is_revoked=True, revoked_at__gte=now - REVOKED_WINDOW).count(),
    }


def _wearables_section(now):
    providers = {
        "fitbit": _provider_counts(FitbitUserToken, now),
        "google_health": _provider_counts(GoogleHealthUserToken, now),
    }
    stale = sum(p["stale_sync"] for p in providers.values())
    revoked = sum(p["revoked_recent"] for p in providers.values())
    status = "warn" if stale >= STALE_SYNC_WARN or revoked >= REVOKED_WARN else "ok"
    return {"status": status, "providers": providers}


def _push_section(now):
    # Zero can be legitimate (nights, no exercises due), so this is information only.
    return {"status": "info", "sent_24h": SentPushNotification.objects(sent_at__gte=now - timedelta(hours=24)).count()}


def _translation_section():
    url = settings.LIBRETRANSLATE_URL.rstrip("/")
    resp = requests.get(f"{url}/languages", timeout=TRANSLATION_TIMEOUT_S)
    resp.raise_for_status()
    languages = sorted(lang.get("code", "") for lang in resp.json())
    return {"status": "warn" if len(languages) < EXPECTED_LANGUAGES else "ok", "languages": languages}


def _app_section(now):
    return {
        "status": "warn" if now - STARTED_AT < RECENT_START else "ok",
        "version": settings.APP_VERSION or None,
        "started_at": _iso(STARTED_AT),
        "sentry_url": settings.SENTRY_DASHBOARD_URL or None,
    }


def _safe(build):
    # One broken check shows as a red section instead of failing the whole page.
    try:
        return build()
    except Exception as exc:
        return {"status": "error", "error": summarize_error(exc)}


def build_system_status():
    now = timezone.now()
    sections = {
        "app": _safe(lambda: _app_section(now)),
        "jobs": _safe(_jobs_section),
        "queue": _safe(_queue_section),
        "wearables": _safe(lambda: _wearables_section(now)),
        "push": _safe(lambda: _push_section(now)),
        "translation": _safe(_translation_section),
    }
    return {
        "generated_at": _iso(now),
        # A recent restart is context shown as a badge, not a problem; deploys and reloads would otherwise turn it amber.
        "overall": _worst(s["status"] for name, s in sections.items() if name != "app"),
        **sections,
    }


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_system_status(request):
    data = cache.get(CACHE_KEY)
    if data is None:
        data = build_system_status()
        cache.set(CACHE_KEY, data, CACHE_SECONDS)
    return Response(data)
