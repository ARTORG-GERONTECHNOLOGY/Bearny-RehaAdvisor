import logging

from core.models import Patient, User

logger = logging.getLogger(__name__)


def _resolve_patient(request, patient_id: str | None):
    """
    Resolution order:
      1) Path param patient_id (accepts Patient.id OR User.id)
      2) Query param patientId / patient_id (accepts Patient.id OR User.id)
      3) Current Django user -> Mongo User by email/username -> Patient(userId=User)
    """
    candidate = patient_id or request.GET.get("patientId") or request.GET.get("patient_id")
    if candidate:
        try:
            return Patient.objects.get(pk=candidate)
        except Patient.DoesNotExist:
            pass
        try:
            mu = User.objects.get(pk=candidate)
            return Patient.objects.get(userId=mu)
        except (User.DoesNotExist, Patient.DoesNotExist):
            pass

    dj = getattr(request, "user", None)
    if dj and getattr(dj, "is_authenticated", False):
        keys = []
        email = getattr(dj, "email", None)
        username = getattr(dj, "username", None)
        if email:
            keys.append({"email": email})
            keys.append({"username": email})
        if username and username != email:
            keys.append({"username": username})
            keys.append({"email": username})

        for filt in keys:
            try:
                mu = User.objects.get(**filt)
                return Patient.objects.get(userId=mu)
            except (User.DoesNotExist, Patient.DoesNotExist):
                continue

    return None


def _resolve_user_for_fitbit_status(patient_identifier: str):
    """
    Resolve either:
    - Patient.id -> patient.userId
    - User.id -> user
    Returns None when the identifier cannot be resolved.
    """
    try:
        patient = Patient.objects.get(pk=patient_identifier)
        return patient.userId
    except Exception:
        pass

    try:
        return User.objects.get(pk=patient_identifier)
    except Exception:
        return None


def avg_excluding_zero(values):
    non_zero = [v for v in values if v > 0]
    return sum(non_zero) // len(non_zero) if non_zero else 0


def _default_thresholds():
    return {
        "steps_goal": 10000,
        "active_minutes_green": 30,
        "active_minutes_yellow": 20,
        "sleep_green_min": 7 * 60,
        "sleep_yellow_min": 6 * 60,
        "bp_sys_green_max": 129,
        "bp_sys_yellow_max": 139,
        "bp_dia_green_max": 84,
        "bp_dia_yellow_max": 89,
    }


def _merge_thresholds(patient):
    """
    Merge patient.thresholds into backend defaults.
    If patient has no thresholds or partial thresholds, defaults fill the gaps.
    """
    base = _default_thresholds()

    th = getattr(patient, "thresholds", None)
    if not th:
        return base

    for k in list(base.keys()):
        v = getattr(th, k, None)
        if v is not None:
            base[k] = v
    return base
