import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    FeedbackQuestion,
    HealthQuestionnaire,
    Patient,
    RehabilitationPlan,
    Therapist,
    User,
)
from core.views.questionaires_view import (
    _expand_dates,
    _get_patient_by_any_id,
    _get_therapist_by_any,
    _get_user_by_any,
    _infer_frequency_from_dates,
    _is_oid,
    _render_frequency,
)

client = Client()


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


def make_patient_graph():
    tu = User(
        username=f"th-{ObjectId()}",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=tu, clinics=["Inselspital"]).save()
    pu = User(
        username=f"pt-{ObjectId()}",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    p = Patient(userId=pu, therapist=th, patient_code=f"P-{ObjectId()}").save()
    return th, p


def make_feedback_question(key):
    return FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey=key,
        answer_type="text",
        translations=[],
        possibleAnswers=[],
    ).save()


def test_list_health_questionnaires_method_not_allowed():
    r = client.put("/api/questionnaires/health/", HTTP_AUTHORIZATION="Bearer test")
    assert r.status_code == 405


def test_list_health_questionnaires_success():
    HealthQuestionnaire(key=f"k-{ObjectId()}", title="Q1", questions=[]).save()
    r = client.get("/api/questionnaires/health/", HTTP_AUTHORIZATION="Bearer test")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 1


def test_list_dynamic_questionnaires_groups_keys():
    make_feedback_question(f"16_profile_{ObjectId()}")
    make_feedback_question(f"16_profile_{ObjectId()}")
    make_feedback_question(f"12_sleep_{ObjectId()}")

    r = client.get(
        "/api/questionnaires/dynamic/?subject=Healthstatus",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r.status_code == 200
    out = r.json()
    assert any(g["id"] == "16_profile" and g["count"] == 2 for g in out)
    assert any(g["id"] == "12_sleep" and g["count"] == 1 for g in out)


def test_helper_frequency_and_oid_paths():
    assert _render_frequency({"unit": "day", "interval": 1}) == "Every day"
    assert _render_frequency({"unit": "week", "interval": 2, "selectedDays": ["Mon"]}) == "Every 2 weeks on Mon"
    assert _render_frequency({"unit": "month", "interval": 1}) == "Monthly"
    assert _render_frequency({"unit": "unknown"}) == ""
    assert _render_frequency({}) == ""

    assert _is_oid(str(ObjectId())) is True
    assert _is_oid("not-an-oid") is False


def test_helper_infer_frequency_from_dates_and_fallback():
    d0 = datetime(2026, 1, 1)
    assert _infer_frequency_from_dates([d0, datetime(2026, 1, 2)]) == "Every day"
    assert _infer_frequency_from_dates([d0, datetime(2026, 1, 8)]) == "Weekly"
    assert _infer_frequency_from_dates([d0, datetime(2026, 1, 31)]) == "Monthly"
    assert _infer_frequency_from_dates(["bad"]) == "Scheduled"


def test_helper_expand_dates_day_week_month_and_fallback():
    by_day = _expand_dates(
        start_date="2026-01-01",
        unit="day",
        interval=2,
        end={"type": "count", "count": 2},
    )
    assert len(by_day) == 2
    assert by_day[1].day == 3

    by_week = _expand_dates(
        start_date="2026-01-01",
        unit="week",
        interval=1,
        selected_days=["Mon", "Wed"],
        end={"type": "count", "count": 2},
    )
    assert len(by_week) == 2

    by_month = _expand_dates(
        start_date="2026-01-31",
        unit="month",
        interval=1,
        end={"type": "count", "count": 2},
    )
    assert len(by_month) == 2
    assert by_month[1].month == 2

    fallback = _expand_dates(
        start_date="2026-01-01",
        unit="weird",
        interval=1,
        end={"type": "count", "count": 1},
    )
    assert len(fallback) == 1


def test_helper_user_patient_therapist_resolvers():
    th, p = make_patient_graph()
    u = p.userId
    assert _get_user_by_any(str(u.id)).id == u.id
    assert _get_user_by_any(u.username).id == u.id

    with pytest.raises(User.DoesNotExist):
        _get_user_by_any(None)

    assert _get_patient_by_any_id(str(p.id)).id == p.id
    assert _get_patient_by_any_id(str(u.id)).id == p.id

    with pytest.raises(Patient.DoesNotExist):
        _get_patient_by_any_id("bad")

    assert _get_therapist_by_any(str(th.id)).id == th.id
    assert _get_therapist_by_any(str(th.userId.id)).id == th.id
    assert _get_therapist_by_any(th.userId.username).id == th.id


def test_list_patient_questionnaires_patient_not_found():
    r = client.get(f"/api/questionnaires/patient/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test")
    assert r.status_code == 404


def test_list_patient_questionnaires_empty_when_no_plan():
    _, p = make_patient_graph()
    r = client.get(f"/api/questionnaires/patient/{p.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert r.status_code == 200
    assert r.json() == []


def test_assign_questionnaire_missing_fields():
    r = client.post(
        "/api/questionnaires/assign/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r.status_code == 400


def test_assign_questionnaire_patient_not_found():
    r = client.post(
        "/api/questionnaires/assign/",
        data=json.dumps({"patientId": str(ObjectId()), "questionnaireKey": "16_profile"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r.status_code == 404


def test_assign_questionnaire_from_group_key_success_and_listed():
    th, p = make_patient_graph()
    make_feedback_question(f"16_profile_{ObjectId()}")

    r = client.post(
        "/api/questionnaires/assign/",
        data=json.dumps(
            {
                "patientId": str(p.id),
                "therapistId": str(th.id),
                "questionnaireKey": "16_profile",
                "schedule": {
                    "unit": "week",
                    "interval": 1,
                    "selectedDays": ["Mon"],
                    "end": {"type": "count", "count": 2},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r.status_code == 200

    r2 = client.get(f"/api/questionnaires/patient/{p.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert "title" in r2.json()[0]


def test_remove_questionnaire_validation_and_success():
    th, p = make_patient_graph()
    q = HealthQuestionnaire(key=f"k-{ObjectId()}", title="T", questions=[]).save()
    plan = RehabilitationPlan(
        patientId=p,
        therapistId=th,
        startDate=datetime.now(),
        endDate=datetime.now(),
        status="active",
        questionnaires=[],
    ).save()

    r_bad = client.post(
        "/api/questionnaires/remove/",
        data=json.dumps({"patientId": str(p.id), "questionnaireId": "bad"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r_bad.status_code == 400

    # add assignment then remove
    client.post(
        "/api/questionnaires/assign/",
        data=json.dumps(
            {
                "patientId": str(p.id),
                "therapistId": str(th.id),
                "questionnaireId": str(q.id),
                "schedule": {
                    "unit": "day",
                    "interval": 1,
                    "end": {"type": "count", "count": 1},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    r_ok = client.post(
        "/api/questionnaires/remove/",
        data=json.dumps({"patientId": str(p.id), "questionnaireId": str(q.id)}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["message"] == "removed"


def test_assign_questionnaire_monthly_schedule_renders_frequency_and_dates():
    th, p = make_patient_graph()
    make_feedback_question(f"16_profile_{ObjectId()}")

    r = client.post(
        "/api/questionnaires/assign/",
        data=json.dumps(
            {
                "patientId": str(p.id),
                "therapistId": str(th.id),
                "questionnaireKey": "16_profile",
                "effectiveFrom": "2026-02-01",
                "schedule": {
                    "unit": "month",
                    "interval": 1,
                    "startTime": "09:30",
                    "end": {"type": "count", "count": 2},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert r.status_code == 200

    r2 = client.get(f"/api/questionnaires/patient/{p.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert r2.status_code == 200
    out = r2.json()
    assert len(out) == 1
    assert out[0]["frequency"] == "Monthly"
    assert len(out[0]["dates"]) == 2
    assert out[0]["dates"][0].startswith("2026-02-01T")
    assert out[0]["dates"][1].startswith("2026-03-01T")


def test_assign_questionnaire_modify_merges_dates_from_effective_from():
    th, p = make_patient_graph()
    make_feedback_question(f"16_profile_{ObjectId()}")

    first = client.post(
        "/api/questionnaires/assign/",
        data=json.dumps(
            {
                "patientId": str(p.id),
                "therapistId": str(th.id),
                "questionnaireKey": "16_profile",
                "effectiveFrom": "2026-01-01",
                "schedule": {
                    "unit": "day",
                    "interval": 1,
                    "startTime": "08:00",
                    "end": {"type": "count", "count": 2},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert first.status_code == 200

    second = client.post(
        "/api/questionnaires/assign/",
        data=json.dumps(
            {
                "patientId": str(p.id),
                "therapistId": str(th.id),
                "questionnaireKey": "16_profile",
                "effectiveFrom": "2026-01-02",
                "schedule": {
                    "unit": "day",
                    "interval": 1,
                    "startTime": "08:00",
                    "end": {"type": "count", "count": 2},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert second.status_code == 200

    r = client.get(f"/api/questionnaires/patient/{p.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert r.status_code == 200
    out = r.json()
    assert len(out) == 1
    assert out[0]["frequency"] == "Every day"
    assert len(out[0]["dates"]) == 3
    assert out[0]["dates"][0].startswith("2026-01-01T")
    assert out[0]["dates"][1].startswith("2026-01-02T")
    assert out[0]["dates"][2].startswith("2026-01-03T")
