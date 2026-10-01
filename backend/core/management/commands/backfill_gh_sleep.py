import datetime
import logging

from django.core.management.base import BaseCommand

from core.models import GoogleHealthData, GoogleHealthUserToken

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Re-fetch and correct minutes_asleep for GoogleHealthData records where the value "
        "was inflated by the old time-in-bed fallback (minutes_asleep == sleep_duration // 60000). "
        "Uses the fixed _aggregate_sleep() which subtracts AWAKE-stage minutes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be updated without writing to the database",
        )
        parser.add_argument(
            "--patient",
            type=str,
            default=None,
            help="Limit to a single patient_code (e.g. 901-34)",
        )

    def handle(self, *args, **kwargs):
        from core.models import Patient
        from core.views.google_health_sync import (
            _aggregate_sleep,
            _list_points,
            _sleep_civil_date,
            get_valid_google_access_token,
        )

        dry_run = kwargs["dry_run"]
        patient_code = kwargs["patient"]

        # Records where minutes_asleep equals floor(sleep_duration / 60000) — the inflated fallback.
        # MongoEngine doesn't support computed-field queries, so we pull all records with sleep
        # and filter in Python. The set is bounded by the number of GH-connected patients.
        qs = GoogleHealthData.objects(sleep__ne=None)

        if patient_code:
            try:
                patient = Patient.objects.get(patient_code=patient_code)
                qs = qs.filter(user=patient.userId)
            except Patient.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Patient '{patient_code}' not found."))
                return

        # Group by user and collect dates whose minutes_asleep looks inflated.
        inflated_by_user: dict = {}
        for record in qs.only("user", "date", "sleep"):
            sleep = record.sleep
            if sleep is None:
                continue
            asleep = sleep.minutes_asleep
            duration_ms = sleep.sleep_duration
            if asleep is None or duration_ms is None:
                continue
            if asleep != duration_ms // 60000:
                # Already correct (or stored as exact minutes not matching the floor).
                continue
            uid = str(record.user.id)
            inflated_by_user.setdefault(uid, {"user_doc": record.user, "records": []})
            inflated_by_user[uid]["records"].append(record)

        if not inflated_by_user:
            self.stdout.write(self.style.SUCCESS("[backfill_gh_sleep] No inflated records found."))
            return

        total_inflated = sum(len(b["records"]) for b in inflated_by_user.values())
        self.stdout.write(
            f"[backfill_gh_sleep] {total_inflated} potentially-inflated record(s) across "
            f"{len(inflated_by_user)} user(s)."
        )

        updated_total = 0
        skipped_users = 0

        for uid, bucket in inflated_by_user.items():
            user = bucket["user_doc"]
            records = bucket["records"]

            patient_code_str = uid
            try:
                patient = user.patient
                patient_code_str = getattr(patient, "patient_code", uid)
            except Exception:
                pass

            try:
                access_token = get_valid_google_access_token(user)
            except Exception as exc:
                self.stderr.write(f"  [{patient_code_str}] Cannot get token: {exc}")
                skipped_users += 1
                continue

            # Fetch all sleep points once, grouped by civil date — avoids one API call per day.
            sleep_by_date: dict[datetime.date, list] = {}
            try:
                for pt in _list_points(access_token, "sleep"):
                    iv = pt.get("sleep", {}).get("interval", {})
                    start_str = iv.get("startTime", "")
                    end_str = iv.get("endTime", "")
                    if not start_str:
                        continue
                    civil_date = _sleep_civil_date(start_str, end_str)
                    if civil_date is None:
                        continue
                    sleep_by_date.setdefault(civil_date, []).append(pt)
            except Exception as exc:
                self.stderr.write(f"  [{patient_code_str}] API error fetching sleep: {exc}")
                skipped_users += 1
                continue

            user_updated = 0
            for record in records:
                rec_date = record.date.date() if isinstance(record.date, datetime.datetime) else record.date
                points = sleep_by_date.get(rec_date, [])
                if not points:
                    self.stdout.write(f"  [{patient_code_str}] {rec_date}: no API data (skipped)")
                    continue

                aggregated = _aggregate_sleep(points)
                if aggregated is None:
                    continue

                new_asleep = aggregated.get("minutes_asleep")
                if new_asleep is None:
                    continue

                old_asleep = record.sleep.minutes_asleep
                if new_asleep == old_asleep:
                    continue  # no change needed

                if dry_run:
                    self.stdout.write(
                        f"  [{patient_code_str}] {rec_date}: minutes_asleep {old_asleep} → {new_asleep} (dry-run)"
                    )
                else:
                    GoogleHealthData.objects(id=record.id).update_one(
                        set__sleep__minutes_asleep=new_asleep,
                    )
                user_updated += 1

            updated_total += user_updated
            self.stdout.write(
                f"  [{patient_code_str}] {'Would update' if dry_run else 'Updated'} {user_updated} record(s)"
            )

        label = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"[backfill_gh_sleep] Done. {label} {updated_total} record(s) across "
                f"{len(inflated_by_user) - skipped_users} user(s). "
                f"{skipped_users} user(s) skipped (token error)."
            )
        )
