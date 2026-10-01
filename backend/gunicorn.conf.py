"""Gunicorn hooks: a per-request watchdog for the threaded (gthread) worker.

With gthread, --timeout only checks that the worker's main loop is alive, not how long a request takes,
so a request stuck on a call with no timeout would hold its thread for good, and once every thread is
stuck the API stops answering. This brings back the sync worker's limit: when a request has run longer
than --timeout, the worker stops taking new requests, lets the others finish (up to --graceful-timeout),
then exits and the master starts a fresh one. Requests arriving meanwhile wait for the new worker.
"""

import os
import threading
import time

WATCHDOG_INTERVAL_SECONDS = 10

_requests = {}  # thread id -> (monotonic start, "METHOD /path") of the request it is serving
_lock = threading.Lock()


def pre_request(worker, req):
    with _lock:
        _requests[threading.get_ident()] = (time.monotonic(), f"{req.method} {req.path}")


def post_request(worker, req, environ, resp):
    with _lock:
        _requests.pop(threading.get_ident(), None)


def _stuck_threads(limit):
    now = time.monotonic()
    with _lock:
        return {tid: what for tid, (started, what) in _requests.items() if now - started > limit}


def post_worker_init(worker):
    limit = worker.cfg.timeout
    if limit <= 0:  # --timeout 0 disables the timeout
        return

    def watch():
        while True:
            time.sleep(WATCHDOG_INTERVAL_SECONDS)
            stuck = _stuck_threads(limit)
            if not stuck:
                continue
            worker.log.critical(
                "Restarting worker %s: request(s) running for over %ss: %s", worker.pid, limit, sorted(stuck.values())
            )
            worker.alive = False  # stop accepting; the master's socket queues new connections for the next worker
            deadline = time.monotonic() + worker.cfg.graceful_timeout
            while time.monotonic() < deadline:
                with _lock:
                    if _requests.keys() <= stuck.keys():  # only the stuck ones are left
                        break
                time.sleep(0.2)
            os._exit(1)  # not 3 or 4: the master treats those as boot errors and shuts down

    threading.Thread(target=watch, name="request-watchdog", daemon=True).start()
