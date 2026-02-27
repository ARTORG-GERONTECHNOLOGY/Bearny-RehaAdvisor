import logging
from datetime import datetime, timedelta

from bson import ObjectId
from dateutil.relativedelta import relativedelta
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware
from pymongo import MongoClient

from core.models import (
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    User,
)

logger = logging.getLogger(__name__)
import re
import tempfile
import unicodedata
from typing import Any, Dict, List, Optional

import speech_recognition as sr
from django.utils.timezone import is_naive, make_aware
from pydub import AudioSegment


def bad(
    message: str,
    field_errors: Optional[Dict[str, List[str]]] = None,
    non_field_errors: Optional[List[str]] = None,
    status: int = 400,
    extra: Optional[Dict[str, Any]] = None,
):
    payload: Dict[str, Any] = {
        "success": False,
        "message": message,
        "field_errors": field_errors or {},
        "non_field_errors": non_field_errors or [],
    }
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def validate_password_strength(password: str):
    """
    Validate password strength with:
    - Min 8 chars
    - Uppercase, lowercase, digit, special char
    - No spaces
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."

    if " " in password:
        return False, "Password may not contain spaces."

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."

    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit."

    if not re.search(r"[^\w\s]", password):
        return False, "Password must contain at least one symbol (e.g. !@#$%)."

    return True, None


def check_rate_limit(user):
    record = PasswordAttempt.objects(user=user).first()

    if not record:
        record = PasswordAttempt(user=user, count=0)
        record.save()
        return False, record

    now = datetime.utcnow()

    # Reset counter after 1 hour
    if now - record.last_attempt > timedelta(hours=1):
        record.count = 0
        record.last_attempt = now
        record.save()
        return False, record

    # Lockout after 5 failed attempts
    if record.count >= 5:
        return True, record

    return False, record


def increment_attempt(record):
    record.count += 1
    record.last_attempt = datetime.utcnow()
    record.save()


def resolve_patient(identifier: str):
    """
    Accepts any of:
      - Patient._id (ObjectId string)
      - User._id (ObjectId string)
      - username (User.username, your patient_code)
      - Patient.patient_code
    Returns Patient or None.
    """
    if not identifier:
        return None

    # Username/patient_code path
    try:
        u = User.objects.get(pk=identifier)
        return Patient.objects.get(userId=u)
    except (User.DoesNotExist, Patient.DoesNotExist):
        pass

    try:
        return Patient.objects.get(pk=identifier)
    except Patient.DoesNotExist:
        return None


def transcribe_file(input_path):
    # convert ANYTHING into a proper WAV
    wav_path = input_path + ".wav"
    AudioSegment.from_file(input_path).export(wav_path, format="wav")

    recognizer = sr.Recognizer()
    with sr.AudioFile(wav_path) as source:
        audio_data = recognizer.record(source)
        return recognizer.recognize_google(audio_data)


def ensure_aware(dt):
    return make_aware(dt) if is_naive(dt) else dt


def sanitize_text(text, is_name=False):
    if not isinstance(text, str):
        return text  # return unchanged if not a string

    # Replace special characters like ä → ae
    char_map = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "Ä": "Ae",
        "Ö": "Oe",
        "Ü": "Ue",
        "ß": "ss",
    }
    for original, replacement in char_map.items():
        text = text.replace(original, replacement)

    # Normalize accents (é → e)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ASCII", "ignore").decode("utf-8")

    # Strip leading/trailing and collapse inner whitespace
    text = text.strip()
    text = re.sub(r"\s+", " ", text)

    if is_name:
        # Capitalize each word (Name Case)
        text = " ".join(word.capitalize() for word in text.split())

    return text


def parse_start_date(start_date):
    """
    Parse a start date from string or datetime to a timezone-naive datetime object.
    """
    try:
        if isinstance(start_date, str):
            return datetime.fromisoformat(start_date.replace("Z", "+00:00")).replace(tzinfo=None)
        elif isinstance(start_date, datetime):
            return start_date.replace(tzinfo=None)
    except Exception as e:
        logger.warning(f"Failed to parse start date: {e}")
    return timezone.now().replace(tzinfo=None)


def generate_repeat_dates(patient_end_date, repeat_data):
    """
    Generate repeat dates using the *new flattened* schedule structure.

    Accepts both:
      - new fields: end_type, end_date, count_limit, selected_days
      - legacy fields: end: {type, date, count}, selectedDays
    """

    # -----------------------------
    # Extract fields (with fallback)
    # -----------------------------
    interval = repeat_data.get("interval", 1)
    unit = repeat_data.get("unit")

    selected_days = repeat_data.get("selected_days") or repeat_data.get("selectedDays") or []

    # ---- NEW FORMAT ----
    end_type = repeat_data.get("end_type")
    end_date_raw = repeat_data.get("end_date")
    count_limit = repeat_data.get("count_limit")

    # ---- BACKWARD COMPATIBILITY ----
    if "end" in repeat_data and isinstance(repeat_data["end"], dict):
        end_type = repeat_data["end"].get("type") or end_type
        end_date_raw = repeat_data["end"].get("date") or end_date_raw
        count_limit = repeat_data["end"].get("count") or count_limit

    # -----------------------------
    # Parse end_date if exists
    # -----------------------------
    end_date_limit = None
    if end_date_raw:
        try:
            end_date_limit = datetime.fromisoformat(end_date_raw.replace("Z", "+00:00"))
            if is_naive(end_date_limit):
                end_date_limit = make_aware(end_date_limit)
        except Exception:
            logger.warning("Failed to parse end_date")

    # -----------------------------
    # Parse start_date
    # -----------------------------
    raw_start = repeat_data.get("start_date") or repeat_data.get("startDate")
    current_date = parse_start_date(raw_start)  # your existing helper

    if is_naive(current_date):
        current_date = make_aware(current_date)

    # -----------------------------
    # Boundaries
    # -----------------------------
    if is_naive(patient_end_date):
        patient_end_date = make_aware(patient_end_date)

    final_end_date = min(end_date_limit, patient_end_date) if end_date_limit else patient_end_date

    # -----------------------------
    # Prepare weekday map
    # -----------------------------
    day_map = {
        "Mon": 0,
        "Tue": 1,
        "Wed": 2,
        "Thu": 3,
        "Fri": 4,
        "Sat": 5,
        "Sun": 6,
        "Dien": 1,
        "Mitt": 2,
        "Don": 3,
        "Fre": 4,  # German fallback
        "Sam": 5,
        "Son": 6,
    }

    selected_day_indices = [day_map[d] for d in selected_days if d in day_map]

    generated_dates = []
    occurrence = 0

    # -----------------------------
    # Core generator loop
    # -----------------------------
    while current_date <= final_end_date:

        if unit == "day":
            generated_dates.append(current_date)
            occurrence += 1
            current_date += timedelta(days=interval)

        elif unit == "week":
            for i in range(7):
                day = current_date + timedelta(days=i)
                if day.weekday() in selected_day_indices and day <= final_end_date:
                    generated_dates.append(day)
                    occurrence += 1

                    if end_type == "count" and count_limit and occurrence >= count_limit:
                        return generated_dates

            current_date += timedelta(weeks=interval)

        elif unit == "month":
            generated_dates.append(current_date)
            occurrence += 1
            current_date += relativedelta(months=interval)

        # End via count
        if end_type == "count" and count_limit and occurrence >= count_limit:
            break

    return generated_dates


def get_db_handle(db_name, host, port, username, password):
    """
    Create a MongoDB client connection and return the database handle.
    """
    client = MongoClient(host=host, port=int(port), username=username, password=password)
    return client[db_name], client


def convert_to_serializable(obj):
    """
    Convert MongoEngine objects and other BSON/JSON non-serializable objects to JSON-serializable format.
    """
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {key: convert_to_serializable(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [convert_to_serializable(item) for item in obj]
    return obj


def serialize_datetime(obj):
    """
    Convert datetime object to ISO 8601 string format.
    """
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    raise TypeError(f"Unsupported type for serialization: {type(obj)}")


def get_labels(data, key):
    """
    Extract list of 'label' values from a dictionary containing a list of objects under the given key.
    """
    items = data.get(key, [])
    if not isinstance(items, list):
        items = [items]
    return [item["label"] for item in items if isinstance(item, dict) and "label" in item]


def generate_custom_id(user_type):
    """
    Generate a unique custom ID based on the user type.
    """
    prefix_map = {"Therapist": "t", "Patient": "p", "Researcher": "r", "Admin": "a"}
    prefix = prefix_map.get(user_type)

    if prefix == "p":
        count = Patient.objects.count() + 1
    elif prefix == "t":
        count = Therapist.objects.count() + 1
    elif prefix == "r":
        count = Researcher.objects.count() + 1
    elif prefix == "a":
        count = User.objects.filter(username__startswith="a").count() + 1

    else:
        logger.warning(f"Unknown user type for ID generation: {user_type}")
        return "unknown0"

    return f"{prefix}{count}"


def _adherence(patient, lookback_days: int = 7):
    """
    Returns (adherence_7d, adherence_total_until_now) for the patient.

    - Denominator uses scheduled occurrences from RehabilitationPlan.interventions[].dates
      that fall inside the window (7d) or up to 'now'.
    - Numerator uses PatientInterventionLogs with status containing 'completed'.
    - All datetimes (schedule + logs) are normalized to timezone-aware before comparison.
    - Falls back to completed/(completed+skipped) if no schedule was created for the window.
    """
    now = timezone.now()  # aware
    since = now - timedelta(days=lookback_days)

    # ---- helpers ------------------------------------------------------------
    def _to_dt(v):
        """Accept datetime or ISO string -> datetime (may be naive)."""
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                s = v.strip()
                if s.endswith("Z"):
                    s = s[:-1] + "+00:00"
                return datetime.fromisoformat(s)
            except Exception:
                return None
        return None

    def _aware(dt: datetime | None) -> datetime | None:
        """Make a datetime timezone-aware (current TZ; fallback UTC)."""
        if not isinstance(dt, datetime):
            return None
        if timezone.is_naive(dt):
            try:
                return timezone.make_aware(dt, timezone.get_current_timezone())
            except Exception:
                return timezone.make_aware(dt, timezone.utc)
        return dt

    # ---- scheduled dates from the plan -------------------------------------
    denom_total = 0
    denom_7 = 0
    plan = RehabilitationPlan.objects(patientId=patient).first()
    if plan:
        for ia in getattr(plan, "interventions", []) or []:
            for d in getattr(ia, "dates", []) or []:
                dt = _aware(_to_dt(d))
                if not dt:
                    continue
                if dt <= now:
                    denom_total += 1
                if since <= dt <= now:
                    denom_7 += 1

    # ---- logs (don’t date-filter in query; normalize per-row) --------------
    comp_total = comp_7 = 0
    skip_total = skip_7 = 0
    for lg in PatientInterventionLogs.objects(userId=patient).only("date", "status"):
        dt = _aware(getattr(lg, "date", None))
        if not dt:
            continue
        statuses = {s.lower() for s in (lg.status or [])}
        is_completed = "completed" in statuses
        is_skipped = "skipped" in statuses

        if dt <= now:
            if is_completed:
                comp_total += 1
            if is_skipped:
                skip_total += 1
        if since <= dt <= now:
            if is_completed:
                comp_7 += 1
            if is_skipped:
                skip_7 += 1

    # ---- adherence (fallback to completed/(completed+skipped) when no schedule)
    adh_total = (
        round(100 * comp_total / denom_total)
        if denom_total
        else (round(100 * comp_total / (comp_total + skip_total)) if (comp_total + skip_total) else None)
    )
    adh_7 = (
        round(100 * comp_7 / denom_7)
        if denom_7
        else (round(100 * comp_7 / (comp_7 + skip_7)) if (comp_7 + skip_7) else None)
    )

    return adh_7, adh_total
