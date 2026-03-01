import datetime as dt
from types import SimpleNamespace

from bson import ObjectId
from django.utils import timezone

from core.views.patient_views import (
    _abs_media_url,
    _advance_month,
    _as_aware_local,
    _as_aware_utc,
    _as_datetime,
    _as_list,
    _as_str,
    _ceil_to_day,
    _coerce_object_id,
    _completion_day_keys_from_logs,
    _generate_dates_from,
    _has_bp,
    _has_weight,
    _merge_dates,
    _normalize_dates_list,
    _normalize_intervention_id,
    _parse_date_forgiving,
    _parse_iso,
    _parse_iso_maybe,
    _serialize_feedback_entry,
    _serialize_media_list,
    _status_for,
    _strip_to_datetimes,
    _to_iso,
)


def test_patient_helpers_base_types_and_ids():
    oid = ObjectId()
    assert _as_str("x") == "x"
    assert _as_str(1, "d") == "d"
    assert _as_list([1]) == [1]
    assert _as_list("x") == []
    assert _normalize_intervention_id({"_id": str(oid)}) == str(oid)
    assert _normalize_intervention_id("bad") is None
    assert _coerce_object_id(str(oid)) == oid
    assert _coerce_object_id("bad") is None


def test_patient_helpers_datetime_status_and_merge():
    future_iso = (timezone.now() + dt.timedelta(days=2)).isoformat()
    past_iso = (timezone.now() - dt.timedelta(days=2)).isoformat()
    assert _status_for(future_iso) == "upcoming"
    assert _status_for(past_iso) == "missed"

    now = timezone.now()
    assert _to_iso(now) is not None
    assert _parse_iso_maybe("2026-01-01T10:00:00Z") is not None
    assert _parse_iso_maybe("bad") is None

    d1 = _as_datetime("2026-01-01T10:00:00Z")
    d2 = _as_datetime(dt.date(2026, 1, 2))
    assert d1.tzinfo is not None and d2.tzinfo is not None

    stripped = _strip_to_datetimes(["2026-01-01T10:00:00Z", "bad"])
    assert len(stripped) == 1

    merged, added = _merge_dates(
        ["2026-01-01T10:00:00Z"],
        ["2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z"],
    )
    assert added == 1
    assert len(merged) == 2

    out = _normalize_dates_list(
        [
            {"datetime": "2026-01-01T10:00:00Z"},
            "2026-01-03T10:00:00Z",
            dt.datetime(2026, 1, 2, 10, 0),
        ]
    )
    assert len(out) == 3


def test_patient_helpers_media_feedback_logs_and_parsers(monkeypatch):
    from django.conf import settings

    monkeypatch.setattr(settings, "MEDIA_HOST", "https://cdn.example.com", raising=False)
    monkeypatch.setattr(settings, "MEDIA_URL", "/media/", raising=False)
    assert _abs_media_url("x/y.jpg").startswith("https://cdn.example.com/")
    assert _abs_media_url("https://already.example.com/a") == "https://already.example.com/a"

    intervention = SimpleNamespace(
        title="I1",
        media=[
            {"kind": "external", "media_type": "website", "url": "https://example.com"},
            {
                "kind": "file",
                "media_type": "video",
                "file_path": "videos/a.mp4",
                "thumbnail": "thumbs/t.png",
            },
        ],
    )
    rows = _serialize_media_list(intervention)
    assert len(rows) == 2
    assert rows[0]["url"] == "https://example.com"

    q = SimpleNamespace(
        id=ObjectId(),
        translations=[SimpleNamespace(language="en", text="Q1")],
    )
    fb = SimpleNamespace(
        questionId=q,
        answerKey=["yes"],
        comment="ok",
        audio_url="a.webm",
        date=timezone.now(),
    )
    sfb = _serialize_feedback_entry(fb)
    assert sfb is not None
    assert sfb["question"]["translations"][0]["text"] == "Q1"

    logs = [
        SimpleNamespace(date=dt.datetime(2026, 1, 1, 10, 0), status=["completed"]),
        SimpleNamespace(date=timezone.now(), status="completed"),
        SimpleNamespace(date=timezone.now(), status="skipped"),
    ]
    keys = _completion_day_keys_from_logs(logs)
    assert len(keys) >= 2

    assert _has_weight(SimpleNamespace(weight_kg=70.0)) is True
    assert _has_weight(SimpleNamespace(weight={"kg": 70.0})) is True
    assert _has_bp(SimpleNamespace(bp_sys=120, bp_dia=80)) is True
    assert _has_bp(SimpleNamespace(blood_pressure=SimpleNamespace(systolic=120, diastolic=80))) is True

    assert _parse_date_forgiving("2026-01-02T10:00:00Z").isoformat() == "2026-01-02"
    assert _parse_date_forgiving("2026/1/3").isoformat() == "2026-01-03"
    assert _parse_date_forgiving("bad") is None


def test_patient_schedule_generation_helpers_day_week_month():
    d = dt.datetime(2026, 1, 15, 12, 10)
    assert _ceil_to_day(d).hour == 0
    assert _advance_month(dt.datetime(2026, 1, 31, 8, 0), 1).month == 2

    aware_local = _as_aware_local(dt.datetime(2026, 1, 1, 9, 0))
    aware_utc = _as_aware_utc(dt.datetime(2026, 1, 1, 9, 0))
    assert aware_local.tzinfo is not None
    assert aware_utc.tzinfo is not None
    assert _parse_iso("2026-01-01").tzinfo is not None
    assert _parse_iso("2026-01-01T10:00:00Z").tzinfo is not None

    effective = dt.datetime(2026, 1, 1, 0, 0, tzinfo=dt.timezone.utc)
    plan_end = dt.datetime(2026, 3, 1, 0, 0, tzinfo=dt.timezone.utc)

    day_out = _generate_dates_from(
        {
            "unit": "day",
            "interval": 2,
            "startDate": "2026-01-01",
            "startTime": "08:00",
            "end": {"type": "count", "count": 2},
        },
        effective,
        plan_end,
    )
    assert len(day_out) == 2

    week_out = _generate_dates_from(
        {
            "unit": "week",
            "interval": 1,
            "startDate": "2026-01-01",
            "startTime": "08:00",
            "selectedDays": ["Mon"],
            "end": {"type": "count", "count": 2},
        },
        effective,
        plan_end,
    )
    assert len(week_out) == 2

    month_out = _generate_dates_from(
        {
            "unit": "month",
            "interval": 1,
            "startDate": "2026-01-01",
            "startTime": "08:00",
            "end": {"type": "count", "count": 2},
        },
        effective,
        plan_end,
    )
    assert len(month_out) == 2
