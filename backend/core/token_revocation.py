"""
Redis-based JWT token revocation.

Two complementary strategies cover all logout/password-change scenarios:

  1. Per-JTI denylist  — revoke_jti() / is_jti_revoked()
     On logout, the current access + refresh tokens are individually
     invalidated so they cannot be reused even within their remaining TTL.

  2. Per-user valid_from timestamp — invalidate_user_tokens() / get_user_valid_from()
     On password change / reset, a "valid after" epoch is stored for the
     user.  Any token whose `iat` predates this timestamp is rejected,
     which invalidates every outstanding session with a single write.

Both are checked in JWTAuthMiddleware for every authenticated request.
"""

import logging
from urllib.parse import urlparse

from django.conf import settings

logger = logging.getLogger(__name__)

_NONCE_PREFIX = "jti_deny:"
_VALID_FROM_PREFIX = "user_valid_from:"


def _get_redis():
    """Return a Redis client built from the Celery broker URL."""
    import redis

    url = getattr(settings, "CELERY_BROKER_URL", "redis://redis:6379/0")
    parsed = urlparse(url)
    use_ssl = parsed.scheme == "rediss"
    ssl_ca = None
    if use_ssl:
        broker_ssl = getattr(settings, "BROKER_USE_SSL", {})
        if isinstance(broker_ssl, dict):
            ssl_ca = broker_ssl.get("ssl_ca_certs")
    return redis.Redis(
        host=parsed.hostname,
        port=parsed.port or 6379,
        db=int((parsed.path or "/0").lstrip("/") or 0),
        password=parsed.password,
        ssl=use_ssl,
        ssl_ca_certs=ssl_ca if use_ssl else None,
        socket_connect_timeout=2,
    )


def revoke_jti(jti: str, ttl_seconds: int) -> None:
    """Mark a JWT ID as revoked in Redis.

    ttl_seconds should be set to the token's remaining lifetime so the key
    is cleaned up automatically once the token would have expired anyway.
    """
    if not jti:
        return
    try:
        rc = _get_redis()
        rc.set(f"{_NONCE_PREFIX}{jti}", "1", ex=max(ttl_seconds, 1))
    except Exception:
        logger.exception("[token_revocation] Redis error in revoke_jti(%s)", jti)


def is_jti_revoked(jti: str) -> bool:
    """Return True if the JTI is in the denylist."""
    if not jti:
        return False
    try:
        rc = _get_redis()
        return rc.exists(f"{_NONCE_PREFIX}{jti}") > 0
    except Exception:
        logger.exception("[token_revocation] Redis error in is_jti_revoked(%s)", jti)
        # Fail open: if Redis is down, don't lock out users.
        return False


def invalidate_user_tokens(user_id: str, ttl_seconds: int = 86400) -> None:
    """Set a 'valid-after' epoch for a user.

    Any JWT whose `iat` (issued-at) is earlier than this timestamp will be
    rejected.  Call this after a password change or reset to invalidate all
    outstanding sessions.

    ttl_seconds defaults to the refresh token lifetime (1 day).
    """
    import time

    if not user_id:
        return
    try:
        rc = _get_redis()
        rc.set(f"{_VALID_FROM_PREFIX}{user_id}", str(int(time.time())), ex=ttl_seconds)
    except Exception:
        logger.exception("[token_revocation] Redis error in invalidate_user_tokens(%s)", user_id)


def get_user_valid_from(user_id: str) -> int:
    """Return the 'valid-after' epoch for a user, or 0 if not set."""
    if not user_id:
        return 0
    try:
        rc = _get_redis()
        val = rc.get(f"{_VALID_FROM_PREFIX}{user_id}")
        return int(val) if val else 0
    except Exception:
        logger.exception("[token_revocation] Redis error in get_user_valid_from(%s)", user_id)
        return 0
