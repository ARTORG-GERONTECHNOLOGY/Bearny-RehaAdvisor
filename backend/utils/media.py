# utils/media.py
from urllib.parse import urljoin
from django.conf import settings

def _abs_media_url(path: str) -> str:
    """
    Convert stored relative media path (e.g. 'audios/x.webm')
    into an absolute URL (e.g. 'https://dev.reha-advisor.ch/media/audios/x.webm')
    """
    if not path:
        return ""

    p = str(path).lstrip("/")

    # if already absolute, keep it
    if p.startswith("http://") or p.startswith("https://"):
        return p

    # MEDIA_HOST recommended: "https://dev.reha-advisor.ch"
    base = getattr(settings, "MEDIA_HOST", "").rstrip("/")
    media_url = getattr(settings, "MEDIA_URL", "/media/").strip("/") + "/"

    # join: base + /media/ + relative_path
    return urljoin(f"{base}/", f"{media_url}{p}")
