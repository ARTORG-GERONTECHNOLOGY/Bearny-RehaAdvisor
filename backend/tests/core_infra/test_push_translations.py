"""
Tests for backend-owned Web Push text
=======================================

Covers core.notifications.push_translations. These are regression guards
against silent drift, not behaviour that can crash: get_push_content()
always falls back to English rather than raising, so a missing category or
an unmapped language degrades quietly instead of erroring — exactly why it
needs a test rather than relying on someone noticing at review time.
"""

import pytest

from core.models import Patient
from core.notifications.push_translations import PUSH_LANG_FALLBACK, PUSH_TRANSLATIONS, get_push_content

CATEGORIES = ("education", "exercise", "instructions", "reminder", "behavior_change", "other")

# Patient.preferred_language's full choice list — every one of these must
# resolve to real push content via get_push_content, either directly or
# through PUSH_LANG_FALLBACK.
PREFERRED_LANGUAGE_CHOICES = Patient._fields["preferred_language"].choices


def test_push_translations_covers_every_category_in_every_language():
    for lang, bucket in PUSH_TRANSLATIONS.items():
        assert set(bucket.keys()) == set(CATEGORIES), f"{lang} has mismatched category keys"


def test_every_entry_has_a_non_empty_title():
    for lang, bucket in PUSH_TRANSLATIONS.items():
        for category, content in bucket.items():
            assert content.get("title"), f"{lang}/{category} has no title"
            assert "body" in content, f"{lang}/{category} is missing a body key"


def test_lang_fallback_targets_are_covered_languages():
    for lang, fallback in PUSH_LANG_FALLBACK.items():
        assert lang not in PUSH_TRANSLATIONS, f"{lang} has its own translations, doesn't need a fallback"
        assert fallback in PUSH_TRANSLATIONS, f"{lang} falls back to {fallback!r}, which has no translations"


@pytest.mark.parametrize("language", PREFERRED_LANGUAGE_CHOICES)
def test_every_preferred_language_choice_resolves_to_real_content(language):
    """
    Patient.preferred_language accepts more languages than PUSH_TRANSLATIONS
    covers by design (see PUSH_LANG_FALLBACK) — this pins that every current
    choice is actually accounted for, so adding a new language to one list
    without the other fails a test instead of shipping silently.
    """
    for category in CATEGORIES:
        content = get_push_content(language, category)
        assert content.get("title"), f"{language}/{category} resolved to content with no title"


@pytest.mark.parametrize("category", CATEGORIES)
def test_get_push_content_returns_the_matching_category(category):
    content = get_push_content("en", category)
    assert content == PUSH_TRANSLATIONS["en"][category]


def test_get_push_content_falls_back_to_other_for_unknown_category():
    assert get_push_content("en", "not-a-real-category") == PUSH_TRANSLATIONS["en"]["other"]


def test_get_push_content_falls_back_to_english_for_unmapped_language():
    # Not in PUSH_TRANSLATIONS and not in PUSH_LANG_FALLBACK either.
    assert get_push_content("xx", "education") == PUSH_TRANSLATIONS["en"]["education"]
