"""
Admin system status view tests — ``GET /api/admin/system-status/``
===================================================================

Coverage
--------
  * Admin-only: 403 for non-admin users.
  * Response shape and overall status (worst section wins).
  * Job status: on time, running, long run within its usual duration, killed every run, overdue, never run, never run while beat is stale, first run hung,
    disabled, failed, recovered; new or re-enabled jobs aren't overdue before beat sends them.
  * Overdue check reads crontabs in their own timezone, as beat does.
  * Start time comes from the gunicorn master, so worker restarts keep it; import time without gunicorn.
  * Web server: request thread count; a watchdog restart for stuck requests in the last 24h warns, older ones don't.
    Unreadable lines in the restart log are skipped.
  * Queue: Redis down is an error section; a long queue warns.
  * Workers: none online is an error; busy count, concurrency and longest running task; a task running too long warns.
  * Wearable sync: stale and recently revoked token counts and thresholds.
  * Push: 24h send count is information only.
  * Translation: unreachable is an error; too few languages warns.
  * Response is cached for CACHE_SECONDS; ?refresh=1 bypasses and repopulates the cache.

Redis, Celery's worker inspection and LibreTranslate are patched in every test, so nothing leaves the process.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import json

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
def celery_inspect():
    inspect = MagicMock()
    inspect.stats.return_value = {"celery@w1": {"pool": {"max-concurrency": 4}}}
    inspect.active.return_value = {"celery@w1": []}
    with patch.object(views.celery_app.control, "inspect", return_value=inspect):
        yield inspect


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


@pytest.fixture(autouse=True)
def restart_log(tmp_path, monkeypatch):
    path = tmp_path / "restarts.jsonl"
    monkeypatch.setattr(views, "RESTART_LOG", path)
    return path


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


def _changed_ago(pt, ago=timedelta(days=30)):
    # date_changed is auto_now, so only a queryset update can backdate it.
    PeriodicTask.objects.filter(pk=pt.pk).update(date_changed=timezone.now() - ago)
    pt.refresh_from_db()
    return pt


def _hourly_task(name="Hourly job", enabled=True):
    cron = CrontabSchedule.objects.create(minute="0", hour="*")
    return _changed_ago(
        PeriodicTask.objects.create(name=name, task="core.tasks.some_job", crontab=cron, enabled=enabled)
    )


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
    for section in ("app", "server", "jobs", "queue", "wearables", "push", "translation"):
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
    return _changed_ago(pt), due


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
    return _changed_ago(PeriodicTask.objects.create(name=name, task="core.tasks.some_job", interval=every))


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
def test_job_running_longer_than_last_run_is_ok():
    # Due 80 min ago; past one last run (30 min) of slack but within two.
    pt = _every_hour_task()
    run = _run(last_success_at=timedelta(minutes=140), last_started_at=timedelta(minutes=75))
    run.last_duration_s = 30 * 60
    assert views.job_status(pt, run.save()) == ("ok", "running")


@pytest.mark.django_db
def test_job_running_past_twice_last_run_is_overdue():
    # Due 110 min ago; beyond grace plus twice the last run (30 + 60 min).
    pt = _every_hour_task()
    run = _run(last_success_at=timedelta(minutes=170), last_started_at=timedelta(minutes=105))
    run.last_duration_s = 30 * 60
    assert views.job_status(pt, run.save()) == ("error", "overdue")


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


def test_process_start_comes_from_gunicorn_master(monkeypatch):
    monkeypatch.setenv(views.STARTED_AT_ENV, "1700000000.5")
    assert views._process_start() == datetime(2023, 11, 14, 22, 13, 20, 500000, tzinfo=dt_timezone.utc)


@pytest.mark.parametrize("value", [None, "not-a-number"])
def test_process_start_without_gunicorn_is_now(monkeypatch, value):
    if value is None:
        monkeypatch.delenv(views.STARTED_AT_ENV, raising=False)
    else:
        monkeypatch.setenv(views.STARTED_AT_ENV, value)
    assert timezone.now() - views._process_start() < timedelta(seconds=5)


@pytest.mark.django_db
def test_server_without_restarts_is_ok(admin_client, monkeypatch):
    monkeypatch.setenv(views.THREADS_ENV, "8")
    server = admin_client.get(URL).json()["server"]
    assert server == {"status": "ok", "threads": 8, "restarts_24h": 0, "last_restart": None}


@pytest.mark.django_db
def test_server_without_gunicorn_has_no_thread_count(admin_client, monkeypatch):
    monkeypatch.delenv(views.THREADS_ENV, raising=False)
    assert admin_client.get(URL).json()["server"]["threads"] is None


@pytest.mark.django_db
def test_server_watchdog_restart_in_last_24h_warns(admin_client, restart_log):
    now = timezone.now().timestamp()
    lines = [
        {"at": now - timedelta(hours=30).total_seconds(), "requests": ["GET /old"]},  # outside the window
        {"at": now - 7200, "requests": ["GET /a"]},
        {"at": now - 60, "requests": ["GET /api/fitbit/summary/1/", "POST /b"]},
    ]
    restart_log.write_text("".join(json.dumps(line) + "\n" for line in lines))
    data = admin_client.get(URL).json()
    assert data["server"]["status"] == "warn"
    assert data["server"]["restarts_24h"] == 2
    last = data["server"]["last_restart"]
    assert last["requests"] == ["GET /api/fitbit/summary/1/", "POST /b"]
    assert abs(datetime.fromisoformat(last["at"]).timestamp() - (now - 60)) < 1
    assert data["overall"] == "warn"


@pytest.mark.django_db
def test_server_skips_unreadable_restart_lines(admin_client, restart_log):
    now = timezone.now().timestamp()
    good = json.dumps({"at": now - 60, "requests": ["GET /a"]})
    restart_log.write_text(f'{good}\n{{"at": \n{{"requests": []}}\n[1, 2]\n')
    server = admin_client.get(URL).json()["server"]
    assert server["status"] == "warn"
    assert server["restarts_24h"] == 1
    assert server["last_restart"]["requests"] == ["GET /a"]


@pytest.mark.django_db
def test_new_job_before_first_dispatch_is_unknown():
    pt = _changed_ago(_hourly_task(), timedelta(0))
    assert views.job_status(pt, None) == ("unknown", "no_data")


@pytest.mark.django_db
def test_reenabled_job_before_first_dispatch_is_ok():
    pt = _changed_ago(_every_hour_task(), timedelta(minutes=5))
    run = _run(last_started_at=timedelta(days=20, minutes=1), last_success_at=timedelta(days=20))
    assert views.job_status(pt, run) == ("ok", "ok")


@pytest.mark.django_db
def test_reenabled_job_dispatched_but_not_run_is_overdue():
    # Beat's dispatch save bumps date_changed, so it must stop counting once last_run_at is set.
    pt = _changed_ago(_every_hour_task(), timedelta(0))
    pt.last_run_at = timezone.now() - timedelta(hours=2)
    run = _run(last_started_at=timedelta(days=20, minutes=1), last_success_at=timedelta(days=20))
    assert views.job_status(pt, run) == ("error", "overdue")


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
    assert queue["status"] == "warn"
    assert queue["length"] == views.QUEUE_WARN_LENGTH + 1


@pytest.mark.django_db
def test_idle_worker_is_ok(admin_client):
    queue = admin_client.get(URL).json()["queue"]
    assert queue["status"] == "ok"
    assert queue["workers"] == {"online": 1, "busy": 0, "concurrency": 4, "longest_task": None}


@pytest.mark.django_db
def test_no_worker_online_is_error(admin_client, celery_inspect):
    celery_inspect.stats.return_value = None
    celery_inspect.active.return_value = None
    data = admin_client.get(URL).json()
    assert data["queue"]["status"] == "error"
    assert data["queue"]["workers"]["online"] == 0
    assert data["overall"] == "error"


def _active_task(name, minutes_ago):
    return {"name": name, "time_start": (timezone.now() - timedelta(minutes=minutes_ago)).timestamp()}


@pytest.mark.django_db
def test_busy_workers_report_longest_task(admin_client, celery_inspect):
    celery_inspect.stats.return_value = {
        "celery@w1": {"pool": {"max-concurrency": 4}},
        "celery@w2": {"pool": {"max-concurrency": 2}},
    }
    celery_inspect.active.return_value = {
        "celery@w1": [_active_task("core.tasks.short", 1), _active_task("core.tasks.long", 10)],
        "celery@w2": [_active_task("core.tasks.medium", 5)],
    }
    queue = admin_client.get(URL).json()["queue"]
    assert queue["status"] == "ok"
    workers = queue["workers"]
    assert (workers["online"], workers["busy"], workers["concurrency"]) == (2, 3, 6)
    assert workers["longest_task"]["name"] == "core.tasks.long"
    assert 10 * 60 - 5 <= workers["longest_task"]["running_s"] <= 10 * 60 + 5


@pytest.mark.django_db
def test_task_running_too_long_warns(admin_client, celery_inspect):
    minutes = views.LONG_TASK_WARN.total_seconds() / 60 + 5
    celery_inspect.active.return_value = {"celery@w1": [_active_task("core.tasks.stuck", minutes)]}
    queue = admin_client.get(URL).json()["queue"]
    assert queue["status"] == "warn"
    assert queue["workers"]["longest_task"]["name"] == "core.tasks.stuck"


@pytest.mark.django_db
def test_worker_inspection_uses_short_timeout(admin_client):
    admin_client.get(URL)
    views.celery_app.control.inspect.assert_any_call(timeout=views.WORKER_REPLY_TIMEOUT_S)


@pytest.mark.django_db
def test_active_inspection_stops_after_known_workers_reply(admin_client, celery_inspect):
    admin_client.get(URL)
    views.celery_app.control.inspect.assert_called_with(timeout=views.WORKER_REPLY_TIMEOUT_S, limit=1)


@pytest.mark.django_db
def test_active_inspection_skipped_when_no_worker_online(admin_client, celery_inspect):
    celery_inspect.stats.return_value = None
    admin_client.get(URL)
    celery_inspect.active.assert_not_called()


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


@pytest.mark.django_db
def test_refresh_bypasses_and_repopulates_cache(admin_client):
    with patch.object(views, "build_system_status", wraps=views.build_system_status) as build:
        admin_client.get(URL)
        refreshed = admin_client.get(URL, {"refresh": "1"}).json()
        cached = admin_client.get(URL).json()
    assert build.call_count == 2
    assert cached["generated_at"] == refreshed["generated_at"]


@pytest.mark.django_db
def test_refresh_other_than_1_uses_cache(admin_client):
    with patch.object(views, "build_system_status", wraps=views.build_system_status) as build:
        admin_client.get(URL)
        admin_client.get(URL, {"refresh": "0"})
    assert build.call_count == 1
