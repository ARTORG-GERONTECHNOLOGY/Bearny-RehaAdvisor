from django.core.management.base import BaseCommand
from django_celery_beat.models import PeriodicTask, CrontabSchedule
import json

class Command(BaseCommand):
    help = 'Seeds periodic Celery tasks to run at midnight'

    def handle(self, *args, **kwargs):
        # Create a crontab schedule: every day at 00:00 (midnight)
        midnight_schedule, _ = CrontabSchedule.objects.get_or_create(
            minute='0',
            hour='1',
            day_of_week='*',
            day_of_month='*',
            month_of_year='*',
        )

        # Task 1: Delete expired videos
        task1, created1 = PeriodicTask.objects.update_or_create(
            name='Run Delete Expired Videos',
            defaults={
                'crontab': midnight_schedule,
                'task': 'core.tasks.run_delete_expired_videos',
                'enabled': True,
                'args': json.dumps([]),
            }
        )
        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created1 else 'Updated'} task: {task1.name}"
        ))

        # Task 2: Fetch Fitbit data
        task2, created2 = PeriodicTask.objects.update_or_create(
            name='Run Fetch Fitbit Data',
            defaults={
                'crontab': midnight_schedule,
                'task': 'core.tasks.run_fetch_fitbit_data',
                'enabled': True,
                'args': json.dumps([]),
            }
        )
        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created2 else 'Updated'} task: {task2.name}"
        ))
