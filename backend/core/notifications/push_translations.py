# Push notification title/body text, by language and category.

PUSH_TRANSLATIONS = {
    "de": {
        "education": {
            "title": "Schon gewusst?",
            "body": "Entdecken Sie Wissenswertes rund um Ihre Gesundheit und Ihren Alltag.",
        },
        "instructions": {
            "title": "Gut zu wissen",
            "body": "Wir haben eine praktische Anleitung für Sie – einfach erklärt und leicht umzusetzen.",
        },
        "exercise": {
            "title": "Bereit für etwas Bewegung?",
            "body": "Ihre nächste Bewegungseinheit wartet auf Sie. Viel Freude dabei!",
        },
        "reminder": {
            "title": "Kurze Erinnerung",
            "body": "",
        },
        "behavior_change": {
            "title": "Ein kleiner Impuls",
            "body": "Eine Idee, die Ihnen im Alltag hilfreich sein kann.",
        },
        "other": {
            "title": "Für Sie vorbereitet",
            "body": "Es gibt etwas Neues in Ihrem Programm zu entdecken.",
        },
    },
    "en": {
        "education": {
            "title": "Did you know?",
            "body": "Discover useful facts about your health and everyday life.",
        },
        "instructions": {
            "title": "Good to know",
            "body": "We've prepared a handy guide for you – simply explained and easy to follow.",
        },
        "exercise": {
            "title": "Ready to move?",
            "body": "Your next exercise session is waiting for you. Enjoy!",
        },
        "reminder": {
            "title": "Quick reminder",
            "body": "",
        },
        "behavior_change": {
            "title": "A little nudge",
            "body": "An idea that might help you in everyday life.",
        },
        "other": {
            "title": "Prepared for you",
            "body": "There's something new to discover in your program.",
        },
    },
    "fr": {
        "education": {
            "title": "Le saviez-vous ?",
            "body": "Découvrez des informations utiles sur votre santé et votre quotidien.",
        },
        "instructions": {
            "title": "Bon à savoir",
            "body": "Nous avons préparé un guide pratique pour vous – simple et facile à suivre.",
        },
        "exercise": {
            "title": "Prêt à bouger ?",
            "body": "Votre prochaine séance d'exercice vous attend. Profitez-en bien !",
        },
        "reminder": {
            "title": "Petit rappel",
            "body": "",
        },
        "behavior_change": {
            "title": "Une petite impulsion",
            "body": "Une idée qui pourrait vous être utile au quotidien.",
        },
        "other": {
            "title": "Préparé pour vous",
            "body": "Il y a du nouveau à découvrir dans votre programme.",
        },
    },
    "it": {
        "education": {
            "title": "Lo sapevi?",
            "body": "Scopri informazioni utili sulla tua salute e la vita di tutti i giorni.",
        },
        "instructions": {
            "title": "Utile da sapere",
            "body": "Abbiamo preparato una guida pratica per te, spiegata in modo semplice e facile da seguire.",
        },
        "exercise": {
            "title": "Pronto per muoverti?",
            "body": "Il tuo prossimo esercizio ti aspetta. Buon divertimento!",
        },
        "reminder": {
            "title": "Promemoria",
            "body": "",
        },
        "behavior_change": {
            "title": "Un piccolo spunto",
            "body": "Un'idea che può esserti utile nella vita di tutti i giorni.",
        },
        "other": {
            "title": "Preparato per te",
            "body": "C'è qualcosa di nuovo da scoprire nel tuo programma.",
        },
    },
    "nl": {
        "education": {
            "title": "Wist u dat?",
            "body": "Ontdek nuttige informatie over uw gezondheid en dagelijks leven.",
        },
        "instructions": {
            "title": "Goed om te weten",
            "body": "We hebben een handige gids voor u klaargemaakt – eenvoudig uitgelegd en makkelijk toe te passen.",
        },
        "exercise": {
            "title": "Klaar om te bewegen?",
            "body": "Uw volgende beweegmoment wacht op u. Veel plezier!",
        },
        "reminder": {
            "title": "Korte herinnering",
            "body": "",
        },
        "behavior_change": {
            "title": "Een kleine impuls",
            "body": "Een idee dat u in het dagelijks leven kan helpen.",
        },
        "other": {
            "title": "Voor u klaargezet",
            "body": "Er is iets nieuws te ontdekken in uw programma.",
        },
    },
    "pt": {
        "education": {
            "title": "Sabia que...?",
            "body": "Descubra informações úteis sobre a sua saúde e o seu dia a dia.",
        },
        "instructions": {
            "title": "Bom saber",
            "body": "Preparámos um guia prático para si – explicado de forma simples e fácil de seguir.",
        },
        "exercise": {
            "title": "Pronto para se mexer?",
            "body": "A sua próxima sessão de exercício está à sua espera. Divirta-se!",
        },
        "reminder": {
            "title": "Breve lembrete",
            "body": "",
        },
        "behavior_change": {
            "title": "Um pequeno impulso",
            "body": "Uma ideia que pode ajudá-lo no seu dia a dia.",
        },
        "other": {
            "title": "Preparado para si",
            "body": "Há algo novo para descobrir no seu programa.",
        },
    },
}

# Patient.preferred_language supports es/sv/zh/ja/ko too, which push content
# doesn't cover — fall back to English for those.
PUSH_LANG_FALLBACK = {"es": "en", "sv": "en", "zh": "en", "ja": "en", "ko": "en"}


def get_push_content(language: str, category: str) -> dict:
    lang = language if language in PUSH_TRANSLATIONS else PUSH_LANG_FALLBACK.get(language, "en")
    bucket = PUSH_TRANSLATIONS.get(lang, PUSH_TRANSLATIONS["en"])
    return bucket.get(category, bucket["other"])
