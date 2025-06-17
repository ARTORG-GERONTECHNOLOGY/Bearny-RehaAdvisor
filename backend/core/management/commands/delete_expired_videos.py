from datetime import timedelta
from django.utils import timezone
from core.models import PatientInterventionLogs

def delete_old_videos():
    cutoff = timezone.now() - timedelta(days=14)
    # 1) Find all logs with embedded video feedback older than 30d
    for log in PatientInterventionLogs.objects(feedback__video__uploadedAt__lte=cutoff):
        updated = False
        for entry in log.feedback:
            if entry.video and entry.video.uploadedAt <= cutoff and not entry.video.expired:
                # delete file from storage
                default_storage.delete(entry.video.url.replace(settings.MEDIA_URL, ""))
                entry.video.expired = True
                updated = True
        if updated:
            log.save()
