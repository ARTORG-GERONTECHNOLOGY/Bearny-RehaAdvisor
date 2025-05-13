import os

from django.apps import AppConfig
from mongoengine import connect


class CoreConfig(AppConfig):
    name = "core"

    def ready(self):
        connect(
            db=os.environ.get("DB_NAME", "myappdb"),  # <<< new!
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", 27017)),
            username=os.environ.get("MONGO_INITDB_ROOT_USERNAME", "root"),
            password=os.environ.get("MONGO_INITDB_ROOT_PASSWORD", "example"),
            authentication_source="admin",
        )

