"""Gunicorn hooks: a per-request watchdog for the threaded (gthread) worker.

With gthread, --timeout only checks that the worker's main loop is alive, not how long a request takes,
so a request stuck on a call with no timeout would hold its thread for good, and once every thread is
stuck the API stops answering. This brings back the sync worker's limit: when a request has run longer
than --timeout, the worker stops taking new requests, lets the others finish (up to DRAIN_SECONDS),
then exits and the master starts a fresh one. Requests arriving meanwhile wait for the new worker.
"""

import os
import threading
import time

WATCHDOG_INTERVAL_SECONDS = 10
DRAIN_SECONDS = 10  # short: with one worker, nothing new is served while it drains

_requests = {}  # thread id -> (monotonic start, "METHOD /path") of the request it is serving
_lock = threading.Lock()


def pre_request(worker, req):
    with _lock:
        _requests[threading.get_ident()] = (time.monotonic(), f"{req.method} {req.path}")


def post_request(worker, req, environ, resp):
    with _lock:
        _requests.pop(threading.get_ident(), None)


def _stuck_requests(limit):
    """{thread id: (start, "METHOD /path")} of the requests running for longer than limit."""
    now = time.monotonic()
    with _lock:
        return {tid: entry for tid, entry in _requests.items() if now - entry[0] > limit}


def _others_pending(worker, stuck):
    """Whether accepted requests other than the stuck ones are still queued or running."""
    with _lock:
        # A stuck request can still finish, and its thread can take a new request: match the start time too.
        still_stuck = sum(_requests.get(tid) == entry for tid, entry in stuck.items())
        running = len(_requests)
    futures = getattr(worker, "futures", None)  # gthread: one per accepted request, including those queued
    if futures is not None:
        return sum(not f.done() for f in list(futures)) > still_stuck
    return running > still_stuck


def _flush_sentry():
    """os._exit skips Sentry's exit hook, which would drop the critical log event."""
    try:
        import sentry_sdk

        sentry_sdk.flush(timeout=2)
    except Exception:
        pass


def post_worker_init(worker):
    limit = worker.cfg.timeout
    if limit <= 0:  # --timeout 0 disables the timeout
        return

    def watch():
        stuck = {}
        while not stuck:
            time.sleep(WATCHDOG_INTERVAL_SECONDS)
            stuck = _stuck_requests(limit)

        try:
            worker.log.critical(
                "Restarting worker %s: request(s) running for over %ss: %s",
                worker.pid,
                limit,
                sorted(what for _, what in stuck.values()),
            )
            worker.alive = False  # stop accepting; the master's socket queues new connections for the next worker
            deadline = time.monotonic() + min(DRAIN_SECONDS, worker.cfg.graceful_timeout)
            while time.monotonic() < deadline and _others_pending(worker, stuck):
                time.sleep(0.2)
            _flush_sentry()
        finally:
            # Always, even if the above fails: a worker that stopped accepting must not linger.
            os._exit(1)  # not 3 or 4: the master treats those as boot errors and shuts down

    threading.Thread(target=watch, name="request-watchdog", daemon=True).start()
