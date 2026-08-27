"""
Tests for the due-intervention push notification Celery task
==============================================================

Covers:
- core.tasks.send_due_intervention_push_notifications
- core.notifications.categorize.resolve_notification_category
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.utils import timezone

from core.models import (
    Intervention,
    InterventionAssignment,
    Patient,
    PushSubscription,
    RehabilitationPlan,
    SentPushNotification,
    Therapist,
    User,
)
from core.notifications.categorize import resolve_notification_category
from core.tasks import send_due_intervention_push_notifications


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


def _current_window():
    """Mirrors send_due_intervention_push_notifications' own window math."""
    window_end = timezone.now().replace(minute=0, second=0, microsecond=0)
    window_start = window_end - timedelta(hours=1)
    return window_start, window_end


def _due_within_window():
    """A datetime guaranteed to fall inside the current hourly window,
    regardless of what minute it actually is when the test runs."""
    _, window_end = _current_window()
    return window_end - timedelta(minutes=30)


def _due_before_window():
    """A datetime guaranteed to fall before the current hourly window."""
    window_start, _ = _current_window()
    return window_start - timedelta(hours=1)


def create_patient_with_plan(aim: str, due_at: datetime | None = None, preferences=None):
    """
    preferences=None enables just the category resolved from `aim` (the
    default is False/opt-in — see PatientNotificationPreferences), so tests
    that aren't specifically about preference gating don't need to spell it
    out. Pass an explicit dict to override (e.g. to test the disabled case).
    """
    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, name="Therapist", first_name="A", clinics=["Inselspital"]).save()

    p_user = User(
        username=f"pt-{ObjectId()}",
        email="pt@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=p_user,
        patient_code=f"PAT-{ObjectId()}",
        therapist=th,
    )
    if preferences is None:
        preferences = {resolve_notification_category(aim): True}
    for field, value in preferences.items():
        setattr(patient.notification_preferences, field, value)
    patient.save()

    intervention = Intervention(
        external_id=f"ext-{ObjectId()}",
        language="en",
        title="Test intervention",
        description="desc",
        content_type="video",
        aim=aim,
    ).save()

    if due_at is None:
        due_at = _due_within_window()
    assignment = InterventionAssignment(interventionId=intervention, frequency="Daily", dates=[due_at])
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=th,
        startDate=timezone.now() - timedelta(days=1),
        endDate=timezone.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    ).save()

    return patient, plan, intervention, due_at


def add_subscription(patient):
    return PushSubscription(
        patient=patient,
        endpoint=f"https://push.example.com/{ObjectId()}",
        keys_p256dh="p-key",
        keys_auth="a-key",
    ).save()


# ---------------------------------------------------------------------------
# resolve_notification_category
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "aim,expected",
    [
        ("Education", "education"),
        ("Exercise", "exercise"),
        ("Instructions", "instructions"),
        ("Reminder", "reminder"),
        ("Behavior change", "behavior_change"),
        ("Experience", "other"),
        ("Something Unrecognized", "other"),
        (None, "other"),
        ("", "other"),
    ],
)
def test_resolve_notification_category(aim, expected):
    assert resolve_notification_category(aim) == expected


# ---------------------------------------------------------------------------
# send_due_intervention_push_notifications
# ---------------------------------------------------------------------------


def test_sends_push_for_due_enabled_category():
    patient, plan, intervention, due_at = create_patient_with_plan("Education")
    add_subscription(patient)

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 1
    mocked_webpush.assert_called_once()
    assert SentPushNotification.objects(patient=patient, category="education").count() == 1


def test_skips_when_category_disabled():
    patient, plan, intervention, due_at = create_patient_with_plan("Exercise", preferences={"exercise": False})
    add_subscription(patient)

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 0
    assert result["skipped"] == 1
    mocked_webpush.assert_not_called()
    assert SentPushNotification.objects(patient=patient).count() == 0


def test_skips_dates_outside_window():
    patient, plan, intervention, due_at = create_patient_with_plan("Education", due_at=_due_before_window())
    add_subscription(patient)

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 0
    mocked_webpush.assert_not_called()


def test_does_not_double_send_on_repeat_run():
    patient, plan, intervention, due_at = create_patient_with_plan("Education")
    add_subscription(patient)

    with patch("pywebpush.webpush") as mocked_webpush:
        first = send_due_intervention_push_notifications()
        second = send_due_intervention_push_notifications()

    assert first["sent"] == 1
    assert second["sent"] == 0
    assert second["duplicate"] == 1
    assert mocked_webpush.call_count == 1
    assert SentPushNotification.objects(patient=patient).count() == 1


def test_unmapped_aim_falls_back_to_other_bucket():
    patient, plan, intervention, due_at = create_patient_with_plan("Experience")
    add_subscription(patient)

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 1
    assert SentPushNotification.objects(patient=patient, category="other").count() == 1


def test_no_subscription_still_records_sent_and_skips_webpush_call():
    patient, plan, intervention, due_at = create_patient_with_plan("Education")
    # No PushSubscription created for this patient.

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 1
    mocked_webpush.assert_not_called()
    assert SentPushNotification.objects(patient=patient).count() == 1


def test_notify_if_due_fails_closed_when_preferences_missing():
    """
    Regression: notification_preferences being None (bypassing the model
    default) must be treated as "not enabled", not "enabled" — opt-in means
    missing/unexpected data fails closed, never sends unconsented pushes.
    """
    patient, plan, intervention, due_at = create_patient_with_plan("Education")
    patient.notification_preferences = None
    patient.save()
    add_subscription(patient)

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 0
    assert result["skipped"] == 1
    mocked_webpush.assert_not_called()


def test_generic_exception_on_one_subscription_still_tries_the_others():
    """
    Regression: a non-WebPushException error (e.g. a network-level error
    from pywebpush's underlying requests call) sending to one of a patient's
    subscriptions must not stop the remaining subscriptions from being tried.
    """
    patient, plan, intervention, due_at = create_patient_with_plan("Education")
    add_subscription(patient)
    add_subscription(patient)  # second device/browser

    with patch("pywebpush.webpush", side_effect=[RuntimeError("boom"), None]) as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["sent"] == 1
    assert mocked_webpush.call_count == 2


def test_generic_exception_for_one_patient_does_not_abort_others_in_the_batch():
    """
    Regression: an unhandled exception while sending to one patient must not
    abort the whole task run — other patients due in the same window still
    get processed.
    """
    patient_a, _, _, _ = create_patient_with_plan("Education")
    add_subscription(patient_a)
    patient_b, _, _, _ = create_patient_with_plan("Education")
    add_subscription(patient_b)

    with patch("pywebpush.webpush", side_effect=[ConnectionError("boom"), None]) as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert mocked_webpush.call_count == 2
    # Both dedup records get created regardless of the send outcome for either.
    assert result["sent"] == 2
    assert SentPushNotification.objects(patient=patient_a).count() == 1
    assert SentPushNotification.objects(patient=patient_b).count() == 1


def test_deleted_intervention_is_skipped_without_aborting_the_run():
    """
    Regression: _notify_if_due dereferenced assignment.interventionId directly, and a deleted
    Intervention raises DoesNotExist on dereference rather than returning None. One patient whose
    plan still referenced a removed intervention therefore took down the whole hourly run, so every
    other patient due in that window silently got no notification.
    """
    patient_a, plan_a, doomed, _ = create_patient_with_plan("Education")
    add_subscription(patient_a)
    patient_b, _, _, _ = create_patient_with_plan("Education")
    add_subscription(patient_b)

    doomed.delete()

    with patch("pywebpush.webpush") as mocked_webpush:
        result = send_due_intervention_push_notifications()

    assert result["skipped"] == 1, "The dangling assignment should be skipped, not raise."
    assert result["sent"] == 1
    assert SentPushNotification.objects(patient=patient_b).count() == 1
    assert SentPushNotification.objects(patient=patient_a).count() == 0
    assert mocked_webpush.call_count == 1
