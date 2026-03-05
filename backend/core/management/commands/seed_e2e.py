"""
seed_e2e management command
============================

Creates the three user accounts required by the Playwright E2E test suite:

  Role        Env var pair
  ----------  ------------------------------------
  Admin       E2E_ADMIN_LOGIN / E2E_ADMIN_PASSWORD
  Therapist   E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD
  Patient     E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD

Each user is keyed on a stable username constant (``e2e-admin``, etc.) so the
command is safe to re-run — existing seed documents are removed and recreated
on every invocation.

Usage
-----
    python manage.py seed_e2e               # create / replace seed users
    python manage.py seed_e2e --clean       # remove seed users only

If a credential pair is missing from the environment the corresponding user is
skipped with a warning (tests that need those credentials already contain
``test.skip`` guards in the spec files).
"""

import os

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Patient, Therapist, User

# Stable usernames that uniquely identify seed documents across re-runs
_USERNAME = {
    "admin": "e2e-admin",
    "therapist": "e2e-therapist",
    "patient": "e2e-patient",
    # Internal stub therapist created when E2E_THERAPIST_* creds are absent
    # but E2E_PATIENT_* creds are present (patient must reference a therapist)
    "stub_therapist": "e2e-stub-therapist",
}


class Command(BaseCommand):
    help = (
        "Seed E2E test users (admin, therapist, patient) from E2E_* environment "
        "variables.  Safe to re-run.  Use --clean to remove without recreating."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Delete existing E2E seed users without recreating them.",
        )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        self._clean()
        if options["clean"]:
            self.stdout.write(self.style.SUCCESS("E2E seed users removed."))
            return
        self._seed()
        self.stdout.write(self.style.SUCCESS("E2E seed complete."))

    # ------------------------------------------------------------------
    # Clean
    # ------------------------------------------------------------------

    def _clean(self):
        """Remove every document created by a previous seed run."""
        for label, username in _USERNAME.items():
            user = User.objects(username=username).first()
            if not user:
                continue
            Patient.objects(userId=user).delete()
            Therapist.objects(userId=user).delete()
            user.delete()
            self.stdout.write(f"  Removed: {username}")

    # ------------------------------------------------------------------
    # Seed
    # ------------------------------------------------------------------

    def _seed(self):
        self._seed_admin()
        therapist = self._seed_therapist()
        if therapist is None:
            therapist = self._seed_stub_therapist()
        self._seed_patient(therapist)

    # ------------------------------------------------------------------
    # Individual user creators
    # ------------------------------------------------------------------

    def _seed_admin(self):
        login, password = self._creds("E2E_ADMIN_LOGIN", "E2E_ADMIN_PASSWORD", "Admin")
        if not login:
            return None
        user = User(
            username=_USERNAME["admin"],
            email=login,
            role="Admin",
            pwdhash=make_password(password),
            createdAt=timezone.now(),
            isActive=True,
        ).save()
        self.stdout.write(self.style.SUCCESS(f"  Created Admin      : {login}"))
        return user

    def _seed_therapist(self):
        """Returns the saved Therapist doc, or None if creds are absent."""
        login, password = self._creds("E2E_THERAPIST_LOGIN", "E2E_THERAPIST_PASSWORD", "Therapist")
        if not login:
            return None
        user = User(
            username=_USERNAME["therapist"],
            email=login,
            role="Therapist",
            pwdhash=make_password(password),
            createdAt=timezone.now(),
            isActive=True,
        ).save()
        therapist = Therapist(
            userId=user,
            name="E2E",
            first_name="Therapist",
            specializations=["Cardiology"],
            clinics=["Inselspital"],
        ).save()
        self.stdout.write(self.style.SUCCESS(f"  Created Therapist  : {login}"))
        return therapist

    def _seed_stub_therapist(self):
        """
        Create a minimal therapist so the patient document can be saved even
        when E2E_THERAPIST_* credentials are not provided.  The stub user has
        no password so it cannot log in.
        """
        existing_user = User.objects(username=_USERNAME["stub_therapist"]).first()
        if existing_user:
            return Therapist.objects(userId=existing_user).first()

        stub_user = User(
            username=_USERNAME["stub_therapist"],
            email="e2e-stub-therapist@internal.invalid",
            role="Therapist",
            pwdhash="",
            createdAt=timezone.now(),
            isActive=False,
        ).save()
        therapist = Therapist(
            userId=stub_user,
            name="E2E",
            first_name="Stub",
            specializations=["Cardiology"],
            clinics=["Inselspital"],
        ).save()
        self.stdout.write(f"  Created stub therapist for patient linkage")
        return therapist

    def _seed_patient(self, therapist):
        login, password = self._creds("E2E_PATIENT_LOGIN", "E2E_PATIENT_PASSWORD", "Patient")
        if not login:
            return None
        user = User(
            username=_USERNAME["patient"],
            email=login,
            role="Patient",
            pwdhash=make_password(password),
            createdAt=timezone.now(),
            isActive=True,
        ).save()
        Patient(
            userId=user,
            patient_code="E2E-PAT-001",
            therapist=therapist,
            access_word="e2e",
        ).save()
        self.stdout.write(self.style.SUCCESS(f"  Created Patient    : {login}"))
        return user

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _creds(self, login_var, password_var, role):
        """
        Return (login, password) from the environment, or (None, None) with a
        warning when either variable is absent.
        """
        login = os.environ.get(login_var, "").strip()
        password = os.environ.get(password_var, "").strip()
        if not login or not password:
            self.stdout.write(self.style.WARNING(f"  Skipping {role}: {login_var} / {password_var} not set"))
            return None, None
        return login, password
