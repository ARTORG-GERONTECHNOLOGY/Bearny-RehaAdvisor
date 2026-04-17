import json
from datetime import datetime

import mongomock
import pytest
from django.test import Client

from core.models import HealthQuestionnaire, Therapist, User

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


def make_therapist_with_user(username: str = "ther_builder"):
    user = User(
        username=username,
        email=f"{username}@example.org",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=user,
        name="Builder",
        first_name="Tina",
        clinics=["Inselspital"],
    ).save()
    return user, therapist


def test_create_custom_questionnaire_success_and_creator_shown_in_list():
    user, therapist = make_therapist_with_user()

    payload = {
        "title": "Custom Adherence Survey",
        "description": "Shared custom questionnaire",
        "subject": "Healthstatus",
        "therapistId": str(user.id),
        "questions": [
            {
                "text": "How are you today?",
                "type": "open-answer",
                "options": [],
            },
            {
                "text": "How difficult was today?",
                "type": "one-choice",
                "options": ["Easy", "Medium", "Hard"],
            },
            {
                "text": "Which symptoms do you have?",
                "type": "multiple-choice",
                "options": ["Pain", "Fatigue", "Sleep"],
            },
        ],
    }

    resp = client.post(
        "/api/questionnaires/health/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Custom Adherence Survey"
    assert body["created_by"] == str(user.id)
    assert body["created_by_name"] == "Tina Builder"
    assert body["question_count"] == 3

    hq = HealthQuestionnaire.objects.get(key=body["key"])
    assert hq.created_by is not None
    assert str(hq.created_by.id) == str(therapist.id)
    assert len(hq.questions or []) == 3

    # list endpoint should include creator metadata too
    listed = client.get("/api/questionnaires/health/", HTTP_AUTHORIZATION="Bearer test")
    assert listed.status_code == 200
    arr = listed.json()
    entry = next((x for x in arr if x["_id"] == body["_id"]), None)
    assert entry is not None
    assert entry["created_by"] == str(user.id)
    assert entry["created_by_name"] == "Tina Builder"


def test_create_custom_questionnaire_rejects_invalid_choice_options():
    user, _ = make_therapist_with_user("ther_invalid")
    payload = {
        "title": "Invalid Questionnaire",
        "therapistId": str(user.id),
        "questions": [
            {
                "text": "Pick one",
                "type": "one-choice",
                "options": ["OnlyOne"],
            }
        ],
    }

    resp = client.post(
        "/api/questionnaires/health/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "at least two non-empty options" in resp.json().get("error", "")
