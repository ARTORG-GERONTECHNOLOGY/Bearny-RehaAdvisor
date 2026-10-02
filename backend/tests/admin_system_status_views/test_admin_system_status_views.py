"""
Admin system status view tests — ``GET /api/admin/system-status/``
===================================================================

Coverage
--------
  * Admin-only: 403 for non-admin users.
  * Response shape and overall status (worst section wins).
  * Job status: on time, running, long run within its usual duration, killed every run, overdue, never run, never run while beat is stale, first run hung,
    disabled, failed, recovered.
  * Overdue check reads crontabs in their own timezone, as beat does.
  * Queue: Redis down is an error section; a long queue warns.
  * Wearable sync: stale and recently revoked token counts and thresholds.
  * Push: 24h send count is information only.
  * Translation: unreachable is an error; too few languages warns.
  * Response is cached for CACHE_SECONDS.

Redis and LibreTranslate are patched in every test, so nothing leaves the process.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import mongomock
import pytest
import redis
import requests
from django.core.cache import cache
from django.utils import timezone
from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import FitbitUserToken, GoogleHealthUserToken, SentPushNotification, TaskRun, User
from core.views import admin_system_status_views as views

URL = "/api/admin/system-status/"
LANGS = [{"code": c} for c in ["de", "en", "fr", "it", "nl", "pt"]]


@pytest.fixture(autouse=True)
def mongo_mock():
    alias = "default"
    from mongoengine.connection import _connections

    if alias in _connections:
        disconnect(alias)

    conn = connect(
        "mongoenginetest",
        alias=alias,
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect(alias)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def redis_client():
    client = MagicMock()
    client.llen.return_value = 0
    with patch.object(views.redis.Redis, "from_url", return_value=client):
        yield client


@pytest.fixture(autouse=True)
def translate_get():
    resp = MagicMock()
    resp.json.return_value = LANGS
    with patch.object(views.requests, "get", return_value=resp) as get:
        yield get


@pytest.fixture(autouse=True)
def _settled_start(monkeypatch):
    # Pretend the worker started long ago so the app section doesn't warn in unrelated tests.
    monkeypatch.setattr(views, "STARTED_AT", timezone.now() - timedelta(days=1))


def _client_for(role):
    user = User(
        username=f"{role.lower()}_status",
        email=f"{role.lower()}_status@test.example.com",
        role=role,
        isActive=True,
        createdAt=datetime.now(),
    )
    user.pwdhash = "x"
    user.save()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(user.id)))
    return c


@pytest.fixture
def admin_client():
    return _client_for("Admin")


def _hourly_task(name="Hourly job", enabled=True):
    cron = CrontabSchedule.objects.create(minute="0", hour="*")
    return PeriodicTask.objects.create(name=name, task="core.tasks.some_job", crontab=cron, enabled=enabled)


def _run(name="Hourly job", **ago):
    now = timezone.now()
    fields = {key: now - value for key, value in ago.items()}
    return TaskRun(name=name, task="core.tasks.some_job", **fields).save()


# ---------------------------------------------------------------------------
# Access and shape
# ---------------------------------------------------------------------------


def test_non_admin_is_forbidden():
    resp = _client_for("Therapist").get(URL)
    assert resp.status_code == 403


@pytest.mark.django_db
def test_shape_and_all_ok(admin_client):
    resp = admin_client.get(URL)
    assert resp.status_code == 200
    data = resp.json()
    for section in ("app", "jobs", "queue", "wearables", "push", "translation"):
        assert "status" in data[section]
    assert data["overall"] == "ok"
    assert data["generated_at"]
    assert data["push"]["status"] == "info"
    assert data["translation"]["languages"] == ["de", "en", "fr", "it", "nl", "pt"]


@pytest.mark.django_db
def test_overall_is_worst_section(admin_client, redis_client):
    redis_client.ping.side_effect = redis.ConnectionError("Connection refused")
    data = admin_client.get(URL).json()
    assert data["queue"]["status"] == "error"
    assert data["queue"]["error"] == "ConnectionError: Connection refused"
    assert data["overall"] == "error"
    # Other sections are still filled.
    assert data["translation"]["status"] == "ok"


@pytest.mark.django_db
def test_recent_start_warns_without_affecting_overall(admin_client, monkeypatch):
    monkeypatch.setattr(views, "STARTED_AT", timezone.now() - timedelta(minutes=5))
    data = admin_client.get(URL).json()
    assert data["app"]["status"] == "warn"
    assert data["overall"] == "ok"


@pytest.mark.django_db
def test_app_version_and_sentry_link(admin_client, settings):
    settings.APP_VERSION = "1.4.2"
    settings.SENTRY_DASHBOARD_URL = ""
    data = admin_client.get(URL).json()
    assert data["app"]["version"] == "1.4.2"
    assert data["app"]["sentry_url"] is None


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_job_on_time():
    pt = _hourly_task()
    run = _run(last_started_at=timedelta(minutes=11), last_success_at=timedelta(minutes=10))
    assert views.job_status(pt, run) == ("ok", "ok")


@pytest.mark.django_db
def test_job_overdue():
    pt = _hourly_task()
    run = _run(last_started_at=timedelta(hours=3, minutes=1), last_success_at=timedelta(hours=3))
    assert views.job_status(pt, run) == ("error", "overdue")


def _daily_zurich_task_due_hours_ago(hours):
    """Daily Europe/Zurich crontab whose most recent due time was `hours` ago (rounded to the hour)."""
    zurich = ZoneInfo("Europe/Zurich")
    due = (timezone.now().astimezone(zurich) - timedelta(hours=hours)).replace(minute=0, second=0, microsecond=0)
    cron = CrontabSchedule.objects.create(minute="0", hour=str(due.hour), timezone=zurich)
    pt = PeriodicTask.objects.create(name="Daily job", task="core.tasks.some_job", crontab=cron)
    return pt, due


@pytest.mark.django_db
def test_daily_job_in_local_timezone_on_time():
    # Mongo hands back UTC; the schedule is in Zurich time, so the hour must be compared in Zurich.
    pt, due = _daily_zurich_task_due_hours_ago(5)
    run = TaskRun(name="Daily job", last_success_at=(due + timedelta(minutes=1)).astimezone(dt_timezone.utc)).save()
    assert views.job_status(pt, run) == ("ok", "ok")


@pytest.mark.django_db
def test_daily_job_in_local_timezone_missed_run_is_overdue():
    pt, due = _daily_zurich_task_due_hours_ago(5)
    run = TaskRun(name="Daily job", last_success_at=(due - timedelta(days=1, minutes=-1)).astimezone(dt_timezone.utc))
    assert views.job_status(pt, run.save()) == ("error", "overdue")


def _every_hour_task(name="Hourly job"):
    # Interval schedules make "next due" independent of the wall-clock minute.
    every = IntervalSchedule.objects.create(every=1, period=IntervalSchedule.HOURS)
    return PeriodicTask.objects.create(name=name, task="core.tasks.some_job", interval=every)


@pytest.mark.django_db
def test_job_running_is_ok():
    pt = _every_hour_task()
    run = _run(last_success_at=timedelta(minutes=70), last_started_at=timedelta(minutes=5))
    assert views.job_status(pt, run) == ("ok", "running")


@pytest.mark.django_db
def test_job_running_within_usual_duration_is_ok():
    pt = _every_hour_task()
    run = _run(last_success_at=timedelta(minutes=110), last_started_at=timedelta(minutes=45))
    run.last_duration_s = 50 * 60
    assert views.job_status(pt, run.save()) == ("ok", "running")


@pytest.mark.django_db
def test_job_killed_every_run_is_overdue():
    # Each killed run leaves a fresh start but no outcome; the stale success must still surface.
    pt = _every_hour_task()
    run = _run(last_success_at=timedelta(hours=5), last_started_at=timedelta(minutes=5))
    assert views.job_status(pt, run) == ("error", "overdue")


@pytest.mark.django_db
def test_job_never_run_is_unknown(monkeypatch):
    monkeypatch.setattr(views, "STARTED_AT", timezone.now())
    pt = _hourly_task()
    assert views.job_status(pt, None) == ("unknown", "no_data")


@pytest.mark.django_db
def test_job_never_run_with_stale_beat_dispatch_is_overdue():
    pt = _hourly_task()
    pt.last_run_at = timezone.now() - timedelta(hours=3)
    assert views.job_status(pt, None) == ("error", "overdue")


@pytest.mark.django_db
def test_job_never_run_long_after_start_is_overdue(monkeypatch):
    monkeypatch.setattr(views, "STARTED_AT", timezone.now() - timedelta(hours=3))
    assert views.job_status(_hourly_task(), None) == ("error", "overdue")


@pytest.mark.django_db
def test_job_first_run_in_progress_is_running():
    pt = _hourly_task()
    run = _run(last_started_at=timedelta(minutes=5))
    assert views.job_status(pt, run) == ("ok", "running")


@pytest.mark.django_db
def test_job_first_run_hung_is_overdue():
    pt = _hourly_task()
    run = _run(last_started_at=timedelta(hours=3))
    assert views.job_status(pt, run) == ("error", "overdue")


@pytest.mark.django_db
def test_job_disabled_is_info():
    pt = _hourly_task(enabled=False)
    run = _run(last_success_at=timedelta(minutes=10))
    assert views.job_status(pt, run) == ("info", "disabled")


@pytest.mark.django_db
def test_job_failed_after_success():
    pt = _hourly_task()
    run = _run(last_success_at=timedelta(hours=1), last_failure_at=timedelta(minutes=5))
    assert views.job_status(pt, run) == ("error", "failed")


@pytest.mark.django_db
def test_job_recovered_after_failure():
    pt = _hourly_task()
    run = _run(last_failure_at=timedelta(hours=1), last_success_at=timedelta(minutes=5))
    assert views.job_status(pt, run) == ("ok", "ok")


@pytest.mark.django_db
def test_jobs_section_lists_tasks_with_error(admin_client):
    _hourly_task()
    run = _run(last_success_at=timedelta(hours=1), last_failure_at=timedelta(minutes=5))
    run.last_error = "ValueError: boom"
    run.save()

    jobs = admin_client.get(URL).json()["jobs"]
    assert jobs["status"] == "error"
    [item] = jobs["items"]
    assert item["name"] == "Hourly job"
    assert item["schedule"] == "0 * * * *"
    assert item["timezone"] == "UTC"
    assert item["reason"] == "failed"
    assert item["last_error"] == "ValueError: boom"


@pytest.mark.django_db
def test_jobs_section_reports_crontab_timezone(admin_client):
    _daily_zurich_task_due_hours_ago(1)
    [item] = admin_client.get(URL).json()["jobs"]["items"]
    assert item["timezone"] == "Europe/Zurich"


# ---------------------------------------------------------------------------
# Queue, wearables, push, translation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_long_queue_warns(admin_client, redis_client):
    redis_client.llen.return_value = views.QUEUE_WARN_LENGTH + 1
    queue = admin_client.get(URL).json()["queue"]
    assert queue == {"status": "warn", "length": views.QUEUE_WARN_LENGTH + 1}


def _fitbit_token(username, **fields):
    user = User(username=username, email=f"{username}@test.example.com", createdAt=datetime.now()).save()
    return FitbitUserToken(user=user, access_token="a", refresh_token="r", fitbit_user_id=username, **fields).save()


@pytest.mark.django_db
def test_wearable_counts(admin_client):
    now = timezone.now()
    _fitbit_token("fresh", last_fetched_at=now - timedelta(hours=1))
    _fitbit_token("stale", last_fetched_at=now - timedelta(days=2))
    _fitbit_token("never")
    _fitbit_token("revoked_new", is_revoked=True, revoked_at=now - timedelta(days=1))
    _fitbit_token("revoked_old", is_revoked=True, revoked_at=now - timedelta(days=30))

    wearables = admin_client.get(URL).json()["wearables"]
    assert wearables["providers"]["fitbit"] == {"connected": 3, "stale_sync": 2, "revoked_recent": 1}
    assert wearables["providers"]["google_health"] == {"connected": 0, "stale_sync": 0, "revoked_recent": 0}
    assert wearables["status"] == "ok"


@pytest.mark.django_db
def test_wearable_stale_threshold_warns(admin_client):
    for i in range(views.STALE_SYNC_WARN):
        _fitbit_token(f"stale{i}", last_fetched_at=timezone.now() - timedelta(days=2))
    assert admin_client.get(URL).json()["wearables"]["status"] == "warn"


@pytest.mark.django_db
def test_wearable_revoked_threshold_warns(admin_client):
    for i in range(views.REVOKED_WARN):
        user = User(username=f"gh{i}", email=f"gh{i}@test.example.com", createdAt=datetime.now()).save()
        GoogleHealthUserToken(
            user=user, access_token="a", refresh_token="r", is_revoked=True, revoked_at=timezone.now()
        ).save()
    assert admin_client.get(URL).json()["wearables"]["status"] == "warn"


@pytest.mark.django_db
def test_push_count_is_info_only(admin_client):
    with patch.object(views.SentPushNotification, "objects") as objects:
        objects.return_value.count.return_value = 0
        push = admin_client.get(URL).json()["push"]
    assert push == {"status": "info", "sent_24h": 0}


@pytest.mark.django_db
def test_translation_unreachable(admin_client, translate_get):
    translate_get.side_effect = requests.ConnectionError("Connection refused")
    translation = admin_client.get(URL).json()["translation"]
    assert translation["status"] == "error"
    assert translate_get.call_args.kwargs["timeout"] == views.TRANSLATION_TIMEOUT_S


@pytest.mark.django_db
def test_translation_missing_languages_warns(admin_client, translate_get):
    translate_get.return_value.json.return_value = LANGS[:3]
    assert admin_client.get(URL).json()["translation"]["status"] == "warn"


@pytest.mark.django_db
def test_redis_gets_timeouts(admin_client):
    with patch.object(views.redis.Redis, "from_url") as from_url:
        from_url.return_value.llen.return_value = 0
        admin_client.get(URL)
    kwargs = from_url.call_args.kwargs
    assert kwargs["socket_timeout"] == views.EXTERNAL_TIMEOUT_S
    assert kwargs["socket_connect_timeout"] == views.EXTERNAL_TIMEOUT_S


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_response_is_cached(admin_client):
    with patch.object(views, "build_system_status", wraps=views.build_system_status) as build:
        first = admin_client.get(URL).json()
        second = admin_client.get(URL).json()
    assert build.call_count == 1
    assert first["generated_at"] == second["generated_at"]
