import datetime
import logging

import requests
from django.core.management.base import BaseCommand

from core.models import FitbitData, FitbitUserToken

logger = logging.getLogger(__name__)

# Fitbit time-series API allows up to 100 days per request.
_MAX_DAYS_PER_REQUEST = 100


class Command(BaseCommand):
    help = (
        "Backfill lightly_active_minutes (and recalculate inactivity_minutes) for "
        "FitbitData records that were created before the field was added. "
        "Fetches minutesLightlyActive from the Fitbit API for each affected user."
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
            help="Limit to a single patient_code (e.g. 905-12)",
        )

    def handle(self, *args, **kwargs):
        from core.models import Patient
        from core.views.fitbit_sync import FITBIT_API_URL, get_valid_access_token

        dry_run = kwargs["dry_run"]
        patient_code = kwargs["patient"]

        # Build a queryset of FitbitData records that need backfilling.
        qs = FitbitData.objects(lightly_active_minutes=None)

        if patient_code:
            try:
                patient = Patient.objects.get(patient_code=patient_code)
                qs = qs.filter(user=patient.userId)
            except Patient.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Patient '{patient_code}' not found."))
                return

        total_records = qs.count()
        if total_records == 0:
            self.stdout.write(self.style.SUCCESS("No FitbitData records need backfilling."))
            return

        self.stdout.write(f"[backfill_lightly_active] {total_records} record(s) need backfilling.")

        # Group records by user to minimise API round-trips.
        records_by_user: dict = {}
        for record in qs.only("user", "date", "active_minutes", "sleep_minutes"):
            uid = str(record.user.id)
            records_by_user.setdefault(uid, {"user_doc": record.user, "records": []})
            records_by_user[uid]["records"].append(record)

        updated_total = 0
        error_users = 0

        for uid, bucket in records_by_user.items():
            user = bucket["user_doc"]
            records = sorted(bucket["records"], key=lambda r: r.date)

            patient_code_str = str(uid)
            try:
                patient = user.patient
                patient_code_str = getattr(patient, "patient_code", uid)
            except Exception:
                pass

            # Obtain a valid Fitbit access token.
            try:
                access_token = get_valid_access_token(user)
            except Exception as exc:
                self.stderr.write(f"  [{patient_code_str}] Cannot get token: {exc}")
                error_users += 1
                continue

            headers = {"Authorization": f"Bearer {access_token}"}

            # Fetch minutesLightlyActive in ≤100-day chunks.
            light_by_date: dict[datetime.date, int] = {}
            start_idx = 0
            while start_idx < len(records):
                chunk = records[start_idx : start_idx + _MAX_DAYS_PER_REQUEST]
                start_str = chunk[0].date.strftime("%Y-%m-%d")
                end_str = chunk[-1].date.strftime("%Y-%m-%d")
                url = f"{FITBIT_API_URL}/activities/minutesLightlyActive/date/{start_str}/{end_str}.json"
                try:
                    r = requests.get(url, headers=headers, timeout=15)
                except Exception as exc:
                    self.stderr.write(f"  [{patient_code_str}] Request error for {start_str}–{end_str}: {exc}")
                    start_idx += _MAX_DAYS_PER_REQUEST
                    continue

                if r.status_code != 200:
                    self.stderr.write(f"  [{patient_code_str}] HTTP {r.status_code} for {start_str}–{end_str}")
                    start_idx += _MAX_DAYS_PER_REQUEST
                    continue

                for item in r.json().get("activities-minutesLightlyActive", []):
                    try:
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        light_by_date[dt] = int(float(item["value"]))
                    except (KeyError, ValueError):
                        pass

                start_idx += _MAX_DAYS_PER_REQUEST

            # Apply values to each record.
            user_updated = 0
            for record in records:
                dt = record.date if isinstance(record.date, datetime.date) else record.date.date()
                lightly_active_minutes = light_by_date.get(dt)
                if lightly_active_minutes is None:
                    # API returned no data for this date — leave as None.
                    continue

                active_min = record.active_minutes or 0
                sleep_min = record.sleep_minutes or 0
                light_min = lightly_active_minutes
                inactivity = max(0, 1440 - (active_min + light_min + sleep_min))

                if dry_run:
                    self.stdout.write(
                        f"  [{patient_code_str}] {dt}: lightly_active={lightly_active_minutes}, "
                        f"inactivity {record.inactivity_minutes} → {inactivity} (dry-run)"
                    )
                else:
                    FitbitData.objects(id=record.id).update_one(
                        set__lightly_active_minutes=lightly_active_minutes,
                        set__inactivity_minutes=inactivity,
                    )
                user_updated += 1

            updated_total += user_updated
            self.stdout.write(
                f"  [{patient_code_str}] {'Would update' if dry_run else 'Updated'} {user_updated} record(s)"
            )

        label = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"[backfill_lightly_active] Done. {label} {updated_total} record(s) across "
                f"{len(records_by_user) - error_users} user(s). "
                f"{error_users} user(s) skipped (token error)."
            )
        )
