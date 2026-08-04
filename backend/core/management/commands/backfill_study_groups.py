"""
One-time backfill: set patient.study_group from REDCap's rando_res field.

Targets patients who were imported from REDCap before study_group was added
to the import pipeline (study_group is None) — or all REDCap patients when
--all is passed.

Usage:
    # Dry-run (prints what would change, touches nothing)
    docker exec django python manage.py backfill_study_groups --dry-run

    # Real run, only patients missing a study_group
    docker exec django python manage.py backfill_study_groups

    # Force-update all REDCap patients (re-fetch from source)
    docker exec django python manage.py backfill_study_groups --all

    # Limit to one project
    docker exec django python manage.py backfill_study_groups --project compass
"""

import logging
from collections import defaultdict

import requests
from django.core.management.base import BaseCommand

from core.models import Patient
from core.views.redcap_import_views import (
    get_redcap_api_url,
    get_redcap_token_for_project,
)
from utils.config import config as _CONFIG

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Backfill patient.study_group from REDCap rando_res for existing patients."

    def add_arguments(self, parser):
        parser.add_argument(
            "--project",
            type=str,
            default=None,
            help="Limit to a single REDCap project (e.g. compass, copain).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would change without saving anything.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            dest="update_all",
            help="Update all REDCap patients, not just those with study_group=None.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        update_all = options["update_all"]
        project_filter = (options["project"] or "").strip().lower() or None

        config = _CONFIG
        sg_field = config.get("study_group_redcap_field", "")
        sg_labels = config.get("study_group_labels", {})

        if not sg_field:
            self.stderr.write("study_group_redcap_field not set in config.json — nothing to do.")
            return

        self.stdout.write(f"REDCap field: {sg_field}")
        self.stdout.write(f"Label map:    {sg_labels}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY-RUN — no changes will be saved."))

        # ── 1. Find candidate patients ────────────────────────────────────────
        qs = Patient.objects(__raw__={"redcap_record_id": {"$exists": True, "$nin": [None, ""]}})
        if not update_all:
            qs = qs.filter(
                __raw__={
                    "$or": [
                        {"study_group": None},
                        {"study_group": {"$exists": False}},
                    ]
                }
            )
        if project_filter:
            qs = qs.filter(redcap_project=project_filter)

        patients = list(qs.only("id", "redcap_record_id", "redcap_project", "study_group", "first_name", "name"))

        if not patients:
            self.stdout.write("No patients to update.")
            return

        self.stdout.write(f"Found {len(patients)} patient(s) to process.")

        # ── 2. Group by project ───────────────────────────────────────────────
        by_project = defaultdict(list)
        for pt in patients:
            proj = (pt.redcap_project or "").strip().lower()
            if not proj:
                self.stderr.write(f"  SKIP {pt.id} — no redcap_project set")
                continue
            by_project[proj].append(pt)

        api_url = get_redcap_api_url()
        total_updated = 0
        total_skipped = 0

        # ── 3. Bulk fetch from REDCap, one call per project ───────────────────
        for project, pt_list in by_project.items():
            token = get_redcap_token_for_project(project)
            if not token:
                self.stderr.write(f"  SKIP project '{project}' — no REDCAP_TOKEN_{project.upper()} in env")
                total_skipped += len(pt_list)
                continue

            self.stdout.write(f"\nProject: {project} ({len(pt_list)} patient(s))")

            # Build a record_id → patient map
            rid_map = {pt.redcap_record_id: pt for pt in pt_list}

            # Fetch all matching records from REDCap in one API call
            payload = {
                "token": token,
                "content": "record",
                "action": "export",
                "format": "json",
                "type": "flat",
                "rawOrLabel": "raw",
                "rawOrLabelHeaders": "raw",
                "exportCheckboxLabel": "false",
                "exportSurveyFields": "false",
                "exportDataAccessGroups": "false",
                "returnFormat": "json",
            }
            for i, rid in enumerate(rid_map.keys()):
                payload[f"records[{i}]"] = rid
            for i, field in enumerate(["record_id", sg_field]):
                payload[f"fields[{i}]"] = field

            try:
                resp = requests.post(api_url, data=payload, timeout=30)
                resp.raise_for_status()
                rows = resp.json()
            except Exception as exc:
                self.stderr.write(f"  ERROR fetching from REDCap for project {project}: {exc}")
                total_skipped += len(pt_list)
                continue

            # Build record_id → raw sg value (take first non-empty row per record)
            redcap_sg = {}
            for row in rows:
                rid = str(row.get("record_id", "")).strip()
                raw = str(row.get(sg_field, "")).strip()
                if rid and raw and rid not in redcap_sg:
                    redcap_sg[rid] = raw

            # ── 4. Apply updates ─────────────────────────────────────────────
            for rid, pt in rid_map.items():
                raw_val = redcap_sg.get(str(rid), "")
                new_sg = sg_labels.get(str(raw_val), raw_val) if raw_val else None

                label = f"{pt.first_name or ''} {pt.name or ''}".strip() or str(pt.id)

                if new_sg is None:
                    self.stdout.write(
                        f"  SKIP {label} (record {rid}) — " f"rando_res not found in REDCap (field may be empty)"
                    )
                    total_skipped += 1
                    continue

                old_sg = pt.study_group or None
                if old_sg == new_sg and not update_all:
                    total_skipped += 1
                    continue

                action = "SET" if not old_sg else "UPDATE"
                self.stdout.write(f"  {action} {label} (record {rid}): " f"{repr(old_sg)} → {repr(new_sg)}")

                if not dry_run:
                    try:
                        Patient.objects(id=pt.id).update_one(set__study_group=new_sg)
                        total_updated += 1
                    except Exception as exc:
                        self.stderr.write(f"  ERROR saving {pt.id}: {exc}")
                        total_skipped += 1
                else:
                    total_updated += 1  # count as "would update" in dry-run

        # ── 5. Summary ────────────────────────────────────────────────────────
        verb = "Would update" if dry_run else "Updated"
        self.stdout.write(self.style.SUCCESS(f"\n{verb} {total_updated} patient(s). Skipped {total_skipped}."))
