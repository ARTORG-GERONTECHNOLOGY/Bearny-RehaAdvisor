import logging
import os

from django.apps import AppConfig
from mongoengine import connect

logger = logging.getLogger(__name__)


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class CoreConfig(AppConfig):
    name = "core"

    def ready(self):
        # CI/tests can opt out because tests usually reconnect with mongomock fixtures.
        if _as_bool(os.environ.get("DISABLE_MONGO_CONNECT"), default=False):
            logger.info("Skipping Mongo connection in CoreConfig.ready (DISABLE_MONGO_CONNECT=true).")
            return

        kwargs = {
            "db": os.environ.get("DB_NAME"),
            "host": os.environ.get("DB_HOST") or os.environ.get("MONGODB_URI"),
            "port": int(os.environ.get("DB_PORT", "27017")),
            "username": os.environ.get("MONGO_INITDB_ROOT_USERNAME"),
            "password": os.environ.get("MONGO_INITDB_ROOT_PASSWORD"),
            "authentication_source": os.environ.get("MONGO_INITDB_AUTH_SOURCE", "admin"),
        }

        mongo_tls = _as_bool(os.environ.get("MONGO_TLS"), default=True)
        if mongo_tls:
            kwargs["tls"] = True
            ca_file = os.environ.get("MONGO_TLS_CA_FILE", "/etc/ssl/mongo/ca.crt")
            if os.path.exists(ca_file):
                kwargs["tlsCAFile"] = ca_file
            else:
                # Fail-safe for CI/dev runners where certs are not present.
                logger.warning(
                    "MONGO_TLS enabled but CA file missing at %s; continuing without tlsCAFile.",
                    ca_file,
                )
        else:
            kwargs["tls"] = False

        connect(**kwargs)
