"""
Tests for the Celery task-run signal handlers
==============================================

Covers:
- core.signals.on_task_prerun / on_task_success / on_task_failure
- core.signals.summarize_error
"""

from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest

from core import signals
from core.models import TaskRun


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    from mongoengine import connect, disconnect
    from mongoengine.connection import _connections

    alias = "default"
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
    signals._started.clear()


def _task(periodic_name="Nightly job", task_id="tid-1", via_headers=False):
    if via_headers:
        request = SimpleNamespace(id=task_id, headers={"periodic_task_name": periodic_name})
    else:
        request = SimpleNamespace(id=task_id, periodic_task_name=periodic_name, headers=None)
    return SimpleNamespace(name="core.tasks.some_job", request=request)


def test_success_records_start_success_and_duration():
    task = _task()
    signals.on_task_prerun(sender=task, task_id="tid-1", task=task)
    signals.on_task_success(sender=task, result=None)

    run = TaskRun.objects.get(name="Nightly job")
    assert run.task == "core.tasks.some_job"
    assert run.last_started_at is not None
    assert run.last_success_at is not None
    assert run.last_failure_at is None
    assert run.last_duration_s is not None and run.last_duration_s >= 0


def test_failure_records_summarized_error():
    task = _task()
    signals.on_task_prerun(sender=task, task_id="tid-1", task=task)
    signals.on_task_failure(sender=task, task_id="tid-1", exception=ValueError("boom\nsecond line"))

    run = TaskRun.objects.get(name="Nightly job")
    assert run.last_failure_at is not None
    assert run.last_success_at is None
    assert run.last_error == "ValueError: boom"


def test_header_fallback_is_used():
    task = _task(via_headers=True)
    signals.on_task_success(sender=task, result=None)
    assert TaskRun.objects(name="Nightly job").count() == 1


def test_unscheduled_task_is_ignored():
    task = _task(periodic_name=None)
    signals.on_task_prerun(sender=task, task_id="tid-1", task=task)
    signals.on_task_success(sender=task, result=None)
    signals.on_task_failure(sender=task, task_id="tid-1", exception=RuntimeError("x"))
    assert TaskRun.objects.count() == 0


def test_one_record_per_periodic_task():
    for _ in range(3):
        task = _task()
        signals.on_task_success(sender=task, result=None)
    assert TaskRun.objects.count() == 1


def test_storage_error_does_not_raise():
    task = _task()
    with patch.object(signals.TaskRun, "objects", side_effect=RuntimeError("mongo down")):
        signals.on_task_prerun(sender=task, task_id="tid-1", task=task)
        signals.on_task_success(sender=task, result=None)
        signals.on_task_failure(sender=task, task_id="tid-1", exception=ValueError("x"))


def test_summarize_error_strips_urls_and_emails():
    exc = RuntimeError("401 for https://api.fitbit.com/1/user/-/x.json?token=abc sent to jane.doe@example.com")
    text = signals.summarize_error(exc)
    assert "fitbit.com" not in text
    assert "token=abc" not in text
    assert "jane.doe" not in text
    assert text == "RuntimeError: 401 for <url> sent to <email>"


def test_summarize_error_truncates_and_handles_empty_message():
    assert signals.summarize_error(KeyError()) == "KeyError"
    assert len(signals.summarize_error(ValueError("x" * 1000))) == signals.ERROR_MAX_LENGTH
