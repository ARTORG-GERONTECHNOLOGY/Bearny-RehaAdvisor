import json
import logging
import re
import calendar
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta,date, time
from bson import ObjectId
from bson.errors import InvalidId
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

_WEEKDAY_IDX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}



def _to_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _merge_date_and_time(date_dt: datetime, hhmm: Optional[str]) -> datetime:
    hh, mm = (hhmm or "08:00").split(":")[:2]
    merged = datetime(date_dt.year, date_dt.month, date_dt.day, int(hh), int(mm), 0, 0)
    return _to_aware(merged)

def _parse_yyyy_mm_dd(value, *, default_tz=None) -> datetime:
    """
    Parse 'YYYY-MM-DD' (or ISO-like) / date / datetime into a timezone-aware
    datetime at 00:00 local time. Falls back to now() if parsing fails.
    """
    tz = default_tz or timezone.get_current_timezone()

    if isinstance(value, datetime):
        return value if timezone.is_aware(value) else timezone.make_aware(value, tz)

    if isinstance(value, date):
        dt = datetime.combine(value, dtime.min)
        return timezone.make_aware(dt, tz)

    if not value:
        return timezone.now()

    s = str(value).strip()

    # Try strict YYYY-MM-DD first
    try:
        dt = datetime.strptime(s[:10], "%Y-%m-%d")
        return timezone.make_aware(dt, tz)
    except Exception:
        pass

    # Fallback: ISO 8601 (support trailing Z)
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        return dt if timezone.is_aware(dt) else timezone.make_aware(dt, tz)
    except Exception:
        return timezone.now()
def _expand_dates(
    *,
    start_date: str | datetime,
    start_time: Optional[str] = "08:00",
    unit: str = "week",                 # 'day' | 'week' | 'month'
    interval: int = 1,
    selected_days: Optional[List[str]] = None,  # for 'week'
    end: Optional[Dict[str, Any]] = None,       # {'type':'never'|'date'|'count', ...}
    max_occurrences: int = 365
) -> List[datetime]:
    end = end or {"type": "never", "date": None, "count": None}
    interval = max(1, int(interval or 1))

    if isinstance(start_date, datetime):
        base_date_naive = datetime(start_date.year, start_date.month, start_date.day)
    else:
        parsed = _parse_yyyy_mm_dd(start_date)
        if not parsed:
            raise ValueError("start_date must be 'YYYY-MM-DD' or a datetime")
        base_date_naive = parsed
    current = _merge_date_and_time(base_date_naive, start_time)

    end_type = (end.get("type") or "never").lower()
    end_date_dt = _parse_yyyy_mm_dd(end.get("date")) if end_type == "date" else None
    end_date_aware = _merge_date_and_time(end_date_dt, start_time) if end_date_dt else None
    count_limit = int(end.get("count") or 0) if end_type == "count" else 0

    out: List[datetime] = []

    if unit == "day":
        while True:
            out.append(current)
            if end_type == "count" and len(out) >= count_limit: break
            if end_type == "date" and end_date_aware and current >= end_date_aware: break
            if len(out) >= max_occurrences: break
            current = current + timedelta(days=interval)
        return out

    if unit == "week":
        sel = sorted({_WEEKDAY_IDX[d] for d in (selected_days or []) if d in _WEEKDAY_IDX})
        if not sel:
            sel = [current.weekday()]
        week_monday = current - timedelta(days=current.weekday())
        weeks_added = 0
        while True:
            this_week_start = week_monday + timedelta(weeks=weeks_added * interval)
            for wd in sel:
                dt = this_week_start + timedelta(days=wd)
                dt = dt.replace(hour=current.hour, minute=current.minute, second=0, microsecond=0, tzinfo=current.tzinfo)
                if dt < current:
                    continue
                out.append(dt)
                if end_type == "count" and len(out) >= count_limit: return sorted(out)[:count_limit]
                if end_type == "date" and end_date_aware and dt >= end_date_aware: return sorted([d for d in out if d <= end_date_aware])
                if len(out) >= max_occurrences: return sorted(out)[:max_occurrences]
            weeks_added += 1

    if unit == "month":
        while True:
            out.append(current)
            if end_type == "count" and len(out) >= count_limit: break
            if end_type == "date" and end_date_aware and current >= end_date_aware: break
            if len(out) >= max_occurrences: break
            current = _add_months(current, interval)
        return out

    # Fallback: weekly on start weekday
    return _expand_dates(
        start_date=start_date, start_time=start_time, unit="week",
        interval=interval, selected_days=[["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][current.weekday()]],
        end=end, max_occurrences=max_occurrences
    )
