import json

from django.conf import settings
from django.core.management.base import BaseCommand
from django_celery_beat.models import CrontabSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Seeds periodic Celery tasks to run at midnight"

    def handle(self, *args, **kwargs):
        # Create a crontab schedule
        midnight_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0",
            hour="1",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone=settings.TIME_ZONE,
        )

        # Task 1: Delete expired videos
        task1, created1 = PeriodicTask.objects.update_or_create(
            name="Run Delete Expired Videos",
            defaults={
                "crontab": midnight_schedule,
                "task": "core.tasks.run_delete_expired_videos",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created1 else 'Updated'} task: {task1.name}"))

        # Task 2: Fetch Fitbit data
        task2, created2 = PeriodicTask.objects.update_or_create(
            name="Run Fetch Fitbit Data",
            defaults={
                "crontab": midnight_schedule,
                "task": "core.tasks.run_fetch_fitbit_data",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created2 else 'Updated'} task: {task2.name}"))
