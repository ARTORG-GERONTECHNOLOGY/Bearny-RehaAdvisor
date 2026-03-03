"""
seed_feedback_questions management command
==========================================

Seeds the canonical FeedbackQuestion records into the database.

These questions are defined in code (exported from the development
database) so a fresh production or staging environment always has the
correct question catalogue without any manual data entry.

Behaviour
---------
- **Upsert by questionKey**: existing questions are updated to match the
  latest definition; new questions are inserted.  Existing patient
  feedback that references these questions is never touched.
- **Non-destructive by default**: questions that exist in the database
  but are NOT in the seed list are left alone (custom questions added
  via the admin panel survive a re-seed).
- Pass ``--clean`` to *remove* only the seeded question keys before
  recreating them (useful for a full reset during development).

Usage
-----
    python manage.py seed_feedback_questions          # upsert
    python manage.py seed_feedback_questions --clean  # remove then recreate
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import AnswerOption, FeedbackQuestion, Translation

# ---------------------------------------------------------------------------
# Canonical question definitions — exported from the development database.
# Update this list whenever questions are added or changed.
# ---------------------------------------------------------------------------

FEEDBACK_QUESTIONS = [
    {
        "questionSubject": "Intervention",
        "questionKey": "rating_stars_education",
        "answer_type": "select",
        "icfCode": "",
        "applicable_types": [
            "Education",
            "Instruction",
            "Text",
            "PDF",
            "Video",
            "Audio",
            "Website",
            "Apps",
        ],
        "translations": [
            {"language": "en", "text": "How did you like the content?"},
            {"language": "de", "text": "Wie fandest du den Inhalt?"},
            {"language": "fr", "text": "Comment avez-vous trouvé le contenu ?"},
            {"language": "nl", "text": "Wat vond je van de inhoud?"},
            {"language": "pt", "text": "O que achou do conteúdo?"},
        ],
        "possibleAnswers": [
            {
                "key": "1",
                "translations": [
                    {"language": "en", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "de", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "fr", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "nl", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "pt", "text": "★☆☆☆☆ (1/5)"},
                ],
            },
            {
                "key": "2",
                "translations": [
                    {"language": "en", "text": "★★☆☆☆ (2/5)"},
                    {"language": "de", "text": "★★☆☆☆ (2/5)"},
                    {"language": "fr", "text": "★★☆☆☆ (2/5)"},
                    {"language": "nl", "text": "★★☆☆☆ (2/5)"},
                    {"language": "pt", "text": "★★☆☆☆ (2/5)"},
                ],
            },
            {
                "key": "3",
                "translations": [
                    {"language": "en", "text": "★★★☆☆ (3/5)"},
                    {"language": "de", "text": "★★★☆☆ (3/5)"},
                    {"language": "fr", "text": "★★★☆☆ (3/5)"},
                    {"language": "nl", "text": "★★★☆☆ (3/5)"},
                    {"language": "pt", "text": "★★★☆☆ (3/5)"},
                ],
            },
            {
                "key": "4",
                "translations": [
                    {"language": "en", "text": "★★★★☆ (4/5)"},
                    {"language": "de", "text": "★★★★☆ (4/5)"},
                    {"language": "fr", "text": "★★★★☆ (4/5)"},
                    {"language": "nl", "text": "★★★★☆ (4/5)"},
                    {"language": "pt", "text": "★★★★☆ (4/5)"},
                ],
            },
            {
                "key": "5",
                "translations": [
                    {"language": "en", "text": "★★★★★ (5/5)"},
                    {"language": "de", "text": "★★★★★ (5/5)"},
                    {"language": "fr", "text": "★★★★★ (5/5)"},
                    {"language": "nl", "text": "★★★★★ (5/5)"},
                    {"language": "pt", "text": "★★★★★ (5/5)"},
                ],
            },
        ],
    },
    {
        "questionSubject": "Intervention",
        "questionKey": "rating_stars_exercise",
        "answer_type": "select",
        "icfCode": "",
        "applicable_types": [
            "Exercise",
            "Exercises",
            "Physiotherapy",
            "Training",
            "Movement",
        ],
        "translations": [
            {"language": "en", "text": "How did you like the exercise?"},
            {"language": "de", "text": "Wie fandest du die Übung?"},
            {"language": "fr", "text": "Comment avez-vous trouvé l'exercice ?"},
            {"language": "nl", "text": "Wat vond je van de oefening?"},
            {"language": "pt", "text": "O que achou do exercício?"},
        ],
        "possibleAnswers": [
            {
                "key": "1",
                "translations": [
                    {"language": "en", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "de", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "fr", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "nl", "text": "★☆☆☆☆ (1/5)"},
                    {"language": "pt", "text": "★☆☆☆☆ (1/5)"},
                ],
            },
            {
                "key": "2",
                "translations": [
                    {"language": "en", "text": "★★☆☆☆ (2/5)"},
                    {"language": "de", "text": "★★☆☆☆ (2/5)"},
                    {"language": "fr", "text": "★★☆☆☆ (2/5)"},
                    {"language": "nl", "text": "★★☆☆☆ (2/5)"},
                    {"language": "pt", "text": "★★☆☆☆ (2/5)"},
                ],
            },
            {
                "key": "3",
                "translations": [
                    {"language": "en", "text": "★★★☆☆ (3/5)"},
                    {"language": "de", "text": "★★★☆☆ (3/5)"},
                    {"language": "fr", "text": "★★★☆☆ (3/5)"},
                    {"language": "nl", "text": "★★★☆☆ (3/5)"},
                    {"language": "pt", "text": "★★★☆☆ (3/5)"},
                ],
            },
            {
                "key": "4",
                "translations": [
                    {"language": "en", "text": "★★★★☆ (4/5)"},
                    {"language": "de", "text": "★★★★☆ (4/5)"},
                    {"language": "fr", "text": "★★★★☆ (4/5)"},
                    {"language": "nl", "text": "★★★★☆ (4/5)"},
                    {"language": "pt", "text": "★★★★☆ (4/5)"},
                ],
            },
            {
                "key": "5",
                "translations": [
                    {"language": "en", "text": "★★★★★ (5/5)"},
                    {"language": "de", "text": "★★★★★ (5/5)"},
                    {"language": "fr", "text": "★★★★★ (5/5)"},
                    {"language": "nl", "text": "★★★★★ (5/5)"},
                    {"language": "pt", "text": "★★★★★ (5/5)"},
                ],
            },
        ],
    },
    {
        "questionSubject": "Intervention",
        "questionKey": "difficulty_scale",
        "answer_type": "select",
        "icfCode": "",
        "applicable_types": ["All"],
        "translations": [
            {"language": "en", "text": "The content / exercise was…"},
            {"language": "de", "text": "Den Inhalt / Die Übung fand ich…"},
            {"language": "fr", "text": "Le contenu / l'exercice était…"},
            {"language": "nl", "text": "De inhoud / oefening was…"},
            {"language": "pt", "text": "O conteúdo / exercício foi…"},
        ],
        "possibleAnswers": [
            {
                "key": "too_difficult",
                "translations": [
                    {"language": "en", "text": "Too difficult"},
                    {"language": "de", "text": "Zu schwierig"},
                    {"language": "fr", "text": "Trop difficile"},
                    {"language": "nl", "text": "Te moeilijk"},
                    {"language": "pt", "text": "Difícil demais"},
                ],
            },
            {
                "key": "just_right",
                "translations": [
                    {"language": "en", "text": "Just right"},
                    {"language": "de", "text": "Genau richtig"},
                    {"language": "fr", "text": "Juste comme il faut"},
                    {"language": "nl", "text": "Precies goed"},
                    {"language": "pt", "text": "No ponto certo"},
                ],
            },
            {
                "key": "too_easy",
                "translations": [
                    {"language": "en", "text": "Too easy"},
                    {"language": "de", "text": "Zu einfach"},
                    {"language": "fr", "text": "Trop facile"},
                    {"language": "nl", "text": "Te makkelijk"},
                    {"language": "pt", "text": "Fácil demais"},
                ],
            },
        ],
    },
    {
        "questionSubject": "Intervention",
        "questionKey": "open_feedback",
        "answer_type": "text",
        "icfCode": "",
        "applicable_types": ["All"],
        "translations": [
            {"language": "en", "text": "Any additional feedback? (text or audio)"},
            {"language": "de", "text": "Hast du zusätzliches Feedback? (Text oder Audio)"},
            {"language": "fr", "text": "Avez-vous un commentaire supplémentaire ? (texte ou audio)"},
            {"language": "nl", "text": "Nog extra feedback? (tekst of audio)"},
            {"language": "pt", "text": "Algum feedback adicional? (texto ou áudio)"},
        ],
        "possibleAnswers": [],
    },
]

# Keys managed by this command (used by --clean)
_SEEDED_KEYS = {q["questionKey"] for q in FEEDBACK_QUESTIONS}


class Command(BaseCommand):
    help = (
        "Upsert canonical FeedbackQuestion records exported from the "
        "development database.  Safe to run on every deployment."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help=(
                "Remove the seeded questions before recreating them.  "
                "Only removes the keys managed by this command; custom "
                "questions added via the admin panel are untouched."
            ),
        )

    def handle(self, *args, **options):
        if options["clean"]:
            self._clean()

        created_count = 0
        updated_count = 0

        for q in FEEDBACK_QUESTIONS:
            translations = [
                Translation(language=t["language"], text=t["text"])
                for t in q["translations"]
            ]
            possible_answers = [
                AnswerOption(
                    key=a["key"],
                    translations=[
                        Translation(language=t["language"], text=t["text"])
                        for t in a["translations"]
                    ],
                )
                for a in q["possibleAnswers"]
            ]

            existing = FeedbackQuestion.objects(questionKey=q["questionKey"]).first()

            if existing:
                existing.questionSubject = q["questionSubject"]
                existing.answer_type = q["answer_type"]
                existing.icfCode = q["icfCode"]
                existing.applicable_types = q["applicable_types"]
                existing.translations = translations
                existing.possibleAnswers = possible_answers
                existing.save()
                updated_count += 1
                self.stdout.write(f"  Updated : {q['questionKey']}")
            else:
                FeedbackQuestion(
                    questionSubject=q["questionSubject"],
                    questionKey=q["questionKey"],
                    answer_type=q["answer_type"],
                    icfCode=q["icfCode"],
                    applicable_types=q["applicable_types"],
                    translations=translations,
                    possibleAnswers=possible_answers,
                    createdAt=timezone.now(),
                ).save()
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  Created : {q['questionKey']}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_feedback_questions complete: "
                f"{created_count} created, {updated_count} updated."
            )
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _clean(self):
        """Remove only the questions managed by this command."""
        removed = 0
        for key in _SEEDED_KEYS:
            deleted = FeedbackQuestion.objects(questionKey=key).delete()
            if deleted:
                self.stdout.write(f"  Removed : {key}")
                removed += deleted
        self.stdout.write(f"  {removed} question(s) removed.")
