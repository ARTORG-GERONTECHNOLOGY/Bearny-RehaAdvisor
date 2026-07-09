import json

from django.conf import settings
from django.core.management.base import BaseCommand
from django_celery_beat.models import CrontabSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Seeds periodic Celery tasks to run at midnight"

    def handle(self, *args, **kwargs):
        # Nightly at 01:00
        midnight_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0",
            hour="1",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone=settings.TIME_ZONE,
        )

        # Every 4 hours (for same-day Fitbit sync without requiring patient login)
        every_4h_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0",
            hour="*/4",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone=settings.TIME_ZONE,
        )

        # Task 1: Delete expired videos (nightly)
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

        # Task 2: Fetch Fitbit data — full 30-day back-fill runs nightly
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

        # Task 3: Fetch today's Fitbit data every 4 hours so patients who don't open
        # the app still get their wearable data synced during the day.
        task3, created3 = PeriodicTask.objects.update_or_create(
            name="Run Fetch Fitbit Data Today (4h)",
            defaults={
                "crontab": every_4h_schedule,
                "task": "core.tasks.run_fetch_fitbit_data_today_all",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created3 else 'Updated'} task: {task3.name}"))

        # Task 4: Fetch Google Health data at midnight for users who have migrated
        task4, created4 = PeriodicTask.objects.update_or_create(
            name="Run Fetch Google Health Data",
            defaults={
                "crontab": midnight_schedule,
                "task": "core.tasks.run_fetch_google_health_data",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created4 else 'Updated'} task: {task4.name}"))
