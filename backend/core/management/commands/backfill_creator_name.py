"""
Management command: backfill_creator_name

Populates the ``creator_name`` field on InterventionTemplate documents that
were created before the field was added (issue #360).

For templates whose ``created_by`` reference is still valid, the name is
derived from the Therapist document.  For orphaned templates (creator deleted),
``creator_name`` is left as-is if already set, or marked as "[unknown]".

Usage:
    docker exec django python manage.py backfill_creator_name
    docker exec django python manage.py backfill_creator_name --dry-run
"""

import logging

from django.core.management.base import BaseCommand

from core.models import InterventionTemplate

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Backfill creator_name on InterventionTemplate documents (issue #360)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be changed without writing to the database",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        updated = skipped = orphaned = 0

        for tmpl in InterventionTemplate.objects.all():
            if tmpl.creator_name:
                skipped += 1
                continue

            name = ""
            try:
                creator = tmpl.created_by
                if creator is not None:
                    name = f"{creator.first_name or ''} {creator.name or ''}".strip()
            except Exception:
                pass

            if not name:
                name = "[unknown]"
                orphaned += 1

            updated += 1
            if dry_run:
                self.stdout.write(f"  Would set creator_name={name!r} on {tmpl.name!r} ({tmpl.id})")
            else:
                InterventionTemplate.objects(id=tmpl.id).update(set__creator_name=name)

        action = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {updated} template(s); "
                f"{skipped} already had creator_name; "
                f"{orphaned} orphaned (creator deleted)."
            )
        )
