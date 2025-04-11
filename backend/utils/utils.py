import logging
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from bson import ObjectId
from pymongo import MongoClient
from django.utils.timezone import is_naive, make_aware
from django.utils import timezone
from core.models import Patient, Therapist

logger = logging.getLogger(__name__)
import re
import unicodedata
from django.utils.timezone import make_aware, is_naive

def ensure_aware(dt):
    return make_aware(dt) if is_naive(dt) else dt

def sanitize_text(text, is_name=False):
    if not isinstance(text, str):
        return text  # return unchanged if not a string

    # Replace special characters like ä → ae
    char_map = {
        'ä': 'ae', 'ö': 'oe', 'ü': 'ue',
        'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
        'ß': 'ss'
    }
    for original, replacement in char_map.items():
        text = text.replace(original, replacement)

    # Normalize accents (é → e)
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ASCII', 'ignore').decode('utf-8')

    # Strip leading/trailing and collapse inner whitespace
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)

    if is_name:
        # Capitalize each word (Name Case)
        text = ' '.join(word.capitalize() for word in text.split())

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
    Generate a list of repeat dates for an intervention based on interval, unit, and end rules.
    """
    interval = repeat_data.get("interval", 1)
    unit = repeat_data.get("unit")
    selected_days = repeat_data.get("selectedDays", [])
    end_type = repeat_data["end"]["type"]
    end_date_limit = None

    try:
        raw_date = repeat_data["end"].get("date")
        if raw_date:
            end_date_limit = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
    except Exception as e:
        logger.warning(f"Failed to parse end date: {e}")

    count_limit = repeat_data["end"].get("count", 0)

    current_date = parse_start_date(repeat_data.get("startDate", timezone.now()))

    day_map = {
        "Mon": 0, "Dien": 1, "Mitt": 2, "Don": 3,
        "Fre": 4, "Sam": 5, "Son": 6
    }
    selected_day_indices = [day_map[day] for day in selected_days if day in day_map]

    # Ensure all dates are aware
    if end_date_limit and is_naive(end_date_limit):
        end_date_limit = make_aware(end_date_limit)
    if is_naive(patient_end_date):
        patient_end_date = make_aware(patient_end_date)
    if is_naive(current_date):
        current_date = make_aware(current_date)

    final_end_date = min(end_date_limit, patient_end_date) if end_date_limit else patient_end_date
    generated_dates = []
    occurrence = 0

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
                    if end_type == "count" and occurrence >= count_limit:
                        return generated_dates
            current_date += timedelta(weeks=interval)
        elif unit == "month":
            generated_dates.append(current_date)
            occurrence += 1
            current_date += relativedelta(months=interval)

        if end_type == "count" and occurrence >= count_limit:
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
    prefix_map = {'Therapist': 't', 'Patient': 'p', 'Researcher': 'r'}
    prefix = prefix_map.get(user_type)
    
    if prefix == 'p':
        count = Patient.objects.count() + 1
    elif prefix == 't':
        count = Therapist.objects.count() + 1
    elif prefix == 'r':
        count = Researcher.objects.count() + 1
    else:
        logger.warning(f"Unknown user type for ID generation: {user_type}")
        return "unknown0"

    return f"{prefix}{count}"
