"""
Fitbit views tests
==================

Endpoints covered
-----------------
- GET  /api/fitbit/status/<patient_id>/
- GET  /api/fitbit/callback/
- GET  /api/fitbit/health-data/<patient_id>/
- POST /api/fitbit/manual_steps/<patient_id>/
- GET  /api/fitbit/summary/<patient_id>/

Also covers helper functions:
- _default_thresholds
- _merge_thresholds
- avg_excluding_zero
"""

import json
from datetime import datetime, time
from types import SimpleNamespace
from unittest.mock import Mock, patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client, RequestFactory
from django.utils import timezone

from core.models import (
    FitbitData,
    FitbitUserToken,
    HeartRateZone,
    Patient,
    PatientVitals,
    SleepData,
    Therapist,
    User,
)
from core.views.fitbit_view import (
    _date,
    _default_thresholds,
    _merge_thresholds,
    _resolve_patient,
    _sleep_minutes,
    avg_excluding_zero,
    health_combined_history,
)

client = Client()
rf = RequestFactory()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    from mongoengine import connect, disconnect
    from mongoengine.connection import _connections

    alias = "default"
    if alias in _connections:
        disconnect(alias)

    conn = connect(
        "mongoenginetest",
        alias=alias,
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect(alias)


def create_patient_graph():
    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()

    patient_user = User(
        username=f"pt-{ObjectId()}",
        email="pt@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()
    return th_user, th, patient_user, patient


def test_helper_avg_excluding_zero():
    assert avg_excluding_zero([0, 10, 20]) == 15
    assert avg_excluding_zero([0, 0]) == 0


def test_helper_sleep_minutes_and_date():
    _, _, patient_user, _ = create_patient_graph()
    row = FitbitData(
        user=patient_user,
        date=datetime.now(),
        sleep=SleepData(sleep_duration=90 * 60 * 1000),
    )
    assert _sleep_minutes(row) == 90
    assert _sleep_minutes(SimpleNamespace(sleep="bad")) == 0
    assert _date(datetime(2026, 1, 1, 10, 30)) == "2026-01-01"


def test_threshold_defaults_and_merge():
    _, _, _, patient = create_patient_graph()
    defaults = _default_thresholds()
    assert defaults["steps_goal"] == 10000

    merged = _merge_thresholds(patient)
    assert merged["steps_goal"] == 10000
    assert merged["active_minutes_green"] == 30


def test_resolve_patient_by_query_and_authenticated_user():
    _, _, patient_user, patient = create_patient_graph()
    req_by_query = rf.get(f"/api/fitbit/summary/?patientId={patient.id}")
    req_by_query.user = SimpleNamespace(is_authenticated=False)
    assert _resolve_patient(req_by_query, None).id == patient.id

    req_by_user = rf.get("/api/fitbit/summary/")
    req_by_user.user = SimpleNamespace(
        is_authenticated=True,
        email=patient_user.email,
        username=patient_user.username,
    )
    assert _resolve_patient(req_by_user, None).id == patient.id


def test_fitbit_status_false_when_no_token():
    _, _, patient_user, _ = create_patient_graph()
    resp = client.get(f"/api/fitbit/status/{patient_user.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    assert resp.json()["connected"] is False


def test_fitbit_status_true_when_token_exists():
    _, _, patient_user, _ = create_patient_graph()
    FitbitUserToken(
        user=patient_user,
        access_token="a",
        refresh_token="r",
        fitbit_user_id="fu",
    ).save()

    resp = client.get(f"/api/fitbit/status/{patient_user.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    assert resp.json()["connected"] is True


def test_fitbit_status_true_when_called_with_patient_id():
    _, _, patient_user, patient = create_patient_graph()
    FitbitUserToken(
        user=patient_user,
        access_token="a",
        refresh_token="r",
        fitbit_user_id="fu",
    ).save()

    resp = client.get(f"/api/fitbit/status/{patient.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is True
    assert body["has_data"] is False
    assert body["last_data"] is None


def test_fitbit_status_unresolved_identifier_returns_false():
    resp = client.get("/api/fitbit/status/not-an-id/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is False
    assert body["has_data"] is False
    assert body["last_data"] is None


def test_fitbit_callback_missing_code_redirects():
    _, _, patient_user, _ = create_patient_graph()
    resp = client.get(
        f"/api/fitbit/callback/?state={patient_user.id}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 302
    assert "fitbit_status=missing_code" in resp.headers["Location"]


def test_fitbit_callback_missing_state_redirects():
    resp = client.get("/api/fitbit/callback/?code=abc", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 302
    assert "fitbit_status=unauthorized" in resp.headers["Location"]


def test_fitbit_callback_invalid_user_redirects():
    resp = client.get("/api/fitbit/callback/?code=abc&state=invalid", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 302
    assert "fitbit_status=invalid_user" in resp.headers["Location"]


@patch("core.views.fitbit_view.requests.post")
def test_fitbit_callback_token_exchange_error_redirects(mock_post):
    _, _, patient_user, _ = create_patient_graph()
    mock_resp = Mock()
    mock_resp.status_code = 400
    mock_resp.text = "bad"
    mock_post.return_value = mock_resp

    resp = client.get(
        f"/api/fitbit/callback/?code=abc&state={patient_user.id}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 302
    assert "fitbit_status=error" in resp.headers["Location"]


@patch("core.views.fitbit_view.requests.post")
def test_fitbit_callback_success_saves_token(mock_post):
    _, _, patient_user, _ = create_patient_graph()
    mock_resp = Mock()
    mock_resp.status_code = 200
    mock_resp.text = "ok"
    mock_resp.json.return_value = {
        "access_token": "acc",
        "refresh_token": "ref",
        "expires_in": 3600,
        "user_id": "fitbit-user",
    }
    mock_post.return_value = mock_resp

    resp = client.get(
        f"/api/fitbit/callback/?code=abc&state={patient_user.id}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 302
    assert "fitbit_status=connected" in resp.headers["Location"]
    tok = FitbitUserToken.objects(user=patient_user).first()
    assert tok is not None
    assert tok.access_token == "acc"


def test_get_fitbit_health_data_patient_not_found():
    resp = client.get(f"/api/fitbit/health-data/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    assert resp.json()["error"] == "Patient not found"


def test_get_fitbit_health_data_success_empty_data():
    _, _, _, patient = create_patient_graph()
    resp = client.get(f"/api/fitbit/health-data/{patient.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_manual_steps_method_not_allowed():
    resp = client.get(f"/api/fitbit/manual_steps/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


def test_manual_steps_invalid_json():
    resp = client.post(
        f"/api/fitbit/manual_steps/{ObjectId()}/",
        data="{bad",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "Invalid JSON"


def test_manual_steps_missing_fields():
    resp = client.post(
        f"/api/fitbit/manual_steps/{ObjectId()}/",
        data=json.dumps({"date": "2026-01-01"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "Missing date or steps"


def test_manual_steps_invalid_steps():
    resp = client.post(
        f"/api/fitbit/manual_steps/{ObjectId()}/",
        data=json.dumps({"date": "2026-01-01", "steps": "not-int"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "Invalid steps value"


def test_manual_steps_patient_not_found():
    resp = client.post(
        f"/api/fitbit/manual_steps/{ObjectId()}/",
        data=json.dumps({"date": "2026-01-01", "steps": 100}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


@patch("core.views.fitbit_view.FitbitData.objects")
def test_manual_steps_success_updates_steps(mock_objects):
    _, _, _, patient = create_patient_graph()
    resp = client.post(
        f"/api/fitbit/manual_steps/{patient.id}/",
        data=json.dumps({"date": "2026-01-01", "steps": 3210}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    mock_objects.return_value.update_one.assert_called_once()


@patch("core.views.fitbit_view.fetch_fitbit_today_for_user")
def test_fitbit_summary_cannot_resolve_patient_returns_400(mock_fetch):
    resp = client.get("/api/fitbit/summary/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert resp.json()["error"] == "Cannot resolve patient"


@patch("core.views.fitbit_view.fetch_fitbit_today_for_user")
def test_fitbit_summary_success_minimal(mock_fetch):
    _, _, _, patient = create_patient_graph()

    resp = client.get(f"/api/fitbit/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is False
    assert "thresholds" in body
    assert "period" in body
    assert body["period"]["days"] == 7


@patch("core.views.fitbit_view.fetch_fitbit_today_for_user")
def test_fitbit_summary_with_daily_data_and_vitals_merge(mock_fetch):
    _, _, patient_user, patient = create_patient_graph()
    now = timezone.now()
    FitbitData(
        user=patient_user,
        date=now,
        steps=1000,
        active_minutes=30,
        sleep=SleepData(sleep_duration=3600000, sleep_end=now.isoformat()),
    ).save()
    PatientVitals(patientId=patient, user=patient_user, date=now, bp_sys=120, bp_dia=80).save()

    resp = client.get(f"/api/fitbit/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"]["steps"] == 1000
    assert len(body["period"]["daily"]) >= 1


def test_get_fitbit_health_data_success_with_entries():
    _, _, patient_user, patient = create_patient_graph()
    today = datetime.now().date()
    dt0 = datetime.combine(today, time.min)
    FitbitData(
        user=patient_user,
        date=dt0,
        steps=1500,
        active_minutes=45,
        exercise={
            "sessions": [
                {
                    "logId": 1,
                    "name": "Walk",
                    "duration": 1800000,
                    "averageHeartRate": 110,
                    "maxHeartRate": 130,
                    "calories": 120,
                }
            ]
        },
        sleep=SleepData(
            sleep_duration=5400000,
            sleep_start="2026-01-01T23:00:00",
            sleep_end="2026-01-02T06:30:00",
            awakenings=1,
        ),
        heart_rate_zones=[HeartRateZone(name="Fat Burn", minutes=20, min=100, max=130)],
    ).save()
    PatientVitals(
        patientId=patient,
        user=patient_user,
        date=dt0,
        weight_kg=70.5,
        bp_sys=118,
        bp_dia=76,
    ).save()

    resp = client.get(f"/api/fitbit/health-data/{patient.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["sleep"]["sleep_hours"] > 0
    assert len(data[0]["heart_rate_zones"]) == 1


def test_health_combined_history_patient_not_found():
    req = rf.get(f"/api/patients/health-combined-history/{ObjectId()}/")
    resp = health_combined_history(req, str(ObjectId()))
    assert resp.status_code == 404


@patch("core.views.fitbit_view.PatientInterventionLogs.objects")
def test_health_combined_history_success_merges_fitbit_vitals_and_lists(
    mock_logs_objects,
):
    _, _, patient_user, patient = create_patient_graph()
    today = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    FitbitData(user=patient_user, date=today, steps=111).save()
    PatientVitals(
        patientId=patient,
        user=patient_user,
        date=today,
        weight_kg=70.2,
        bp_sys=119,
        bp_dia=79,
    ).save()

    qrow = SimpleNamespace(
        date=today,
        icfCode="d450",
        feedback_entries=[{"k": "v"}],
        question_translations=[{"language": "en", "text": "Q"}],
    )
    lrow = SimpleNamespace(date=today, scheduled_count=3, completed_count=2, adherence_percentage=66)

    mock_logs_objects.return_value.order_by.return_value = [lrow]

    with patch(
        "core.views.fitbit_view.PatientICFRating",
        new=SimpleNamespace(objects=lambda *a, **k: SimpleNamespace(order_by=lambda *x, **y: [qrow])),
        create=True,
    ):
        req = rf.get(f"/api/patients/health-combined-history/{patient.id}/")
        resp = health_combined_history(req, str(patient.id))
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert "fitbit" in body
    if body["fitbit"]:
        assert any((row.get("weight_kg") == 70.2 or row.get("steps") == 111) for row in body["fitbit"])
    assert len(body["questionnaire"]) == 1
    assert len(body["adherence"]) == 1


def test_health_combined_history_invalid_date_query_returns_500():
    _, _, _, patient = create_patient_graph()
    req = rf.get(f"/api/patients/health-combined-history/{patient.id}/?from=bad&to=bad")
    resp = health_combined_history(req, str(patient.id))
    assert resp.status_code == 500
    assert "error" in json.loads(resp.content)


@patch(
    "core.views.fitbit_view.fetch_fitbit_today_for_user",
    side_effect=Exception("sync failed"),
)
def test_fitbit_summary_internal_error_branch(mock_fetch):
    _, _, _, patient = create_patient_graph()

    resp = client.get(f"/api/fitbit/summary/{patient.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 500
    assert resp.json()["error"] == "Internal Server Error"


# ---------------------------------------------------------------------------
# minutes_asleep and wear_time_minutes in API responses
# ---------------------------------------------------------------------------


def test_health_data_includes_minutes_asleep():
    """health-data endpoint returns minutes_asleep in the sleep object."""
    _, _, patient_user, patient = create_patient_graph()
    today = datetime.now().date()
    dt0 = datetime.combine(today, time.min)
    FitbitData(
        user=patient_user,
        date=dt0,
        sleep=SleepData(
            sleep_duration=28800000,  # 8h in bed
            minutes_asleep=435,  # 7h15m actually asleep
            sleep_start="2026-01-01T22:00:00",
            sleep_end="2026-01-02T06:00:00",
        ),
    ).save()

    resp = client.get(
        f"/api/fitbit/health-data/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    entry = resp.json()["data"][0]
    assert entry["sleep"]["minutes_asleep"] == 435
    # sleep_hours still reflects time-in-bed (8.0h)
    assert entry["sleep"]["sleep_hours"] == pytest.approx(8.0, rel=1e-2)


@patch("core.views.fitbit_view.PatientInterventionLogs.objects")
@patch("core.views.fitbit_view.PatientVitals.objects")
@patch("core.views.fitbit_view.FitbitData.objects")
def test_health_combined_history_includes_minutes_asleep_and_wear_time(mock_fb_objects, mock_vitals_objects, mock_logs):
    """health-combined-history FitbitEntry contains minutes_asleep and wear_time_minutes."""
    _, _, _patient_user, patient = create_patient_graph()
    entry_dt = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    mock_logs.return_value.order_by.return_value = []
    mock_vitals_objects.return_value.order_by.return_value = []

    fake_fitbit = SimpleNamespace(
        date=entry_dt,
        steps=800,
        resting_heart_rate=None,
        max_heart_rate=None,
        floors=None,
        distance=None,
        calories=None,
        active_minutes=None,
        wear_time_minutes=650,
        sleep=SimpleNamespace(
            sleep_duration=25200000,
            minutes_asleep=390,
            sleep_start=None,
            sleep_end=None,
            awakenings=None,
        ),
        heart_rate_zones=[],
        breathing_rate=None,
        hrv=None,
        exercise={},
        weight_kg=None,
        bp_sys=None,
        bp_dia=None,
    )
    mock_fb_objects.return_value.order_by.return_value = [fake_fitbit]

    with patch(
        "core.views.fitbit_view.PatientICFRating",
        new=SimpleNamespace(objects=lambda *a, **k: SimpleNamespace(order_by=lambda *x, **y: [])),
        create=True,
    ):
        req = rf.get(f"/api/patients/health-combined-history/{patient.id}/")
        resp = health_combined_history(req, str(patient.id))

    assert resp.status_code == 200
    body = json.loads(resp.content)
    fitbit_rows = body["fitbit"]
    assert fitbit_rows, "Expected at least one FitbitEntry"
    row = fitbit_rows[0]
    assert row["wear_time_minutes"] == 650
    assert row["sleep"]["minutes_asleep"] == 390
    assert row["sleep"]["sleep_duration"] == 25200000


@patch("core.views.fitbit_view.PatientInterventionLogs.objects")
@patch("core.views.fitbit_view.PatientVitals.objects")
@patch("core.views.fitbit_view.FitbitData.objects")
def test_health_combined_history_wear_time_none_when_absent(mock_fb_objects, mock_vitals_objects, mock_logs):
    """wear_time_minutes is None in FitbitEntry when not recorded."""
    _, _, _patient_user, patient = create_patient_graph()
    entry_dt = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    mock_logs.return_value.order_by.return_value = []
    mock_vitals_objects.return_value.order_by.return_value = []

    fake_fitbit = SimpleNamespace(
        date=entry_dt,
        steps=300,
        resting_heart_rate=None,
        max_heart_rate=None,
        floors=None,
        distance=None,
        calories=None,
        active_minutes=None,
        wear_time_minutes=None,
        sleep=SimpleNamespace(
            sleep_duration=None,
            minutes_asleep=None,
            sleep_start=None,
            sleep_end=None,
            awakenings=None,
        ),
        heart_rate_zones=[],
        breathing_rate=None,
        hrv=None,
        exercise={},
        weight_kg=None,
        bp_sys=None,
        bp_dia=None,
    )
    mock_fb_objects.return_value.order_by.return_value = [fake_fitbit]

    with patch(
        "core.views.fitbit_view.PatientICFRating",
        new=SimpleNamespace(objects=lambda *a, **k: SimpleNamespace(order_by=lambda *x, **y: [])),
        create=True,
    ):
        req = rf.get(f"/api/patients/health-combined-history/{patient.id}/")
        resp = health_combined_history(req, str(patient.id))

    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["fitbit"], "Expected at least one FitbitEntry"
    row = body["fitbit"][0]
    assert row["wear_time_minutes"] is None
    assert row["sleep"]["minutes_asleep"] is None


@patch("core.views.fitbit_view.PatientInterventionLogs.objects")
@patch("core.views.fitbit_view.PatientVitals.objects")
@patch("core.views.fitbit_view.FitbitData.objects")
def test_health_combined_history_questionnaire_rows_include_comment_and_media_fields(
    mock_fb_objects, mock_vitals_objects, mock_logs
):
    _, _, _patient_user, patient = create_patient_graph()
    entry_dt = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    mock_logs.return_value.order_by.return_value = []
    mock_vitals_objects.return_value.order_by.return_value = []
    mock_fb_objects.return_value.order_by.return_value = []

    fake_entry = SimpleNamespace(
        questionId=SimpleNamespace(
            questionKey="16_profile_mood_1",
            translations=[SimpleNamespace(language="en", text="How is your mood today?")],
        ),
        answerKey=[
            SimpleNamespace(
                key="1",
                translations=[SimpleNamespace(language="en", text="Bad")],
            ),
            SimpleNamespace(
                key="3",
                translations=[SimpleNamespace(language="en", text="Good")],
            ),
        ],
        comment="Patient noted mild fatigue in afternoon.",
        audio_url="https://files.example/audio1.m4a",
    )
    fake_q = SimpleNamespace(
        date=entry_dt,
        icfCode="d450",
        feedback_entries=[fake_entry],
    )

    with patch(
        "core.views.fitbit_view.PatientICFRating",
        new=SimpleNamespace(objects=lambda *a, **k: SimpleNamespace(order_by=lambda *x, **y: [fake_q])),
        create=True,
    ):
        req = rf.get(f"/api/patients/health-combined-history/{patient.id}/")
        resp = health_combined_history(req, str(patient.id))

    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert len(body["questionnaire"]) == 1
    row = body["questionnaire"][0]
    assert row["questionKey"] == "16_profile_mood_1"
    assert row["answers"][0]["key"] == "1"
    assert row["answers"][1]["key"] == "3"
    assert row["comment"] == "Patient noted mild fatigue in afternoon."
    assert row["audio_url"] == "https://files.example/audio1.m4a"
    assert row["media_urls"] == ["https://files.example/audio1.m4a"]
