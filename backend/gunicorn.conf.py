"""Gunicorn hooks: a per-request watchdog for the threaded (gthread) worker.

With gthread, --timeout only checks that the worker's main loop is alive, not how long a request takes,
so a request stuck on a call with no timeout would hold its thread for good, and once every thread is
stuck the API stops answering. This brings back the sync worker's behaviour: when a request has run
longer than --timeout, the worker exits and the master starts a fresh one.
"""

import os
import threading
import time

WATCHDOG_INTERVAL_SECONDS = 10

_request_started = {}  # thread id -> monotonic time its current request started
_lock = threading.Lock()


def pre_request(worker, req):
    with _lock:
        _request_started[threading.get_ident()] = time.monotonic()


def post_request(worker, req, environ, resp):
    with _lock:
        _request_started.pop(threading.get_ident(), None)


def post_worker_init(worker):
    limit = worker.cfg.timeout
    if limit <= 0:  # --timeout 0 disables the timeout
        return

    def watch():
        while True:
            time.sleep(WATCHDOG_INTERVAL_SECONDS)
            with _lock:
                oldest = min(_request_started.values(), default=None)
            if oldest is not None and time.monotonic() - oldest > limit:
                worker.log.critical("A request has run for over %ss; restarting worker %s", limit, worker.pid)
                os._exit(1)  # not 3 or 4: the master treats those as boot errors and shuts down

    threading.Thread(target=watch, name="request-watchdog", daemon=True).start()
