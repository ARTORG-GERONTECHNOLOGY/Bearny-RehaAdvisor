import logging

from django.core.management.base import BaseCommand

from core.models import GoogleHealthData, GoogleHealthUserToken

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Dispatch a 365-day Google Health backfill for patients who have a valid token "
        "but fewer than --min-days days of data. Useful for catching up patients who "
        "connected before the backfill window was extended."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--min-days",
            type=int,
            default=30,
            help="Trigger a backfill for any patient with fewer than this many data records (default 30)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print which patients would be backfilled without dispatching tasks",
        )

    def handle(self, *args, **kwargs):
        from core.tasks import backfill_google_health_on_connect

        min_days = max(1, kwargs["min_days"])
        dry_run = kwargs["dry_run"]

        tokens = GoogleHealthUserToken.objects(is_revoked=False)
        total = tokens.count()
        self.stdout.write(f"[backfill] Checking {total} non-revoked Google Health token(s)…")

        queued = 0
        skipped = 0

        for token in tokens:
            user = token.user
            record_count = GoogleHealthData.objects(user=user).count()

            if record_count >= min_days:
                skipped += 1
                continue

            patient_code = getattr(getattr(user, "patient", None), "patient_code", str(user.id))
            self.stdout.write(
                f"  {patient_code}: {record_count} record(s) — "
                + ("would queue" if dry_run else "queuing")
                + " 365-day backfill"
            )

            if not dry_run:
                backfill_google_health_on_connect.delay(str(user.id))
                queued += 1
            else:
                queued += 1

        label = "Would queue" if dry_run else "Queued"
        self.stdout.write(
            self.style.SUCCESS(
                f"[backfill] Done. {label} {queued} backfill(s), skipped {skipped} (already have ≥{min_days} records)."
            )
        )
