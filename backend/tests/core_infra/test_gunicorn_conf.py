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


def _worker(timeout):
    return SimpleNamespace(cfg=SimpleNamespace(timeout=timeout), log=Mock(), pid=123)


def test_watchdog_restarts_worker_when_a_request_outlives_timeout(conf):
    worker = _worker(timeout=0.05)
    conf.pre_request(worker, req=None)  # never finishes, like a call stuck without a timeout
    conf.post_worker_init(worker)

    assert conf.exited.wait(2)
    assert conf.exited.code == 1  # 3 and 4 would make the master shut down instead of respawning
    worker.log.critical.assert_called_once()


def test_watchdog_ignores_requests_that_finish_in_time(conf):
    worker = _worker(timeout=0.05)
    conf.pre_request(worker, req=None)
    conf.post_request(worker, req=None, environ={}, resp=None)
    conf.post_worker_init(worker)

    time.sleep(0.2)
    assert not conf.exited.is_set()
    assert conf._request_started == {}


def test_watchdog_off_when_timeout_disabled(conf):
    before = threading.active_count()
    conf.post_worker_init(_worker(timeout=0))
    assert threading.active_count() == before
