from django.apps import AppConfig
import os
from mongoengine import connect

class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        connect(
            db='admin',
            host=os.environ.get('DB_HOST', 'localhost'),
            port=int(os.environ.get('DB_PORT', 27017)),
            username=os.environ.get('MONGO_INITDB_ROOT_USERNAME', 'root'),  # only if using authentication
            password=os.environ.get('MONGO_INITDB_ROOT_PASSWORD', 'example'),  # only if using authentication
            authentication_source='admin')