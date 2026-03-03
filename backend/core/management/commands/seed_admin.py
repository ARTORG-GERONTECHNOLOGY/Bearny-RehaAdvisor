"""
seed_admin management command
==============================

Creates the application admin user from environment variables.

  Env var         Purpose
  --------------- -----------------------------------------
  ADMIN_EMAIL     Login e-mail for the admin account
  ADMIN_PASSWORD  Password for the admin account

Security notes
--------------
- Credentials are read from environment variables, **never** from
  command-line arguments (preventing exposure in shell history / process
  lists).
- If an admin user already exists the command does **not** overwrite the
  password by default.  Pass ``--force`` to explicitly reset credentials
  (e.g. after a password rotation).
- The command is safe to run on every deployment: it is a no-op when the
  admin already exists and ``--force`` is not supplied.

Usage
-----
    python manage.py seed_admin               # create if absent (safe default)
    python manage.py seed_admin --force       # create or overwrite credentials
    python manage.py seed_admin --clean       # remove admin user without recreating
"""

import os

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import User

# Stable username so the document can be found across runs
_ADMIN_USERNAME = "admin"


class Command(BaseCommand):
    help = (
        "Create the admin user from ADMIN_EMAIL / ADMIN_PASSWORD env vars. "
        "Safe to run on every deployment — skips silently if the user already "
        "exists unless --force is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "Overwrite the admin user's email and password even if the "
                "user already exists.  Use this for deliberate credential "
                "rotation — not on every deploy."
            ),
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Remove the admin user without recreating it.",
        )

    def handle(self, *args, **options):
        if options["clean"]:
            self._clean()
            self.stdout.write(self.style.SUCCESS("Admin user removed."))
            return

        email = os.environ.get("ADMIN_EMAIL", "").strip()
        password = os.environ.get("ADMIN_PASSWORD", "").strip()

        if not email or not password:
            self.stdout.write(self.style.WARNING("  seed_admin: ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping."))
            return

        existing = User.objects(username=_ADMIN_USERNAME).first()

        if existing and not options["force"]:
            self.stdout.write(
                f"  Admin user already exists ({existing.email}) — skipping. " "Pass --force to overwrite credentials."
            )
            return

        if existing:
            existing.email = email
            existing.pwdhash = make_password(password)
            existing.save()
            self.stdout.write(self.style.SUCCESS(f"  Admin credentials updated: {email}"))
        else:
            User(
                username=_ADMIN_USERNAME,
                email=email,
                role="Admin",
                pwdhash=make_password(password),
                createdAt=timezone.now(),
                isActive=True,
            ).save()
            self.stdout.write(self.style.SUCCESS(f"  Admin user created: {email}"))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _clean(self):
        user = User.objects(username=_ADMIN_USERNAME).first()
        if user:
            user.delete()
            self.stdout.write(f"  Removed admin user: {user.email}")
        else:
            self.stdout.write("  No admin user found — nothing to remove.")
