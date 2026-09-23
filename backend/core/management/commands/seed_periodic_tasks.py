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

        # Task 4b: Fetch today's Google Health data every 4 hours (mirrors Fitbit 4h task)
        task4b, created4b = PeriodicTask.objects.update_or_create(
            name="Run Fetch Google Health Data Today (4h)",
            defaults={
                "crontab": every_4h_schedule,
                "task": "core.tasks.run_fetch_google_health_data_today_all",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created4b else 'Updated'} task: {task4b.name}"))

        # Hourly, on the hour (intervention push notifications — the task
        # itself checks the full past hour, see send_due_intervention_push_notifications)
        hourly_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0",
            hour="*",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone=settings.TIME_ZONE,
        )

        # Task 5: Send due intervention push notifications
        task5, created5 = PeriodicTask.objects.update_or_create(
            name="Send Due Intervention Push Notifications",
            defaults={
                "crontab": hourly_schedule,
                "task": "core.tasks.send_due_intervention_push_notifications",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created5 else 'Updated'} task: {task5.name}"))

        # Task 6: Sync wearables to REDCap nightly for all patients with a project set.
        task6, created6 = PeriodicTask.objects.update_or_create(
            name="Sync Wearables to REDCap (nightly)",
            defaults={
                "crontab": midnight_schedule,
                "task": "core.tasks.sync_wearables_to_redcap_all",
                "enabled": True,
                "args": json.dumps([]),
            },
        )
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created6 else 'Updated'} task: {task6.name}"))
