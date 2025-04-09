from django.utils import timezone
from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
from datetime import timedelta
from core.models import Therapist, Patient
import re
import unicodedata
from django.utils.timezone import make_aware, is_naive


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
    if isinstance(start_date, str):
        try:
            return datetime.fromisoformat(start_date.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return timezone.now().replace(tzinfo=None)
    elif isinstance(start_date, datetime):
        return start_date.replace(tzinfo=None)
    else:
        return timezone.now().replace(tzinfo=None)

def generate_repeat_dates(patient_end_date, repeat_data):
    interval = repeat_data.get("interval", 1)
    unit = repeat_data.get("unit")
    selected_days = repeat_data.get("selectedDays", [])
    end_type = repeat_data["end"]["type"]
    end_date_limit = None
    temp = repeat_data["end"].get("date", False)
    if temp:
        end_date_limit = datetime.fromisoformat(temp.replace("Z", "+00:00"))

    count_limit = repeat_data["end"].get("count")

    start_date_raw = repeat_data.get("startDate", timezone.now())
    if isinstance(start_date_raw, str):
        current_date = datetime.fromisoformat(start_date_raw.replace("Z", "+00:00"))
    else:
        current_date = start_date_raw

    day_map = {
        "Mon": 0, "Dien": 1, "Mitt": 2, "Don": 3,
        "Fre": 4, "Sam": 5, "Son": 6
    }
    selected_day_indices = [day_map[day] for day in selected_days if day in day_map]

    if end_date_limit and is_naive(end_date_limit):
        end_date_limit = make_aware(end_date_limit)

    if is_naive(patient_end_date):
        patient_end_date = make_aware(patient_end_date)

    final_end_date = min(end_date_limit, patient_end_date) if end_date_limit else patient_end_date

    if is_naive(current_date):
        current_date = make_aware(current_date)


    generated_dates = []
    occurrence = 0

    while current_date <= final_end_date:
        if unit == "day":
            generated_dates.append(current_date)
            occurrence += 1
            current_date += timedelta(days=interval)

        elif unit == "week":
            week_start = current_date
            for i in range(7):
                day = week_start + timedelta(days=i)
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

     client = MongoClient(host=host,
                          port=int(port),
                          username=username,
                          password=password
                         )
     db_handle = client[db_name]
     return db_handle, client


def convert_to_serializable(obj):
    """Convert MongoEngine objects and other non-serializable data types to JSON serializable format."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {key: convert_to_serializable(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [convert_to_serializable(item) for item in obj]
    return obj


def serialize_datetime(obj):
    """Serialize datetime objects to ISO 8601 format."""
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    raise TypeError("Type not serializable")


def get_labels(data, key):
    """Extract 'label' values from a list of dictionaries in the request data."""
    items = data.get(key, [])
    if not isinstance(items, list):
        items = [items]
    return [item["label"] for item in items]


def generate_custom_id(user_type):
    """Generate a unique custom ID based on the user type and count."""

    user_type_prefix = {
        'Therapist': 't',
        'Patient': 'p',
        'Researcher': 'r',
    }.get(user_type)
    if user_type_prefix == 'p':
        count = Patient.objects.count() + 1
    elif user_type_prefix == 'r':
        count = Researcher.objects.count() + 1
    elif user_type_prefix == 't':
        count = Therapist.objects.count() + 1
    else:
        count = 0

    return f"{user_type_prefix}{count}"
