# management/commands/fetch_google_health_data.py
import datetime
import logging

from django.core.management.base import BaseCommand

from core.models import GoogleHealthUserToken
from core.views.google_health_sync import _sync_day, get_valid_google_access_token

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Fetch last 30 days of Google Health data for all connected users"

    def handle(self, *args, **kwargs):
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=30)
        date_range = [start_date + datetime.timedelta(days=i) for i in range(31)]

        tokens = GoogleHealthUserToken.objects.all()
        self.stdout.write(f"[google_health] Starting sync for {tokens.count()} user(s)")

        for token in tokens:
            user = token.user
            try:
                access_token = get_valid_google_access_token(user)
            except Exception as e:
                logger.error("[google_health] Could not get token for user %s: %s", user.id, e)
                self.stdout.write(self.style.WARNING(f"  Skipped user {user.id}: token refresh failed"))
                continue

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }

            written = 0
            skipped = 0
            for d in date_range:
                try:
                    ok = _sync_day(user, headers, d)
                    if ok:
                        written += 1
                    else:
                        skipped += 1
                except Exception as e:
                    logger.error("[google_health] Error syncing %s for user %s: %s", d, user.id, e)
                    skipped += 1

            msg = f"  user={user.id}: {written} days written, {skipped} days skipped/empty"
            self.stdout.write(self.style.SUCCESS(msg))
            logger.info("[google_health] Completed backfill for user %s: %d written", user.id, written)

        self.stdout.write(self.style.SUCCESS("[google_health] Sync complete"))
