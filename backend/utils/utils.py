import datetime

from bson import ObjectId
from pymongo import MongoClient

from core.models import Therapist, Patient, Researcher


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
        count = Patient.objects.filter(user_type=user_type).count() + 1
    elif user_type_prefix == 'r':
        count = Researcher.objects.filter(user_type=user_type).count() + 1
    elif user_type_prefix == 't':
        count = Therapist.objects.filter(user_type=user_type).count() + 1
    else:
        count = 0

    return f"{user_type_prefix}{count}"
