# Maps Intervention.aim (the taxonomy validated at import time against
# backend/interventions.json's "aims" list) to the notification preference
# categories stored on Patient.notification_preferences.
AIM_TO_NOTIFICATION_CATEGORY = {
    "Education": "education",
    "Exercise": "exercise",
    "Instructions": "instructions",
    "Reminder": "reminder",
    "Behavior change": "behavior_change",
    "Experience": "other",
}


def resolve_notification_category(aim: str | None) -> str:
    """Any unmapped or missing aim value falls back to the "other" bucket."""
    return AIM_TO_NOTIFICATION_CATEGORY.get((aim or "").strip(), "other")
