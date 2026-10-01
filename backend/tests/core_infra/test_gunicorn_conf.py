"""The per-request watchdog in gunicorn.conf.py (gthread's --timeout doesn't cover stuck requests)."""

import importlib.util
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

CONF_PATH = Path(__file__).resolve().parents[2] / "gunicorn.conf.py"


@pytest.fixture
def conf(monkeypatch):
    spec = importlib.util.spec_from_file_location("gunicorn_conf_under_test", CONF_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "WATCHDOG_INTERVAL_SECONDS", 0.01)
    exited = threading.Event()

    def fake_exit(code):
        exited.code = code
        exited.set()
        raise SystemExit  # ends the watchdog thread quietly

    monkeypatch.setattr(module.os, "_exit", fake_exit)
    module.exited = exited
    return module


def _worker(timeout, graceful_timeout=5):
    return SimpleNamespace(
        cfg=SimpleNamespace(timeout=timeout, graceful_timeout=graceful_timeout), log=Mock(), pid=123, alive=True
    )


def _req(path="/api/x/"):
    return SimpleNamespace(method="GET", path=path)


def _in_flight(conf, thread_id, age_seconds, what):
    conf._requests[thread_id] = (time.monotonic() - age_seconds, what)


def test_watchdog_restarts_worker_when_a_request_outlives_timeout(conf):
    worker = _worker(timeout=0.05)
    conf.pre_request(worker, _req("/api/fitbit/summary/1/"))  # never finishes, like a call stuck without a timeout
    conf.post_worker_init(worker)

    assert conf.exited.wait(2)
    assert conf.exited.code == 1  # 3 and 4 would make the master shut down instead of respawning
    assert worker.alive is False  # stopped taking new requests first
    logged = worker.log.critical.call_args.args
    assert ["GET /api/fitbit/summary/1/"] in logged  # names the stuck request


def test_watchdog_lets_other_requests_finish_before_restarting(conf):
    worker = _worker(timeout=0.05)
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    _in_flight(conf, 2, age_seconds=0, what="POST /upload")  # healthy, still running
    conf.post_worker_init(worker)

    time.sleep(0.2)
    assert worker.alive is False
    assert not conf.exited.is_set()  # waiting for the healthy request

    conf._requests.pop(2)  # post_request of the healthy one
    assert conf.exited.wait(2)


def test_watchdog_restarts_after_graceful_timeout_even_if_others_keep_running(conf):
    worker = _worker(timeout=0.05, graceful_timeout=0.2)
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    _in_flight(conf, 2, age_seconds=0, what="POST /upload")
    conf.post_worker_init(worker)

    assert conf.exited.wait(2)


def test_watchdog_ignores_requests_that_finish_in_time(conf):
    worker = _worker(timeout=0.05)
    conf.pre_request(worker, _req())
    conf.post_request(worker, _req(), environ={}, resp=None)
    conf.post_worker_init(worker)

    time.sleep(0.2)
    assert not conf.exited.is_set()
    assert worker.alive is True
    assert conf._requests == {}


def test_watchdog_off_when_timeout_disabled(conf):
    before = threading.active_count()
    conf.post_worker_init(_worker(timeout=0))
    assert threading.active_count() == before
