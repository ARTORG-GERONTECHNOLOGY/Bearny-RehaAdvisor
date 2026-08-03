"""
Fernet-encrypted MongoEngine StringField.

Values are encrypted with AES-128-CBC + HMAC-SHA256 (Fernet) before being
written to MongoDB and decrypted transparently on read.  The encryption key
is read from settings.FIELD_ENCRYPTION_KEY (URL-safe base64, 32 raw bytes).

Generate a production key with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Existing plaintext values are handled gracefully: if decryption fails (the
value was stored before encryption was enabled), the raw value is returned so
the application keeps working.  Run the encrypt_tokens management command to
re-encrypt all legacy plaintext tokens.
"""

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from mongoengine import StringField


def _fernet():
    key = getattr(settings, "FIELD_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


class EncryptedStringField(StringField):
    """StringField that stores values encrypted with Fernet."""

    def to_mongo(self, value):
        if value is None:
            return None
        return _fernet().encrypt(value.encode()).decode()

    def to_python(self, value):
        if value is None:
            return None
        try:
            return _fernet().decrypt(value.encode()).decode()
        except (InvalidToken, Exception):
            # Legacy plaintext value — return as-is until re-encrypted.
            return value
