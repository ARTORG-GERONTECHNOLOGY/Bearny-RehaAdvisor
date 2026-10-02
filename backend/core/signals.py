"""Record the last start, success and failure of each scheduled Celery job for the admin system status."""

import logging
import re
import time

from celery.signals import task_failure, task_prerun, task_success
from django.utils import timezone

from core.models import TaskRun

logger = logging.getLogger(__name__)

ERROR_MAX_LENGTH = 300
_URL_RE = re.compile(r"\b[a-z][a-z0-9+.-]*://\S+", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")

# task_id -> monotonic start; prerun and success/failure fire in the same worker process.
_started: dict[str, float] = {}


def summarize_error(exc: BaseException) -> str:
    """Exception type plus its first line, with URLs and emails removed so no tokens or patient data are stored."""
    lines = str(exc).strip().splitlines()
    first = lines[0] if lines else ""
    first = _EMAIL_RE.sub("<email>", _URL_RE.sub("<url>", first))
    text = f"{type(exc).__name__}: {first}" if first else type(exc).__name__
    return text[:ERROR_MAX_LENGTH]


def _periodic_task_name(task) -> str | None:
    # django-celery-beat sets this header on every run it sends; page-load and ad-hoc tasks lack it.
    request = getattr(task, "request", None)
    if request is None:
        return None
    name = getattr(request, "periodic_task_name", None)
    if not name:
        name = (getattr(request, "headers", None) or {}).get("periodic_task_name")
    return name or None


def _record(name: str, task_name: str, **fields) -> None:
    try:
        TaskRun.objects(name=name).update_one(upsert=True, set__task=task_name, **fields)
    except Exception:
        # Monitoring must never break the job it watches.
        logger.exception("[task_run] could not record %s", name)


def _duration(task_id) -> float | None:
    start = _started.pop(task_id, None)
    return round(time.monotonic() - start, 3) if start is not None else None


@task_prerun.connect
def on_task_prerun(sender=None, task_id=None, task=None, **_):
    name = _periodic_task_name(task or sender)
    if not name:
        return
    _started[task_id] = time.monotonic()
    _record(name, (task or sender).name, set__last_started_at=timezone.now())


@task_success.connect
def on_task_success(sender=None, **_):
    name = _periodic_task_name(sender)
    if not name:
        return
    _record(
        name,
        sender.name,
        set__last_success_at=timezone.now(),
        set__last_duration_s=_duration(sender.request.id),
    )


@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, **_):
    name = _periodic_task_name(sender)
    if not name:
        return
    _record(
        name,
        sender.name,
        set__last_failure_at=timezone.now(),
        set__last_duration_s=_duration(task_id),
        set__last_error=summarize_error(exception) if exception is not None else "",
    )
