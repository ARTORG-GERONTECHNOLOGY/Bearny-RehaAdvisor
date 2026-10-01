"""The per-request watchdog in gunicorn.conf.py (gthread's --timeout doesn't cover stuck requests)."""

import importlib.util
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

CONF_PATH = Path(__file__).resolve().parents[2] / "gunicorn.conf.py"


def _watchdogs():
    return [t for t in threading.enumerate() if t.name == "request-watchdog"]


@pytest.fixture
def conf():
    # A fresh copy of the module per test, so patching it never touches the real os._exit.
    spec = importlib.util.spec_from_file_location("gunicorn_conf_under_test", CONF_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.WATCHDOG_INTERVAL_SECONDS = 0.01
    module.calls = []
    module.exited = threading.Event()

    def fake_exit(code):  # returning ends the watchdog thread, as the real one never returns
        module.calls.append(("exit", code))
        module.exited.set()

    module.os = SimpleNamespace(_exit=fake_exit)
    module._flush_sentry = lambda: module.calls.append("flush")
    yield module

    # Stop this test's watchdogs: a request that is long overdue makes each one exit through fake_exit.
    module.DRAIN_SECONDS = 0
    with module._lock:
        module._requests.clear()
        module._requests[-1] = (float("-inf"), "teardown")
    for t in _watchdogs():
        t.join(5)
    assert not _watchdogs()


def _worker(timeout, graceful_timeout=5, futures=None):
    worker = SimpleNamespace(
        cfg=SimpleNamespace(timeout=timeout, graceful_timeout=graceful_timeout), log=Mock(), pid=123, alive=True
    )
    if futures is not None:
        worker.futures = futures
    return worker


def _req(path="/api/x/"):
    return SimpleNamespace(method="GET", path=path)


def _in_flight(conf, thread_id, age_seconds, what):
    conf._requests[thread_id] = (time.monotonic() - age_seconds, what)


def _future(done):
    return SimpleNamespace(done=lambda: done)


def test_watchdog_restarts_worker_when_a_request_outlives_timeout(conf):
    worker = _worker(timeout=0.05)
    conf.pre_request(worker, _req("/api/fitbit/summary/1/"))  # never finishes, like a call stuck without a timeout
    conf.post_worker_init(worker)

    assert conf.exited.wait(2)
    assert conf.calls == ["flush", ("exit", 1)]  # 3 or 4 would make the master shut down instead of respawning
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


def test_watchdog_waits_for_requests_still_queued_for_a_thread(conf):
    """gthread queues accepted requests until a thread is free; they haven't reached pre_request yet."""
    queued = _future(done=False)
    futures = [_future(done=False), queued]  # the stuck request and one waiting for a thread
    worker = _worker(timeout=0.05, futures=futures)
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    conf.post_worker_init(worker)

    time.sleep(0.2)
    assert not conf.exited.is_set()

    futures[1] = _future(done=True)  # the queued request got a thread and finished
    assert conf.exited.wait(2)


def test_watchdog_keeps_draining_when_the_stuck_request_finishes_first(conf):
    stuck_future, healthy_future = _future(done=False), _future(done=False)
    futures = [stuck_future, healthy_future]
    worker = _worker(timeout=0.05, futures=futures)
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    _in_flight(conf, 2, age_seconds=0, what="POST /upload")
    conf.post_worker_init(worker)
    time.sleep(0.2)

    conf._requests.pop(1)  # the stuck request completes after all
    futures[0] = _future(done=True)
    time.sleep(0.3)
    assert not conf.exited.is_set()  # the healthy upload is still running

    conf._requests.pop(2)
    futures[1] = _future(done=True)
    assert conf.exited.wait(2)


def test_watchdog_treats_a_new_request_on_a_freed_thread_as_healthy(conf):
    worker = _worker(timeout=0.05)
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    _in_flight(conf, 2, age_seconds=0, what="POST /upload")
    conf.post_worker_init(worker)
    time.sleep(0.2)

    with conf._lock:  # the upload finishes; the stuck request finishes too and its thread takes a new one
        conf._requests.pop(2)
        _in_flight(conf, 1, age_seconds=0, what="GET /next")
    time.sleep(0.3)
    assert not conf.exited.is_set()

    conf._requests.pop(1)
    assert conf.exited.wait(2)


@pytest.mark.filterwarnings("ignore::pytest.PytestUnhandledThreadExceptionWarning")
def test_watchdog_exits_even_if_logging_fails(conf):
    worker = _worker(timeout=0.05)
    worker.log.critical.side_effect = RuntimeError("log handler broke")
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    conf.post_worker_init(worker)

    assert conf.exited.wait(2)


def test_watchdog_drain_is_capped(conf):
    conf.DRAIN_SECONDS = 0.2
    worker = _worker(timeout=0.05, graceful_timeout=30)
    _in_flight(conf, 1, age_seconds=10, what="GET /stuck")
    _in_flight(conf, 2, age_seconds=0, what="POST /upload")  # never finishes in time
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
    conf.post_worker_init(_worker(timeout=0))
    assert not _watchdogs()
