"""
Management command: backfill_wearable_device

Sets wearable_device on Patient documents where it is currently null.

Assignment logic (in priority order):
  1. Has FitbitUserToken (any state) OR FitbitData records  → "fitbit"
  2. Has GoogleHealthUserToken                              → "google_health"
  3. Neither                                                → "none" (control group / no device)

Usage:
  python manage.py backfill_wearable_device --dry-run
  python manage.py backfill_wearable_device
  python manage.py backfill_wearable_device --project COMPASS
  python manage.py backfill_wearable_device --clinic Inselspital
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Set wearable_device on Patient documents where it is currently null"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would change without writing to the database",
        )
        parser.add_argument("--clinic", type=str, default=None, help="Limit to one clinic")
        parser.add_argument("--project", type=str, default=None, help="Limit to one project")

    def handle(self, *args, **kwargs):
        from core.models import FitbitData, FitbitUserToken, GoogleHealthUserToken, Patient

        dry_run = kwargs["dry_run"]
        qs = Patient.objects(wearable_device=None)
        if kwargs["clinic"]:
            qs = qs.filter(clinic=kwargs["clinic"])
        if kwargs["project"]:
            qs = qs.filter(project=kwargs["project"])

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No patients with null wearable_device found."))
            return

        self.stdout.write(
            f"{'[DRY RUN] ' if dry_run else ''}Processing {total} patient(s) with null wearable_device...\n"
        )

        counts = {"fitbit": 0, "google_health": 0, "none": 0}
        for p in qs:
            user = p.userId
            if FitbitUserToken.objects(user=user).count() > 0 or FitbitData.objects(user=user).count() > 0:
                new_val = "fitbit"
            elif GoogleHealthUserToken.objects(user=user).count() > 0:
                new_val = "google_health"
            else:
                new_val = "none"

            counts[new_val] += 1
            action = "would set" if dry_run else "set"
            self.stdout.write(f"  {p.patient_code or str(p.id)}: {action} wearable_device={new_val!r}")

            if not dry_run:
                p.update(set__wearable_device=new_val)

        self.stdout.write(
            "\n"
            + self.style.SUCCESS(
                f"{'[DRY RUN] ' if dry_run else ''}Done: "
                f"fitbit={counts['fitbit']}  "
                f"google_health={counts['google_health']}  "
                f"none={counts['none']}"
            )
        )
