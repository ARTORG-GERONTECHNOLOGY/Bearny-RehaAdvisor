import os

from django.apps import AppConfig
from mongoengine import connect


class CoreConfig(AppConfig):
    name = "core"

    def ready(self):
        connect(
            db=os.environ.get("DB_NAME"),
            host=os.environ.get("DB_HOST"),
            port=int(os.environ.get("DB_PORT", "27017")),
            username=os.environ.get("MONGO_INITDB_ROOT_USERNAME"),
            password=os.environ.get("MONGO_INITDB_ROOT_PASSWORD"),
            authentication_source=os.environ.get("MONGO_INITDB_AUTH_SOURCE", "admin"),
            tls=True,
            tlsCAFile="/etc/ssl/mongo/ca.crt",
        )

