"""
Null out minutes_asleep for GoogleHealthData records where the stored value equals
sleep_duration / 60_000 (time-in-bed), which indicates a GH API bug returned the wrong
value.  Only records that fall within REDCap monitoring windows are targeted, since those
are the ones that affect REDCap exports.

Usage:
    python manage.py nullify_inflated_gh_sleep --dry-run
    python manage.py nullify_inflated_gh_sleep
    python manage.py nullify_inflated_gh_sleep --patient 901-34
"""

from datetime import timedelta, date

from django.core.management.base import BaseCommand

from core.models import GoogleHealthData, FitbitData, Patient

BASELINE_START = 8
BASELINE_END = 28
FOLLOWUP_START = 150
FOLLOWUP_END = 180


def _find_first_date(user):
    gh = GoogleHealthData.objects(user=user, steps__ne=None).order_by("date").first()
    fb = FitbitData.objects(user=user).order_by("date").first()
    dates = [r.date.date() if hasattr(r.date, "date") else r.date for r in [gh, fb] if r]
    return min(dates) if dates else None


def _monitoring_windows(patient):
    """Return (baseline_start, baseline_end, followup_start, followup_end) or None."""
    try:
        user = patient.userId
    except Exception:
        return None
    fd = _find_first_date(user)
    if not fd:
        return None
    if patient.createdAt:
        ca = patient.createdAt.date() if hasattr(patient.createdAt, "date") else patient.createdAt
        fd = max(fd, ca)
    bl_start = fd + timedelta(days=BASELINE_START - 1)
    bl_end = fd + timedelta(days=BASELINE_END - 1)
    fu_start = fd + timedelta(days=FOLLOWUP_START - 1)
    fu_end = fd + timedelta(days=FOLLOWUP_END - 1)
    return bl_start, bl_end, fu_start, fu_end


def _in_window(record_date, windows):
    d = record_date.date() if hasattr(record_date, "date") else record_date
    bl_start, bl_end, fu_start, fu_end = windows
    return (bl_start <= d <= bl_end) or (fu_start <= d <= fu_end)


class Command(BaseCommand):
    help = "Null minutes_asleep for GH records where it equals time-in-bed and falls in a REDCap monitoring window."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report changes without applying them")
        parser.add_argument("--patient", help="Only process this patient code")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        patient_filter = options.get("patient")

        qs = Patient.objects(redcap_project__ne=None)
        if patient_filter:
            qs = qs.filter(patient_code=patient_filter)

        total_nullified = 0

        for patient in qs:
            windows = _monitoring_windows(patient)
            if not windows:
                continue
            try:
                user = patient.userId
            except Exception:
                continue

            records = GoogleHealthData.objects(user=user, sleep__ne=None)
            for rec in records:
                s = rec.sleep
                if s is None or s.minutes_asleep is None or s.sleep_duration is None:
                    continue
                if s.minutes_asleep != s.sleep_duration // 60000:
                    continue  # not inflated
                if not _in_window(rec.date, windows):
                    continue

                d = rec.date.date() if hasattr(rec.date, "date") else rec.date
                self.stdout.write(
                    f"  {patient.patient_code}  {d}  minutes_asleep={s.minutes_asleep}"
                    f"  sleep_duration={s.sleep_duration // 60000}min"
                    f"  {'(dry-run)' if dry_run else '→ nullifying'}"
                )
                if not dry_run:
                    GoogleHealthData.objects(id=rec.id).update_one(set__sleep__minutes_asleep=None)
                total_nullified += 1

        label = "Would nullify" if dry_run else "Nullified"
        self.stdout.write(self.style.SUCCESS(f"\n{label} {total_nullified} record(s)."))
