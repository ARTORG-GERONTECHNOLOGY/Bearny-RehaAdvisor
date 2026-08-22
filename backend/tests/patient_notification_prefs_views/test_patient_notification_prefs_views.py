"""
Patient notification preferences + push subscription views tests
==================================================================

Endpoints covered
-----------------
GET  /api/patients/<patient_id>/notification-preferences/
POST /api/patients/<patient_id>/notification-preferences/
POST   /api/patients/<patient_id>/push-subscription/
DELETE /api/patients/<patient_id>/push-subscription/
"""

import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import mock

import mongomock
import pytest
from bson import ObjectId
from django.test import Client, override_settings

from core.models import (
    Intervention,
    Patient,
    PushSubscription,
    RehabilitationPlan,
    SentPushNotification,
    Therapist,
    User,
)
from core.views.patient_notification_prefs import _check_can_read, _check_can_write

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


def create_patient(clinic="Inselspital"):
    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(
        userId=th_user,
        name="Therapist",
        first_name="A",
        clinics=[clinic],
    ).save()

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
        clinic=clinic,
    ).save()
    return patient


def create_therapist(clinics):
    th_user = User(
        username=f"th-{ObjectId()}",
        email="th2@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Therapist(userId=th_user, name="Therapist", first_name="B", clinics=clinics).save()


def _request_as(user_id):
    return SimpleNamespace(user=SimpleNamespace(id=user_id))


def create_sent_push_notification(patient, category, sent_at):
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=patient.therapist,
        startDate=sent_at,
        endDate=sent_at,
        status="active",
    ).save()
    intervention = Intervention(
        external_id=f"ext-{ObjectId()}",
        language="en",
        title="Intervention",
        description="desc",
        content_type="Video",
    ).save()
    return SentPushNotification(
        patient=patient,
        rehab_plan=plan,
        intervention=intervention,
        scheduled_at=sent_at,
        category=category,
        sent_at=sent_at,
    ).save()


# ---------------------------------------------------------------------------
# GET /notification-preferences/
# ---------------------------------------------------------------------------


def test_prefs_get_patient_not_found():
    resp = client.get(f"/api/patients/{ObjectId()}/notification-preferences/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    assert resp.json()["success"] is False


def test_prefs_get_defaults_all_false():
    """
    Opt-in by design: turning a category on is the same action that creates
    the PushSubscription (see useNotifications.ts), so a patient who's never
    touched their settings must show as not-yet-subscribed, not "on".
    """
    patient = create_patient()
    resp = client.get(f"/api/patients/{patient.id}/notification-preferences/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["patient_id"] == str(patient.id)
    assert body["preferences"] == {
        "education": False,
        "exercise": False,
        "instructions": False,
        "reminder": False,
        "behavior_change": False,
        "other": False,
    }
    assert body["device_count"] == 0
    assert body["last_sent"] == {
        "education": None,
        "exercise": None,
        "instructions": None,
        "reminder": None,
        "behavior_change": None,
        "other": None,
    }


def test_prefs_get_device_count_reflects_only_this_patients_subscriptions():
    patient = create_patient()
    other = create_patient()
    PushSubscription(patient=patient, endpoint="https://push.example.com/a", keys_p256dh="p", keys_auth="a").save()
    PushSubscription(patient=patient, endpoint="https://push.example.com/b", keys_p256dh="p", keys_auth="a").save()
    PushSubscription(patient=other, endpoint="https://push.example.com/c", keys_p256dh="p", keys_auth="a").save()

    resp = client.get(f"/api/patients/{patient.id}/notification-preferences/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.json()["device_count"] == 2


def test_prefs_get_last_sent_returns_most_recent_per_category_for_this_patient_only():
    patient = create_patient()
    other = create_patient()
    # microsecond=0: MongoDB (and mongomock) store datetimes at millisecond
    # precision, so a raw datetime.now() round-trips with rounded/truncated
    # microseconds and no longer string-compares equal to the original.
    now = datetime.now().replace(microsecond=0)
    older = now - timedelta(days=5)
    newer = now - timedelta(days=1)

    create_sent_push_notification(patient, "exercise", older)
    create_sent_push_notification(patient, "exercise", newer)  # most recent should win
    create_sent_push_notification(patient, "reminder", older)
    create_sent_push_notification(other, "exercise", now)  # different patient, must not leak in

    resp = client.get(f"/api/patients/{patient.id}/notification-preferences/", HTTP_AUTHORIZATION="Bearer test")
    last_sent = resp.json()["last_sent"]
    assert last_sent["exercise"] == newer.isoformat()
    assert last_sent["reminder"] == older.isoformat()
    assert last_sent["education"] is None


# ---------------------------------------------------------------------------
# POST /notification-preferences/
# ---------------------------------------------------------------------------


def test_prefs_post_invalid_json():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/notification-preferences/",
        data="{bad-json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_prefs_post_requires_preferences_object():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/notification-preferences/",
        data=json.dumps({"preferences": "not-an-object"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_prefs_post_rejects_non_boolean_value():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/notification-preferences/",
        data=json.dumps({"preferences": {"education": "yes"}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_prefs_post_partial_update_persists():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/notification-preferences/",
        data=json.dumps({"preferences": {"education": True, "exercise": True}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["preferences"]["education"] is True
    assert body["preferences"]["exercise"] is True
    # untouched fields keep their default
    assert body["preferences"]["reminder"] is False

    patient.reload()
    assert patient.notification_preferences.education is True
    assert patient.notification_preferences.exercise is True
    assert patient.notification_preferences.reminder is False


def test_prefs_post_concurrent_updates_to_different_fields_are_not_lost():
    """
    Regression: the view used to read the whole notification_preferences
    embedded doc into Python, mutate it, and patient.save() the entire
    subdocument. Two requests toggling *different* categories — which the
    frontend explicitly allows, since only the category actually being
    toggled is disabled in the UI (see NotificationsCard.tsx) — would each
    start from the same stale in-memory read; whichever save() landed
    second silently discarded the other's change.

    Simulate that staleness deterministically: force both requests to
    resolve the patient from the same pre-fetched snapshot (captured before
    either write), so neither request's initial read reflects the other's
    change. The fix ($set on just the touched leaf field, keyed by pk) must
    preserve both writes regardless of in-memory staleness, because it
    never depends on the snapshot's other field values.
    """
    patient = create_patient()
    stale_snapshot = Patient.objects.get(pk=patient.pk)

    with mock.patch(
        "core.views.patient_notification_prefs._resolve_patient",
        return_value=stale_snapshot,
    ):
        resp_a = client.post(
            f"/api/patients/{patient.id}/notification-preferences/",
            data=json.dumps({"preferences": {"education": True}}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test",
        )
        resp_b = client.post(
            f"/api/patients/{patient.id}/notification-preferences/",
            data=json.dumps({"preferences": {"exercise": True}}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test",
        )

    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    # The second response reflects the true post-write DB state (not just
    # its own stale snapshot + its own change), so it must show both fields.
    assert resp_b.json()["preferences"]["education"] is True
    assert resp_b.json()["preferences"]["exercise"] is True

    patient.reload()
    assert patient.notification_preferences.education is True
    assert patient.notification_preferences.exercise is True


def test_prefs_post_handles_null_notification_preferences():
    """
    Regression: a patient whose notification_preferences is explicitly None
    (e.g. legacy data) must not 500 — $set on a dotted path errors if the
    parent is literally null, so _apply_notification_preference_updates
    must normalise it to a real subdocument first.
    """
    patient = create_patient()
    patient.notification_preferences = None
    patient.save()

    resp = client.post(
        f"/api/patients/{patient.id}/notification-preferences/",
        data=json.dumps({"preferences": {"education": True}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    assert resp.json()["preferences"]["education"] is True
    patient.reload()
    assert patient.notification_preferences.education is True


# ---------------------------------------------------------------------------
# POST/DELETE /push-subscription/
# ---------------------------------------------------------------------------


def test_subscription_post_requires_endpoint():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps({"keys": {"p256dh": "a", "auth": "b"}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_subscription_post_requires_keys():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps({"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/{$ne: null}",  # Mongo operator token
        "https://fcm.googleapis.com/fcm/send/" + "a" * 2049,  # exceeds length cap
        "https://fcm.googleapis.com/fcm/send/{malformed",  # brace, not a real op payload
    ],
)
def test_subscription_post_rejects_query_scalar_sanitizer_violations(endpoint):
    """Belt-and-suspenders sanitizer in front of the MongoEngine filter — see
    _sanitize_query_scalar_string. Not reachable as real NoSQL injection
    (MongoEngine keyword filters never interpret string *content* as
    operators), but cheap to reject outright."""
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps({"endpoint": endpoint, "keys": {"p256dh": "p-key", "auth": "a-key"}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_subscription_post_creates_row():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps(
            {
                "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
                "keys": {"p256dh": "p-key", "auth": "a-key"},
                "user_agent": "pytest",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200

    sub = PushSubscription.objects.get(endpoint="https://fcm.googleapis.com/fcm/send/abc")
    assert str(sub.patient.id) == str(patient.id)
    assert sub.keys_p256dh == "p-key"
    assert sub.keys_auth == "a-key"


def test_subscription_post_upserts_existing_endpoint():
    patient = create_patient()
    payload = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
        "keys": {"p256dh": "p-key", "auth": "a-key"},
    }
    client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    payload["keys"]["p256dh"] = "new-p-key"
    client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert PushSubscription.objects(endpoint="https://fcm.googleapis.com/fcm/send/abc").count() == 1
    assert PushSubscription.objects.get(endpoint="https://fcm.googleapis.com/fcm/send/abc").keys_p256dh == "new-p-key"


def test_subscription_post_rejects_disallowed_endpoint():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps(
            {
                "endpoint": "https://169.254.169.254/latest/meta-data/",
                "keys": {"p256dh": "p-key", "auth": "a-key"},
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert PushSubscription.objects(patient=patient).count() == 0


def test_subscription_post_conflict_when_endpoint_belongs_to_another_patient():
    owner = create_patient()
    other = create_patient()
    endpoint = "https://fcm.googleapis.com/fcm/send/shared-device"
    PushSubscription(patient=owner, endpoint=endpoint, keys_p256dh="p", keys_auth="a").save()

    resp = client.post(
        f"/api/patients/{other.id}/push-subscription/",
        data=json.dumps({"endpoint": endpoint, "keys": {"p256dh": "new-p", "auth": "new-a"}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "endpoint_conflict"
    # the original owner's subscription is untouched
    sub = PushSubscription.objects.get(endpoint=endpoint)
    assert str(sub.patient.id) == str(owner.id)
    assert sub.keys_p256dh == "p"


def test_subscription_post_same_patient_re_registering_is_not_a_conflict():
    patient = create_patient()
    endpoint = "https://fcm.googleapis.com/fcm/send/same-device"
    PushSubscription(patient=patient, endpoint=endpoint, keys_p256dh="p", keys_auth="a").save()

    resp = client.post(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps({"endpoint": endpoint, "keys": {"p256dh": "new-p", "auth": "new-a"}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert PushSubscription.objects.get(endpoint=endpoint).keys_p256dh == "new-p"


def test_subscription_delete_removes_row():
    patient = create_patient()
    PushSubscription(
        patient=patient,
        endpoint="https://push.example.com/xyz",
        keys_p256dh="p",
        keys_auth="a",
    ).save()

    resp = client.delete(
        f"/api/patients/{patient.id}/push-subscription/",
        data=json.dumps({"endpoint": "https://push.example.com/xyz"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert PushSubscription.objects(endpoint="https://push.example.com/xyz").count() == 0


# ---------------------------------------------------------------------------
# _check_can_write / _check_can_read
#
# The views short-circuit these under settings.TESTING (all tests above run
# with it on, per api/settings/test.py), so the authorisation logic itself
# needs direct unit coverage with TESTING forced off.
# ---------------------------------------------------------------------------


class TestCheckCanWrite:
    @override_settings(TESTING=False)
    def test_allows_patient_writing_via_url_patient_id(self):
        patient = create_patient()
        request = _request_as(str(patient.userId.id))
        assert _check_can_write(request, patient, str(patient.userId.id)) is None

    @override_settings(TESTING=False)
    def test_allows_patient_writing_via_own_userId_when_url_uses_patient_pk(self):
        # URL patient_id is the Patient document's own pk here, not the
        # User id — exercises the _patient_user_id() fallback comparison.
        patient = create_patient()
        request = _request_as(str(patient.userId.id))
        assert _check_can_write(request, patient, str(patient.id)) is None

    @override_settings(TESTING=False)
    def test_rejects_a_different_patient(self):
        patient = create_patient()
        other_patient = create_patient()
        request = _request_as(str(other_patient.userId.id))
        response = _check_can_write(request, patient, str(patient.userId.id))
        assert response is not None
        assert response.status_code == 403

    @override_settings(TESTING=False)
    def test_rejects_the_patients_own_therapist(self):
        patient = create_patient()
        request = _request_as(str(patient.therapist.userId.id))
        response = _check_can_write(request, patient, str(patient.userId.id))
        assert response is not None
        assert response.status_code == 403


class TestCheckCanRead:
    @override_settings(TESTING=False)
    def test_allows_patient_reading_their_own_data(self):
        patient = create_patient()
        request = _request_as(str(patient.userId.id))
        assert _check_can_read(request, patient, str(patient.userId.id)) is None

    @override_settings(TESTING=False)
    def test_allows_same_clinic_therapist(self):
        patient = create_patient(clinic="Inselspital")
        therapist = create_therapist(clinics=["Inselspital"])
        request = _request_as(str(therapist.userId.id))
        assert _check_can_read(request, patient, str(patient.userId.id)) is None

    @override_settings(TESTING=False)
    def test_rejects_different_clinic_therapist(self):
        patient = create_patient(clinic="Inselspital")
        therapist = create_therapist(clinics=["Bern"])
        request = _request_as(str(therapist.userId.id))
        response = _check_can_read(request, patient, str(patient.userId.id))
        assert response is not None
        assert response.status_code == 403

    @override_settings(TESTING=False)
    def test_rejects_unrelated_authenticated_user(self):
        patient = create_patient()
        other_patient = create_patient()
        request = _request_as(str(other_patient.userId.id))
        response = _check_can_read(request, patient, str(patient.userId.id))
        assert response is not None
        assert response.status_code == 403
