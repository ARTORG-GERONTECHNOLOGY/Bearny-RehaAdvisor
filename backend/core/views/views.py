import os

from django.http import HttpResponse, JsonResponse

from utils.config import config


def index(request):
    return HttpResponse("<h1>Hello and welcome to my <u>Django App</u> project!</h1>")


def app_mode(request):
    """
    GET /api/app-mode/
    Public endpoint (no auth required). Returns the current operating mode and
    derived feature flags so the frontend can gate UI without a rebuild.

    Controlled by two env vars:
      APP_MODE              = dev | normal | study   (default: normal)
      STUDY_REDCAP_VISIBLE  = true | false           (default: true)
    """
    mode = os.getenv("APP_MODE", "normal").lower()
    if mode not in ("dev", "normal", "study"):
        mode = "normal"

    redcap_visible_raw = os.getenv("STUDY_REDCAP_VISIBLE", "true").lower()
    redcap_visible = redcap_visible_raw != "false"

    # AI suggestions are enabled when at least one clinic has them configured.
    ai_suggestion_clinics = config.get("ai_suggestion_clinics", [])
    ai_suggestions_enabled = len(ai_suggestion_clinics) > 0

    return JsonResponse(
        {
            "mode": mode,
            "redcapVisible": redcap_visible,
            "aiSuggestionsEnabled": ai_suggestions_enabled,
        }
    )
