import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from django.http import QueryDict
from django.test import RequestFactory
from django.utils import timezone

from core.views.auth_views import (
    _as_list_of_blocks,
    _err,
    _make_count,
    _norm_email,
    _parse_body,
    _safe_get,
    create_rehab_plan,
    generate_code,
    generate_random_password,
    make_aware,
    send_sms,
)

rf = RequestFactory()


def test_auth_helper_list_and_safe_get():
    assert _as_list_of_blocks(None) == []
    assert _as_list_of_blocks([1, 2]) == [1, 2]
    assert _as_list_of_blocks("x") == ["x"]

    obj = SimpleNamespace(a=10)
    assert _safe_get(obj, "a") == 10
    assert _safe_get({"a": 20}, "a") == 20
    assert _safe_get({}, "missing", "d") == "d"


def test_auth_helper_make_count_variants():
    assert _make_count("day", 2, [], 1, 5) == 3
    assert _make_count("week", 1, ["Mon", "Wed"], 1, 14) >= 2
    assert _make_count("month", 1, [], 1, 62) >= 2
    assert _make_count("week", 1, [], None, None, fallback=9) == 9


def test_auth_helper_make_aware_and_email_and_err():
    naive = datetime(2026, 1, 1, 10, 0)
    aware = timezone.now()
    assert timezone.is_aware(make_aware(naive))
    assert make_aware(aware) == aware

    assert _norm_email("  A@EXAMPLE.COM  ") == "a@example.com"
    r = _err("bad", status=422, field_errors={"email": ["x"]})
    payload = json.loads(r.content)
    assert r.status_code == 422
    assert payload["success"] is False
    assert "field_errors" in payload


def test_auth_helper_parse_body_json_form_and_invalid():
    req_json = rf.post("/api/auth/login/", data=json.dumps({"a": 1}), content_type="application/json")
    assert _parse_body(req_json)["a"] == 1

    req_form = rf.post("/api/auth/login/", data={"x": "y"})
    assert _parse_body(req_form)["x"] == "y"

    req_bad = rf.post("/api/auth/login/", data="{bad", content_type="application/json")
    req_bad.POST = QueryDict("", mutable=False)
    assert _parse_body(req_bad) == {}


def test_auth_helper_password_and_code_generation():
    pw = generate_random_password(16)
    assert isinstance(pw, str)
    assert len(pw) == 16

    code = generate_code(6)
    assert code.isdigit()
    assert len(code) == 6


@patch("core.views.auth_views.Client")
def test_send_sms_calls_twilio_client(mock_client):
    send_sms("+15550001111", "hello")
    mock_client.assert_called_once()
    mock_client.return_value.messages.create.assert_called_once()


def test_create_rehab_plan_creates_new_assignment_with_mocked_plan(monkeypatch):
    intervention = SimpleNamespace(id="i1")
    block = SimpleNamespace(
        active=True,
        unit="day",
        interval=1,
        selected_days=[],
        start_day=1,
        end_day=3,
        start_time="08:00",
        count_limit=2,
    )
    rec = SimpleNamespace(recommendation=intervention, diagnosis_assignments={"DX": [block]})
    patient = SimpleNamespace(
        userId=SimpleNamespace(createdAt=timezone.now()),
        diagnosis=["DX"],
        reha_end_date=timezone.now(),
        study_end_date=None,
    )
    therapist = SimpleNamespace(default_recommendations=[rec])

    class FakePlanModel:
        def __init__(self, **kwargs):
            self.patientId = kwargs.get("patientId")
            self.therapistId = kwargs.get("therapistId")
            self.interventions = kwargs.get("interventions", [])
            self.updatedAt = None

        def save(self):
            return None

        @staticmethod
        def objects(**kwargs):
            return SimpleNamespace(first=lambda: None)

    monkeypatch.setattr(
        "core.views.auth_views._expand_dates",
        lambda **_: [datetime(2026, 1, 1, 8, 0), datetime(2026, 1, 2, 8, 0)],
    )
    monkeypatch.setattr("core.views.auth_views.RehabilitationPlan", FakePlanModel)
    monkeypatch.setattr(
        "core.views.auth_views.InterventionAssignment",
        lambda **kw: SimpleNamespace(**kw),
    )

    assert create_rehab_plan(patient, therapist) is True


def test_create_rehab_plan_merges_existing_and_handles_exception(monkeypatch):
    intervention = SimpleNamespace(id="i1")
    existing_ia = SimpleNamespace(interventionId=intervention, dates=[datetime(2026, 1, 1, 8, 0)])
    existing_plan = SimpleNamespace(interventions=[existing_ia], updatedAt=None, save=lambda: None)

    class FakeQuery:
        def first(self):
            return existing_plan

    class FakePlanModel:
        @staticmethod
        def objects(**kwargs):
            return FakeQuery()

    block = {
        "active": True,
        "unit": "day",
        "interval": 1,
        "selected_days": [],
        "start_day": 1,
        "end_day": 2,
        "start_time": "08:00",
    }
    rec = SimpleNamespace(recommendation=intervention, diagnosis_assignments={"DX": [block]})
    patient = SimpleNamespace(
        userId=SimpleNamespace(createdAt=timezone.now()),
        diagnosis=["DX"],
        reha_end_date=timezone.now(),
        study_end_date=None,
    )
    therapist = SimpleNamespace(default_recommendations=[rec])

    monkeypatch.setattr(
        "core.views.auth_views._expand_dates",
        lambda **_: [datetime(2026, 1, 1, 8, 0), datetime(2026, 1, 2, 8, 0)],
    )
    monkeypatch.setattr("core.views.auth_views.RehabilitationPlan", FakePlanModel)
    monkeypatch.setattr(
        "core.views.auth_views.InterventionAssignment",
        lambda **kw: SimpleNamespace(**kw),
    )
    assert create_rehab_plan(patient, therapist) is True
    assert len(existing_ia.dates) >= 2

    # crash branch -> False
    def broken_expand(**kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("core.views.auth_views._expand_dates", broken_expand)
    assert create_rehab_plan(patient, therapist) is False
