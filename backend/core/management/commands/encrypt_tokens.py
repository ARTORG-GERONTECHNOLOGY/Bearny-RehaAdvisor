"""
Re-encrypt all existing plaintext OAuth tokens.

Run this once after deploying the EncryptedStringField change and setting
FIELD_ENCRYPTION_KEY in production:

    docker exec django-prod python manage.py encrypt_tokens

Tokens that are already encrypted are skipped (Fernet decryption succeeds
and the value round-trips identically, so re-saving is a no-op on the
DB content).  Tokens with missing or null values are skipped entirely.

Safe to re-run — idempotent.
"""

import logging

from django.core.management.base import BaseCommand

from core.models import FitbitUserToken, GoogleHealthUserToken

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Encrypt any plaintext access_token / refresh_token values in MongoDB."

    def handle(self, *args, **options):
        self._encrypt_model(FitbitUserToken, "Fitbit")
        self._encrypt_model(GoogleHealthUserToken, "GoogleHealth")

    def _encrypt_model(self, model, label):
        tokens = model.objects.all()
        total = tokens.count()
        self.stdout.write(f"{label}: processing {total} token(s)...")

        ok = skipped = errors = 0
        for tok in tokens:
            try:
                # Reading via the EncryptedStringField property decrypts (or
                # returns plaintext for legacy values).  Saving re-encrypts.
                # Skip if both token fields are empty.
                if not tok.access_token and not tok.refresh_token:
                    skipped += 1
                    continue
                tok.save()
                ok += 1
            except Exception as exc:
                errors += 1
                logger.error("%s token %s failed: %s", label, tok.id, exc)

        self.stdout.write(
            self.style.SUCCESS(
                f"{label}: {ok} encrypted, {skipped} skipped, {errors} errors"
            )
        )
