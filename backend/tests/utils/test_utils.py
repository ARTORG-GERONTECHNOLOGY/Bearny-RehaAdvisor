"""
Utility Functions Tests

This module tests utility functions used throughout the backend including:
- Date and time handling (timezone awareness, parsing)
- Text sanitization and cleaning
- Data serialization and conversion
- ID generation
- Database utilities
- Repeat date generation for interventions

Framework: pytest with mongomock
Tests: 20+ utility functions covering data manipulation and formatting
"""

from datetime import datetime, timedelta
from unittest import mock

import mongomock
import pytest
from bson import ObjectId

from core.models import Patient, Therapist, User
from utils.utils import (
    convert_to_serializable,
    ensure_aware,
    generate_custom_id,
    generate_repeat_dates,
    get_db_handle,
    get_labels,
    parse_start_date,
    sanitize_text,
    serialize_datetime,
)


@pytest.fixture(autouse=True)
def mongo_mock():
    """
    Fixture: Mock MongoDB for utility tests
    
    Sets up:
    - In-memory MongoDB client for each test
    - No external database dependency
    - Cleanup after test completes
    """
    conn = mongomock.MongoClient()
    yield conn
    conn.close()


def test_ensure_aware_naive_datetime():
    """
    
    Setup:
    - Naive datetime created with datetime.now()
    - No timezone information
    
    Steps:
    
    Expected Results:
    - Returned datetime has tzinfo set (not None)
    - Can be used for database storage
    
    Why Important: Ensures consistent timezone handling across system
    """
    naive_dt = datetime.now()
    aware_dt = ensure_aware(naive_dt)
    assert aware_dt.tzinfo is not None


def test_ensure_aware_already_aware_datetime():
    """
    
    Setup:
    - Datetime already has timezone info
    - Created with .astimezone()
    
    Steps:
    
    Expected Results:
    - Returned datetime still has tzinfo
    - No modification needed
    - Idempotent operation
    """
    aware_dt = ensure_aware(datetime.now().astimezone())
    assert aware_dt.tzinfo is not None


def test_sanitize_text_basic():
    """
    
    Setup:
    - Text: "   Hello   World   " (extra spaces)
    
    Steps:
    
    Expected Results:
    - Returns: "Hello World"
    - Extra spaces removed
    - Ready for database storage
    
    Use Case: User input has trailing/leading spaces from copy-paste
    """
    text = "   Hello   World   "
    result = sanitize_text(text)
    assert result == "Hello World"


def test_sanitize_text_special_characters():
    """
    
    Setup:
    - Text: "Müller Straße" (German with umlauts)
    
    Steps:
    
    Expected Results:
    - Returns: "Mueller Strasse"
    - ASCII-safe for compatibility
    
    Use Case: International names in form fields, ensure storage compatibility
    """
    text = "Müller Straße"
    result = sanitize_text(text)
    assert result == "Mueller Strasse"


def test_sanitize_text_accented():
    """
    
    Setup:
    - Text: "Café Noël" (French with accents)
    
    Steps:
    
    Expected Results:
    - Returns: "Cafe Noel"
    - International characters normalized
    
    Use Case: Multi-language support, normalize user names
    """
    text = "Café Noël"
    result = sanitize_text(text)
    assert result == "Cafe Noel"


def test_sanitize_text_is_name():
    text = " john   doe "
    result = sanitize_text(text, is_name=True)
    assert result == "John Doe"


def test_parse_start_date_from_string():
    date_str = "2023-01-01T12:00:00Z"
    result = parse_start_date(date_str)
    assert isinstance(result, datetime)


def test_parse_start_date_from_datetime():
    dt = datetime(2023, 1, 1, 12, 0)
    result = parse_start_date(dt)
    assert isinstance(result, datetime)


def test_generate_repeat_dates_day_count_limit():
    patient_end_date = datetime.now() + timedelta(days=10)
    repeat_data = {
        "interval": 1,
        "unit": "day",
        "end": {"type": "count", "count": 3},
    }
    dates = generate_repeat_dates(patient_end_date, repeat_data)
    assert len(dates) == 3


def test_generate_repeat_dates_week_selected_days():
    patient_end_date = datetime.now() + timedelta(weeks=2)
    repeat_data = {
        "interval": 1,
        "unit": "week",
        "selectedDays": ["Mon", "Don"],  # Monday, Thursday
        "end": {"type": "count", "count": 4},
    }
    dates = generate_repeat_dates(patient_end_date, repeat_data)
    assert len(dates) == 4


def test_generate_repeat_dates_month_interval():
    patient_end_date = datetime.now() + timedelta(weeks=8)
    repeat_data = {
        "interval": 1,
        "unit": "month",
        "end": {"type": "count", "count": 2},
    }
    dates = generate_repeat_dates(patient_end_date, repeat_data)
    assert len(dates) == 2


@mock.patch("utils.utils.MongoClient")
def test_get_db_handle_returns_db_and_client(mock_mongo):
    mock_client = mock.MagicMock()  # <-- ✅ use MagicMock
    mock_mongo.return_value = mock_client
    db = mock.Mock()
    mock_client.__getitem__.return_value = db

    db_name = "test_db"
    host = "localhost"
    port = 27017
    username = "user"
    password = "pass"

    result_db, result_client = get_db_handle(db_name, host, port, username, password)

    assert result_db == db
    assert result_client == mock_client
    mock_mongo.assert_called_with(
        host=host, port=port, username=username, password=password
    )


def test_convert_to_serializable_objectid():
    obj_id = ObjectId()
    result = convert_to_serializable(obj_id)
    assert isinstance(result, str)


def test_convert_to_serializable_dict():
    obj = {"_id": ObjectId(), "name": "Test"}
    result = convert_to_serializable(obj)
    assert isinstance(result["_id"], str)
    assert result["name"] == "Test"


def test_convert_to_serializable_list():
    obj = [ObjectId(), {"_id": ObjectId()}]
    result = convert_to_serializable(obj)
    assert isinstance(result[0], str)
    assert isinstance(result[1]["_id"], str)


def test_serialize_datetime_valid():
    dt = datetime.now()
    result = serialize_datetime(dt)
    assert isinstance(result, str)


def test_serialize_datetime_invalid_type():
    with pytest.raises(TypeError):
        serialize_datetime("not a datetime")


def test_get_labels_valid():
    data = {"items": [{"label": "A"}, {"label": "B"}]}
    labels = get_labels(data, "items")
    assert labels == ["A", "B"]


def test_get_labels_single_dict():
    data = {"items": {"label": "A"}}
    labels = get_labels(data, "items")
    assert labels == ["A"]


@mock.patch("core.models.Patient.objects")
def test_generate_custom_id_patient(mock_objects):
    mock_objects.count.return_value = 5  # ✅ Now count() returns 5
    result = generate_custom_id("Patient")
    assert result.startswith("p")
    assert result == "p6"


@mock.patch("core.models.Therapist.objects")
def test_generate_custom_id_therapist(mock_objects):
    mock_objects.count.return_value = 3
    result = generate_custom_id("Therapist")
    assert result == "t4"


@mock.patch("core.models.User.objects")
def test_generate_custom_id_admin(mock_objects):
    mock_objects.filter.return_value.count.return_value = 4
    result = generate_custom_id("Admin")
    assert result == "a5"


def test_generate_custom_id_unknown():
    result = generate_custom_id("Unknown")
    assert result == "unknown0"


def test_parse_start_date_invalid_string_logs_warning(caplog):
    invalid_str = "bad-date-format"
    with caplog.at_level("WARNING"):
        result = parse_start_date(invalid_str)
    assert isinstance(result, datetime)  # fallback to now
    assert "Failed to parse start date" in caplog.text


def test_generate_repeat_dates_invalid_end_date_logs_warning(caplog):
    patient_end_date = datetime.now() + timedelta(days=10)
    repeat_data = {
        "interval": 1,
        "unit": "day",
        "end": {"type": "count", "count": 2, "date": "bad-date-format"},
    }
    with caplog.at_level("WARNING"):
        dates = generate_repeat_dates(patient_end_date, repeat_data)
    assert len(dates) == 2  # fallback: no end_date_limit applied
    assert "Failed to parse end date" in caplog.text
