"""
Tests for _sleep_civil_date() — the timezone-aware sleep attribution helper.

Regression: the old `hour >= 18 UTC` heuristic pushed evening naps (e.g. 22:23 local CEST
= 20:23 UTC) to the NEXT calendar day. These tests verify the correct behaviour:
 - Evening naps stay on their local calendar day
 - Overnight sessions are attributed to the wakeup (end) date
 - Early-morning sessions stay on the same local calendar day
"""

import datetime

import pytest


# ---- helper ----------------------------------------------------------------

def _make_utc(year, month, day, hour, minute=0):
    return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00+00:00"


# ---- tests -----------------------------------------------------------------


def test_evening_nap_stays_on_same_day():
    """Nap at 22:23–23:03 CEST on Sep 21 (= 20:23–21:03 UTC) → civil date Sep 21."""
    from core.views.google_health_sync import _sleep_civil_date

    # CEST = UTC+2; 22:23 CEST = 20:23 UTC on same calendar date
    start = _make_utc(2026, 9, 21, 20, 23)
    end = _make_utc(2026, 9, 21, 21, 3)
    result = _sleep_civil_date(start, end)
    assert result == datetime.date(2026, 9, 21), (
        f"Evening nap should stay on Sep 21, got {result}"
    )


def test_overnight_sleep_attributed_to_wakeup_day():
    """Main sleep 23:35 Sep 21 – 08:22 Sep 22 CEST (= 21:35 Sep 21 – 06:22 Sep 22 UTC) → Sep 22."""
    from core.views.google_health_sync import _sleep_civil_date

    start = _make_utc(2026, 9, 21, 21, 35)  # 23:35 CEST
    end = _make_utc(2026, 9, 22, 6, 22)    # 08:22 CEST
    result = _sleep_civil_date(start, end)
    assert result == datetime.date(2026, 9, 22), (
        f"Overnight sleep should be on wakeup day Sep 22, got {result}"
    )


def test_early_morning_session_stays_on_same_day():
    """Short session 01:00–02:30 local CEST Sep 22 (= 23:00–00:30 UTC Sep 21/22) → Sep 22."""
    from core.views.google_health_sync import _sleep_civil_date

    # 01:00 CEST Sep 22 = 23:00 UTC Sep 21
    start = _make_utc(2026, 9, 21, 23, 0)
    # 02:30 CEST Sep 22 = 00:30 UTC Sep 22
    end = _make_utc(2026, 9, 22, 0, 30)
    result = _sleep_civil_date(start, end)
    # Both are on Sep 22 in local time (01:00 and 02:30 CEST)
    assert result == datetime.date(2026, 9, 22), (
        f"Early-morning session should be Sep 22, got {result}"
    )


def test_cet_winter_evening_nap_stays_on_same_day():
    """Nap at 22:30 local CET (= 21:30 UTC) on Dec 10 → civil date Dec 10."""
    from core.views.google_health_sync import _sleep_civil_date

    # CET = UTC+1; 22:30 CET = 21:30 UTC
    start = _make_utc(2026, 12, 10, 21, 30)
    end = _make_utc(2026, 12, 10, 22, 10)
    result = _sleep_civil_date(start, end)
    assert result == datetime.date(2026, 12, 10), (
        f"Winter nap should stay on Dec 10, got {result}"
    )


def test_missing_end_time_falls_back_to_start_date():
    """No endTime → civil date is the local start date."""
    from core.views.google_health_sync import _sleep_civil_date

    start = _make_utc(2026, 9, 21, 20, 23)  # 22:23 CEST Sep 21
    result = _sleep_civil_date(start, "")
    assert result == datetime.date(2026, 9, 21)


def test_invalid_start_returns_none():
    from core.views.google_health_sync import _sleep_civil_date

    assert _sleep_civil_date("not-a-date", "") is None


def test_prefetch_unfiltered_groups_nap_with_start_day(monkeypatch):
    """_prefetch_unfiltered must assign a Sep-21 evening nap to Sep 21, not Sep 22."""
    from core.views import google_health_sync as sync_mod

    nap_point = {
        "sleep": {
            "interval": {
                "startTime": _make_utc(2026, 9, 21, 20, 23),  # 22:23 CEST Sep 21
                "endTime": _make_utc(2026, 9, 21, 21, 3),     # 23:03 CEST Sep 21
            },
            "summary": {"minutesAsleep": "38"},
        }
    }
    main_sleep_point = {
        "sleep": {
            "interval": {
                "startTime": _make_utc(2026, 9, 21, 21, 35),  # 23:35 CEST Sep 21
                "endTime": _make_utc(2026, 9, 22, 6, 22),     # 08:22 CEST Sep 22
            },
            "summary": {"minutesAsleep": "391"},
        }
    }

    def fake_list_points(token, dtype, filter_expr=""):
        if dtype == "sleep":
            return [nap_point, main_sleep_point]
        return []

    monkeypatch.setattr(sync_mod, "_list_points", fake_list_points)

    result = sync_mod._prefetch_unfiltered("fake-token")
    sleep_map = result["sleep"]

    sep_21 = datetime.date(2026, 9, 21)
    sep_22 = datetime.date(2026, 9, 22)

    assert sep_21 in sleep_map, "Nap should be in Sep 21's bucket"
    assert sep_22 in sleep_map, "Overnight sleep should be in Sep 22's bucket"
    assert nap_point in sleep_map[sep_21]
    assert main_sleep_point in sleep_map[sep_22]
    # Nap must NOT bleed into Sep 22
    assert nap_point not in sleep_map.get(sep_22, [])
