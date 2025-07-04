import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings.base")
django.setup()

from celery import shared_task
from django.core import management

@shared_task
def run_delete_expired_videos():
    subprocess.call(['python', 'manage.py', 'delete_expired_videos'])

@shared_task
def run_delete_expired_videos():
    subprocess.call(['python', 'manage.py', 'fetch_fitbit_data'])

@shared_task
def test_celery():
    print("✅ Celery is working!")
    return "Task ran successfully"