from django.utils import timezone
from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
from datetime import timedelta
from core.models import Therapist, Patient, Researcher

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
    print(repeat_data)
    interval = repeat_data.get("interval", 1)
    unit = repeat_data.get("unit")
    selected_days = repeat_data.get("selectedDays", [])
    end_type = repeat_data["end"]["type"]
    temp = repeat_data["end"].get("date", False)
    if temp:
        end_date_limit = datetime.fromisoformat(repeat_data["end"].get("date").replace("Z", "+00:00")).isoformat()
    count_limit = repeat_data["end"].get("count")
    start_date =  repeat_data.get("startDate", timezone.now())

    # Weekday map for converting to weekday index
    day_map = {
        "Mon": 0, "Dien": 1, "Mitt": 2, "Don": 3,
        "Fre": 4, "Sam": 5, "Son": 6
    }
    if unit != 'day':
        # Convert weekday names to their corresponding numbers
        selected_weekday_nums = sorted([day_map[day] for day in selected_days])
        selected_day_indices = [day_map[day] for day in selected_days if day in day_map]

    # Final end date limit
    if end_type == "date" and end_date_limit:
        final_end_date = min(end_date_limit, patient_end_date)
    else:
        final_end_date = patient_end_date

    generated_dates = []
    current_date = parse_start_date(start_date)

    occurrence = 0
    while current_date <= final_end_date:
        print(current_date)
        print(generated_dates)
        if unit == "day":
            generated_dates.append(current_date)
            occurrence += 1
            current_date += timedelta(days=interval)

        elif unit == "week":
            week_start = current_date
            for i in range(7):
                day = week_start + timedelta(days=i)
                print(day.weekday())
                print('hi')
                print(selected_day_indices)
                if day.weekday() in selected_day_indices and day <= final_end_date:
                    generated_dates.append(day)
                    occurrence += 1
                    if end_type == "count" and occurrence >= count_limit:
                        return [d.isoformat() for d in generated_dates]
            current_date += timedelta(weeks=interval)

        elif unit == "month":
            generated_dates.append(current_date)
            occurrence += 1
            current_date += relativedelta(months=interval)

        if end_type == "count" and occurrence >= count_limit:
            break

    return [datetime.fromisoformat(d.isoformat()) for d in generated_dates]



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
