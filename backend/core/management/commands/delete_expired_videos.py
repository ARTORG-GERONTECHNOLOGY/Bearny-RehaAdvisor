import logging
from datetime import timedelta
from urllib.parse import urlparse

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import GeneralFeedback, PatientInterventionLogs

logger = logging.getLogger(__name__)


def _storage_path_from_url(url: str) -> str:
    """
    Convert a stored URL (absolute or /media/... relative) into a path that
    default_storage.delete() understands.
    Works for:
      - full URLs: https://domain/media/foo.mp4
      - media URLs: /media/foo.mp4
      - already storage-relative: foo.mp4 or uploads/foo.mp4
    """
    if not url:
        return ""

    parsed = urlparse(url)
    path = parsed.path if parsed.scheme else url

    media_url = (settings.MEDIA_URL or "/media/").rstrip("/") + "/"
    if path.startswith(media_url):
        path = path[len(media_url) :]

    return path.lstrip("/")


def _best_video_timestamp(log) -> "timezone.datetime | None":
    """
    Since your current model does not store video_uploaded_at, we need a proxy timestamp.
    We use the most reliable available time in order:
      1) log.updatedAt
      2) log.createdAt
      3) log.date (scheduled day)
    """
    for field in ("updatedAt", "createdAt", "date"):
        dt = getattr(log, field, None)
        if dt:
            return dt
    return None


class Command(BaseCommand):
    help = (
        "Deletes old feedback media files (videos and audios) older than --days days.\n"
        "Videos: PatientInterventionLogs.video_url — marked with video_expired=True.\n"
        "Audios: FeedbackEntry.audio_url in PatientInterventionLogs and GeneralFeedback\n"
        "        — audio_url cleared to '' after deletion.\n"
        "Controlled by ENABLE_MEDIA_AUTO_DELETE env var when run via Celery.\n"
        "Default cutoff is 14 days based on updatedAt/createdAt/date (best available)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=14,
            help="Expire/delete videos older than this many days (default: 14).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Don't delete or save; just report what would happen.",
        )
        parser.add_argument(
            "--no-delete",
            action="store_true",
            help="Only mark as expired, do not delete files from storage.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Process at most N logs (0 = no limit). Useful for testing.",
        )

    def handle(self, *args, **options):
        days = int(options["days"])
        dry_run = bool(options["dry_run"])
        no_delete = bool(options["no_delete"])
        limit = int(options["limit"]) if options["limit"] else 0

        cutoff = timezone.now() - timedelta(days=days)
        self.stdout.write(
            f"delete_expired_videos: cutoff={cutoff.isoformat()} days={days} dry_run={dry_run} no_delete={no_delete} limit={limit}"
        )

        touched_logs = 0
        marked_expired = 0
        deleted_files = 0
        missing_files = 0
        errors = 0

        # --- CURRENT MODEL: PatientInterventionLogs.video_url + video_expired ---
        # MongoEngine query: only logs that have a video_url and are not expired yet
        qs = PatientInterventionLogs.objects(video_url__ne=None, video_url__ne="", video_expired=False)

        if limit:
            qs = qs[:limit]

        for log in qs:
            try:
                video_url = getattr(log, "video_url", "") or ""
                if not video_url:
                    continue

                # Decide if it's old enough
                ts = _best_video_timestamp(log)
                if not ts:
                    # If we have no timestamp at all, skip safely.
                    continue
                if ts > cutoff:
                    continue

                storage_path = _storage_path_from_url(video_url)

                # Delete file (optional)
                if storage_path and not no_delete:
                    if dry_run:
                        logger.info("[DRY RUN] Would delete file: %s", storage_path)
                    else:
                        try:
                            # Some storages throw if missing; some don’t. We handle both safely.
                            if hasattr(default_storage, "exists"):
                                if default_storage.exists(storage_path):
                                    default_storage.delete(storage_path)
                                    deleted_files += 1
                                else:
                                    missing_files += 1
                                    logger.warning("File missing in storage: %s", storage_path)
                            else:
                                default_storage.delete(storage_path)
                                deleted_files += 1
                        except Exception:
                            errors += 1
                            logger.exception("Failed to delete file: %s", storage_path)

                # Mark expired in DB (even if delete fails; change if you prefer strictness)
                if dry_run:
                    logger.info(
                        "[DRY RUN] Would mark video_expired=True for log=%s",
                        getattr(log, "id", "unknown"),
                    )
                else:
                    log.video_expired = True
                    # Optional: also blank the URL after expiry (uncomment if desired)
                    # log.video_url = ""
                    log.save()

                marked_expired += 1
                touched_logs += 1

            except Exception:
                errors += 1
                logger.exception(
                    "Unexpected error processing log id=%s",
                    getattr(log, "id", "unknown"),
                )

        # --- OPTIONAL: legacy cleanup (only if older embedded structures exist) ---
        # If you previously stored embedded entry.video with uploadedAt/expired/url,
        # you can keep this block to clean leftovers.
        legacy_marked = 0
        legacy_deleted = 0

        try:
            legacy_qs = PatientInterventionLogs.objects(feedback__video__uploadedAt__lte=cutoff)
            if limit:
                legacy_qs = legacy_qs[:limit]

            for log in legacy_qs:
                updated = False
                for entry in getattr(log, "feedback", None) or []:
                    video = getattr(entry, "video", None)
                    if not video:
                        continue
                    uploaded_at = getattr(video, "uploadedAt", None)
                    expired = bool(getattr(video, "expired", False))
                    url = getattr(video, "url", "") or ""

                    if uploaded_at and uploaded_at <= cutoff and not expired:
                        storage_path = _storage_path_from_url(url)

                        if storage_path and not no_delete:
                            if dry_run:
                                logger.info(
                                    "[DRY RUN] Would delete legacy file: %s",
                                    storage_path,
                                )
                            else:
                                try:
                                    if hasattr(default_storage, "exists"):
                                        if default_storage.exists(storage_path):
                                            default_storage.delete(storage_path)
                                            legacy_deleted += 1
                                        else:
                                            missing_files += 1
                                    else:
                                        default_storage.delete(storage_path)
                                        legacy_deleted += 1
                                except Exception:
                                    errors += 1
                                    logger.exception("Failed to delete legacy file: %s", storage_path)

                        if dry_run:
                            logger.info(
                                "[DRY RUN] Would mark legacy video expired for log=%s",
                                getattr(log, "id", "unknown"),
                            )
                        else:
                            video.expired = True
                            updated = True

                        legacy_marked += 1

                if updated and not dry_run:
                    log.save()

        except Exception:
            # If legacy structure doesn't exist anymore, we just ignore it.
            pass

        # --- AUDIO: FeedbackEntry.audio_url in PatientInterventionLogs ---
        # FeedbackEntry embeds a `date` field — use that as the age proxy.
        # After deletion the audio_url field is cleared to "" so the record is not revisited.
        audio_deleted = 0
        audio_missing = 0

        for doc_class, list_field in [
            (PatientInterventionLogs, "feedback"),
            (GeneralFeedback, "feedback_entries"),
        ]:
            try:
                audio_qs = doc_class.objects(**{f"{list_field}__audio_url__ne": None,
                                                f"{list_field}__audio_url__ne": ""})
                if limit:
                    audio_qs = audio_qs[:limit]

                for doc in audio_qs:
                    entries = getattr(doc, list_field, None) or []
                    updated = False
                    for entry in entries:
                        url = getattr(entry, "audio_url", None) or ""
                        if not url:
                            continue
                        entry_date = getattr(entry, "date", None)
                        if not entry_date or entry_date > cutoff:
                            continue

                        storage_path = _storage_path_from_url(url)
                        if storage_path and not no_delete:
                            if dry_run:
                                logger.info("[DRY RUN] Would delete audio: %s", storage_path)
                            else:
                                try:
                                    if default_storage.exists(storage_path):
                                        default_storage.delete(storage_path)
                                        audio_deleted += 1
                                    else:
                                        audio_missing += 1
                                        logger.warning("Audio file missing in storage: %s", storage_path)
                                except Exception:
                                    errors += 1
                                    logger.exception("Failed to delete audio file: %s", storage_path)

                        if dry_run:
                            logger.info(
                                "[DRY RUN] Would clear audio_url on %s id=%s",
                                doc_class.__name__,
                                getattr(doc, "id", "unknown"),
                            )
                        else:
                            entry.audio_url = ""
                            updated = True

                    if updated and not dry_run:
                        doc.save()

            except Exception:
                errors += 1
                logger.exception("Error during audio cleanup for %s", doc_class.__name__)

        msg = (
            f"Done. logs_updated={touched_logs}, videos_marked_expired={marked_expired}, "
            f"files_deleted={deleted_files}, missing_files={missing_files}, "
            f"audios_deleted={audio_deleted}, audio_missing={audio_missing}, errors={errors}"
        )
        if legacy_marked or legacy_deleted:
            msg += f" | legacy_marked={legacy_marked}, legacy_deleted={legacy_deleted}"

        self.stdout.write(self.style.SUCCESS(msg))
        logger.info(msg)
