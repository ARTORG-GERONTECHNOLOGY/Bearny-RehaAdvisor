import json
from datetime import datetime
from types import SimpleNamespace

import mongomock
import pytest
from bson import ObjectId
from django.test import RequestFactory
from django.utils import timezone

from core.models import Patient, PatientComment, Therapist, User
from core.views.patient_flag_views import (
    _authorize,
    _coerce_aware,
    _comment_sort_key,
    _comment_to_dict,
    _display_name,
    _get_patient,
    patient_comments_view,
)

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


def _make_therapist(username, clinics, first_name="", name=""):
    u = User(
        username=username, email=f"{username}@x.com", role="Therapist", createdAt=datetime.now(), isActive=True
    ).save()
    th = Therapist(userId=u, clinics=clinics, first_name=first_name, name=name).save()
    return u, th


def _make_patient(clinic, therapist):
    pu = User(username=f"pt-{ObjectId()}", role="Patient", createdAt=datetime.now(), isActive=True).save()
    return Patient(userId=pu, patient_code=f"PX-{ObjectId()}", therapist=therapist, clinic=clinic).save()


# ===========================================================================
# _get_patient
# ===========================================================================


def test_get_patient_found_by_pk():
    _, th = _make_therapist("thx", ["Inselspital"])
    patient = _make_patient("Inselspital", th)
    assert _get_patient(str(patient.id)).id == patient.id


def test_get_patient_malformed_id_returns_none():
    """Regression: a garbage id must not raise InvalidId, it should just be 'not found'."""
    assert _get_patient("not-a-valid-object-id") is None


def test_get_patient_wellformed_but_nonexistent_id_returns_none():
    assert _get_patient(str(ObjectId())) is None


def test_get_patient_found_by_linked_user_id():
    """Regression: both a Patient's own pk and its linked User id are 24-char
    ObjectIds, so the userId fallback is only reachable if the pk lookup is
    tried and allowed to miss before falling back — it must not be dead code."""
    _, th = _make_therapist("th_uid", ["Inselspital"])
    pu = User(username=f"pt-{ObjectId()}", role="Patient", createdAt=datetime.now(), isActive=True).save()
    patient = Patient(userId=pu, patient_code=f"PX-{ObjectId()}", therapist=th, clinic="Inselspital").save()

    found = _get_patient(str(pu.id))
    assert found is not None
    assert found.id == patient.id


# ===========================================================================
# _coerce_aware
# ===========================================================================


def test_coerce_aware_none_naive_and_aware():
    assert timezone.is_aware(_coerce_aware(None))

    naive = datetime(2025, 6, 1, 12, 0, 0)
    assert timezone.is_naive(naive)
    made_aware = _coerce_aware(naive)
    assert timezone.is_aware(made_aware)
    assert made_aware.year == 2025 and made_aware.month == 6

    aware = timezone.now()
    assert _coerce_aware(aware) == aware


# ===========================================================================
# _comment_sort_key / _comment_to_dict
# ===========================================================================


def test_comment_to_dict_and_sort_key():
    c = PatientComment(text="hello", created_at=timezone.now(), commented_by="Dr. House")
    d = _comment_to_dict(c)
    assert d == {"text": "hello", "created_at": c.created_at.isoformat(), "commented_by": "Dr. House"}
    assert timezone.is_aware(_comment_sort_key(c))


def test_comments_sort_tolerates_naive_created_at():
    """GET /comments/ must not raise TypeError when the list mixes naive and aware datetimes."""
    _, th = _make_therapist("thy", ["Inselspital"])
    patient = _make_patient("Inselspital", th)

    old = PatientComment(text="old, naive", created_at=datetime(2025, 1, 1, 8, 0, 0), commented_by="A")
    new = PatientComment(text="new, aware", created_at=timezone.now(), commented_by="B")
    patient.comments = [old, new]
    patient.save()

    req = rf.get(f"/api/patients/{patient.id}/comments/")
    resp = patient_comments_view(req, str(patient.id))

    assert resp.status_code == 200
    data = json.loads(resp.content)
    assert [c["text"] for c in data["comments"]] == ["new, aware", "old, naive"]


# ===========================================================================
# _display_name
# ===========================================================================


def test_display_name_uses_therapist_full_name():
    u, _ = _make_therapist("th_named", ["Inselspital"], first_name="Greg", name="House")
    req = SimpleNamespace(user=SimpleNamespace(id=str(u.id)))
    assert _display_name(req) == "Greg House"


def test_display_name_falls_back_to_username_when_no_therapist_linked():
    """Regression: an Admin (no Therapist record) must not get a blank name."""
    admin = User(username="the_admin", role="Admin", createdAt=datetime.now(), isActive=True).save()
    req = SimpleNamespace(user=SimpleNamespace(id=str(admin.id)))
    assert _display_name(req) == "the_admin"


def test_display_name_returns_empty_string_when_user_unresolvable():
    req = SimpleNamespace(user=SimpleNamespace(id=str(ObjectId())))
    assert _display_name(req) == ""


# ===========================================================================
# _authorize
#
# _authorize() short-circuits to `None` (allowed) whenever settings.TESTING is
# true, so these tests flip it off for the duration of the call — same
# approach as tests/security/test_security_fixes.py's fix6 tests — to
# actually exercise the admin-bypass / clinic-match logic.
# ===========================================================================


def _call_authorize_with_testing_disabled(req, patient):
    from django.conf import settings as _ds

    _ds.TESTING = False
    try:
        return _authorize(req, patient)
    finally:
        _ds.TESTING = True


def test_authorize_admin_bypasses_clinic_check():
    admin = User(username="adm2", role="Admin", createdAt=datetime.now(), isActive=True).save()
    _, th = _make_therapist("th_other", ["Bern"])
    patient = _make_patient("Bern", th)

    req = SimpleNamespace(user=SimpleNamespace(id=str(admin.id)))
    assert _call_authorize_with_testing_disabled(req, patient) is None


def test_authorize_therapist_same_clinic_allowed():
    u, th = _make_therapist("th_same", ["Inselspital"])
    patient = _make_patient("Inselspital", th)

    req = SimpleNamespace(user=SimpleNamespace(id=str(u.id)))
    assert _call_authorize_with_testing_disabled(req, patient) is None


def test_authorize_therapist_different_clinic_forbidden():
    u, _ = _make_therapist("th_diff", ["Bern"])
    _, owner_th = _make_therapist("th_owner", ["Inselspital"])
    patient = _make_patient("Inselspital", owner_th)

    req = SimpleNamespace(user=SimpleNamespace(id=str(u.id)))
    resp = _call_authorize_with_testing_disabled(req, patient)
    assert resp is not None
    assert resp.status_code == 403


def test_authorize_no_therapist_for_caller_forbidden():
    _, th = _make_therapist("th_owner2", ["Inselspital"])
    patient = _make_patient("Inselspital", th)

    req = SimpleNamespace(user=SimpleNamespace(id=str(ObjectId())))
    resp = _call_authorize_with_testing_disabled(req, patient)
    assert resp is not None
    assert resp.status_code == 403


# ===========================================================================
# Concurrent comment append (atomic $push)
# ===========================================================================


def test_concurrent_comment_appends_do_not_lose_either_comment():
    """
    Regression: appending via read-modify-write (fetch patient, append to the
    in-memory list, save()) lets a second concurrent save() silently overwrite
    the first save()'s comment. The atomic $push used in patient_comments_view
    must not have this problem.
    """
    _, th = _make_therapist("th_race", ["Inselspital"])
    patient = _make_patient("Inselspital", th)

    # Two "requests" both load the patient before either one saves.
    patient_a = Patient.objects.get(pk=patient.id)
    patient_b = Patient.objects.get(pk=patient.id)

    comment_a = PatientComment(text="from request A", created_at=timezone.now(), commented_by="A")
    comment_b = PatientComment(text="from request B", created_at=timezone.now(), commented_by="B")

    Patient.objects(pk=patient_a.id).update_one(push__comments=comment_a)
    patient_a.reload()
    Patient.objects(pk=patient_b.id).update_one(push__comments=comment_b)
    patient_b.reload()

    fresh = Patient.objects.get(pk=patient.id)
    texts = {c.text for c in fresh.comments}
    assert texts == {"from request A", "from request B"}
