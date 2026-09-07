import logging

from django.core.management.base import BaseCommand

from core.models import Patient

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Switch patient wearable_device from fitbit to google_health"

    def add_arguments(self, parser):
        parser.add_argument(
            "--project",
            type=str,
            default=None,
            help="Filter by project name (e.g. COMPASS, COPAIN)",
        )
        parser.add_argument(
            "--patient",
            type=str,
            default=None,
            help="Filter by patient code (e.g. 934-01)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without saving",
        )

    def handle(self, *args, **kwargs):
        project_filter = kwargs.get("project")
        patient_filter = kwargs.get("patient")
        dry_run = kwargs.get("dry_run", False)

        qs = Patient.objects(wearable_device="fitbit")
        if project_filter:
            qs = qs.filter(project=project_filter)
        if patient_filter:
            qs = qs.filter(patient_code=patient_filter)

        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.WARNING("No matching fitbit patients found."))
            return

        prefix = "[dry-run] " if dry_run else ""
        self.stdout.write(f"{prefix}Switching {count} patient(s) to google_health...")

        updated = 0
        for p in qs:
            self.stdout.write(f"  {prefix}{p.patient_code} ({p.project})")
            if not dry_run:
                p.wearable_device = "google_health"
                p.save()
                logger.info("Migrated patient %s to google_health", p.patient_code)
            updated += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run complete — {updated} patient(s) would be updated."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Done: {updated} patient(s) updated to google_health."))
            self.stdout.write(
                "Next step: run the Google Health OAuth flow for each patient, "
                "then backfill 30 days with:\n"
                "  manage.py fetch_google_health_data --days 30 --user <user_id>"
            )
