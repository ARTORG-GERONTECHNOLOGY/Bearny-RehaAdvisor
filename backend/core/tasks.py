import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings.base")
django.setup()

from celery import shared_task
from django.core import management

@shared_task
def run_delete_expired_videos():
    subprocess.call(['python', 'manage.py', 'delete_expired_videos'])
    print("✅ Celery is working! Expired videos deleted successfully.")

@shared_task
def run_delete_expired_videos():
    subprocess.call(['python', 'manage.py', 'fetch_fitbit_data'])
    print("✅ Celery is working! Fitbit data fetched successfully.")

#@shared_task
#def test_celery():
#    print("✅ Celery is working!")
#    return "Task ran successfully"