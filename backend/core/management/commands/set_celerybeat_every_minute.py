from django.core.management.base import BaseCommand
from django_celery_beat.models import PeriodicTask, CrontabSchedule

class Command(BaseCommand):
    help = "Set selected celery-beat tasks to run every minute (for testing)."

    def handle(self, *args, **options):
        sched, _ = CrontabSchedule.objects.get_or_create(
            minute="*",
            hour="*",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone="UTC",
        )

        for name in ["Run Delete Expired Videos", "Run Fetch Fitbit Data"]:
            t = PeriodicTask.objects.get(name=name)
            t.crontab = sched
            t.enabled = True
            t.save()
            self.stdout.write(f"updated: {t.name} -> crontab {t.crontab_id}")
