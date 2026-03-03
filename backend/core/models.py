import os
import random
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from mongoengine import (
    BooleanField,
    DateTimeField,
    DictField,
    Document,
    DynamicField,
    EmailField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    FileField,
    FloatField,
    IntField,
    ListField,
    ReferenceField,
    StringField,
)

from utils.config import config

all_diagnoses = [
    diagnosis for category in config["patientInfo"]["function"].values() for diagnosis in category["diagnosis"]
]


class SMSVerification(Document):
    meta = {"collection": "2f_auth"}
    userId = StringField(max_length=255, required=True)
    code = StringField(max_length=6, required=True)
    created_at = DateTimeField(default=timezone.now)
    expires_at = DateTimeField(required=True)

    def __str__(self):
        return f"{self.userId} (User)"


class User(Document):
    meta = {"collection": "users"}
    username = StringField(max_length=150, required=True)
    role = StringField(choices=["Therapist", "Patient", "Admin"], default="Therapist")
    createdAt = DateTimeField(required=True)
    updatedAt = DateTimeField(default=timezone.now)
    email = EmailField(required=False)
    phone = StringField(max_length=20, required=False)
    pwdhash = StringField()
    isActive = BooleanField(default=False)

    def __str__(self):
        return f"{self.username} (User)"


class FitbitUserToken(Document):
    user = ReferenceField(User, required=True, unique=True)
    access_token = StringField(required=True, max_length=2048)
    refresh_token = StringField(required=True, max_length=2048)
    expires_at = DateTimeField()
    fitbit_user_id = StringField(required=True)


class HeartRateZone(EmbeddedDocument):
    name = StringField()
    minutes = IntField()
    caloriesOut = FloatField()
    min = IntField()
    max = IntField()


class SleepData(EmbeddedDocument):
    sleep_duration = IntField()  # in ms
    sleep_start = StringField()  # ISO datetime string
    sleep_end = StringField()  # ISO datetime string
    awakenings = IntField()


class ActivityLevel(EmbeddedDocument):
    sedentary = IntField()
    lightly = IntField()
    fairly = IntField()
    very = IntField()


class ActivityHeartRateZone(EmbeddedDocument):
    name = StringField()
    min = IntField()
    max = IntField()
    minutes = IntField()


class ExerciseSession(EmbeddedDocument):
    logId = IntField()
    name = StringField()
    startTime = StringField()
    duration = IntField()  # ms
    calories = IntField()
    averageHeartRate = IntField()
    maxHeartRate = IntField()
    steps = IntField()
    distance = FloatField()
    elevationGain = FloatField()
    speed = FloatField()
    activeZoneMinutes = IntField()

    heartRateZones = ListField(EmbeddedDocumentField(ActivityHeartRateZone))
    activityLevel = EmbeddedDocumentField(ActivityLevel)


class FitbitData(Document):
    user = ReferenceField(User, required=True)
    date = DateTimeField(required=True, unique_with="user")

    # Core activity & heart rate
    steps = IntField()
    resting_heart_rate = IntField()
    heart_rate_zones = ListField(EmbeddedDocumentField(HeartRateZone))

    # highest HR reached during the day (from intraday or activities)
    max_heart_rate = IntField()

    # Physical activity
    floors = IntField()
    distance = FloatField()  # km
    calories = FloatField()
    active_minutes = IntField()

    # Sleep
    sleep = EmbeddedDocumentField(SleepData)

    # Detailed physiological signals
    breathing_rate = DictField()  # e.g., {"breathingRate": 14}
    hrv = DictField()  # e.g., {"dailyRmssd": 33}

    # 🚩 CHANGE THIS FIELD
    # Old:
    # exercise = DictField()
    # New: allow both legacy list and new {"sessions": [...]} dict
    exercise = DynamicField()

    # Inactivity
    inactivity_minutes = IntField()

    # Imported from PatientVitals (OPTION B)
    weight_kg = FloatField()
    bp_sys = IntField()
    bp_dia = IntField()

    meta = {
        "indexes": ["user", "date"],
        "ordering": ["-date"],
    }


class Logs(Document):
    meta = {"collection": "logs"}  # MongoDB collection
    userId = ReferenceField(User, required=True)
    action = StringField(
        choices=[
            "LOGIN",
            "LOGOUT",
            "UPDATE_PROFILE",
            "DELETE_ACCOUNT",
            "OTHER",
            "REHATABLE",
            "HEALTH_PAGE",
        ],
        default="Therapist",
        required=True,
    )
    timestamp = DateTimeField(default=timezone.now)
    ended = DateTimeField(required=False, null=True)  # Optional end time for actions like "REHATABLE"
    started = DateTimeField(required=False, null=True)  # Optional start time for actions like "REHATABLE"
    userAgent = StringField(max_length=20, required=True)
    patient = ReferenceField("Patient", required=False, null=True)  # Optional, for actions related to patients
    details = StringField(max_length=1000)

    def __str__(self):
        return f"{self.userId} (Logs)"


# Feedback Translation Structure
class Translation(EmbeddedDocument):
    language = StringField(required=True)
    text = StringField(required=True)


# Answer option with multi-language translations
class AnswerOption(EmbeddedDocument):
    key = StringField(required=True)  # Internal key like "yes", "no"
    translations = ListField(EmbeddedDocumentField(Translation))


class FeedbackEntry(EmbeddedDocument):
    questionId = ReferenceField("FeedbackQuestion", required=True)
    answerKey = ListField(EmbeddedDocumentField(AnswerOption))  # Unique key from possibleAnswers
    comment = StringField(default="")
    date = DateTimeField(default=timezone.now)
    audio_url = StringField(null=True)


# Feedback question
class FeedbackQuestion(Document):
    meta = {"collection": "FeedbackQuestions"}
    questionSubject = StringField(required=True, choices=["Intervention", "Healthstatus"])
    questionKey = StringField(required=True, unique=True)
    translations = ListField(EmbeddedDocumentField(Translation))
    possibleAnswers = ListField(EmbeddedDocumentField(AnswerOption))  # New structure
    answer_type = StringField(required=True, choices=["multi-select", "text", "select"])
    icfCode = StringField(default="")
    createdAt = DateTimeField(default=timezone.now)
    applicable_types = ListField(StringField())  # e.g., ["Exercises", "Video", "Apps"]


# Simplified PatientType (per intervention)
class PatientType(EmbeddedDocument):
    type = StringField(required=True, choices=config["therapistInfo"]["specializations"])
    diagnosis = StringField(
        max_length=200,
        choices=[d for cat in config["patientInfo"]["function"].values() for d in cat["diagnosis"]] + ["All"],
    )
    frequency = StringField(required=True, choices=config["RecomendationInfo"]["frequency"])
    include_option = BooleanField(default=True)


class InterventionMedia(EmbeddedDocument):
    kind = StringField(required=True, choices=["external", "file"])
    media_type = StringField(
        required=True,
        choices=[
            "audio",
            "video",
            "image",
            "pdf",
            "website",
            "app",
            "streaming",
            "text",
        ],
    )

    provider = StringField(required=False, null=True)
    title = StringField(required=False, null=True)

    url = StringField(required=False, null=True)  # kind=external
    embed_url = StringField(required=False, null=True)  # optional
    file_path = StringField(required=False, null=True)  # kind=file
    mime = StringField(required=False, null=True)

    thumbnail = StringField(required=False, null=True)


class Intervention(Document):
    meta = {
        "collection": "Interventions",
        "indexes": [
            {"fields": ["external_id", "language"], "unique": True},
            "external_id",
            "language",
            "content_type",
        ],
    }

    external_id = StringField(required=True)
    language = StringField(required=True)  # normalized: "en","de","fr","it",...
    provider = StringField(required=False, null=True)

    title = StringField(required=True)
    description = StringField(required=True)

    content_type = StringField(required=True)  # validate against taxonomy in BE

    # Excel-aligned metadata (recommended)
    input_from = StringField(required=False, null=True)
    lc9 = ListField(StringField(), default=list)
    original_language = StringField(required=False, null=True)
    primary_diagnosis = StringField(required=False, null=True)
    aim = StringField(required=False, null=True)
    topic = ListField(StringField(), default=list)
    cognitive_level = StringField(required=False, null=True)
    physical_level = StringField(required=False, null=True)
    frequency_time = StringField(required=False, null=True)
    timing = StringField(required=False, null=True)
    duration_bucket = StringField(required=False, null=True)
    sex_specific = StringField(required=False, null=True)
    where = ListField(StringField(), default=list)
    setting = ListField(StringField(), default=list)
    keywords = ListField(StringField(), default=list)

    # ✅ Only media source of truth
    media = ListField(EmbeddedDocumentField(InterventionMedia), default=list)

    preview_img = StringField()
    duration = IntField()

    patient_types = ListField(EmbeddedDocumentField("PatientType"))

    is_private = BooleanField(default=False)
    private_patient_id = ReferenceField("Patient", required=False, null=True)


# General Feedback – site-wide, not per intervention
class GeneralFeedback(Document):
    meta = {"collection": "general_feedback"}
    patient_id = ReferenceField("Patient", required=True)
    feedback_entries = ListField(EmbeddedDocumentField(FeedbackEntry))
    createdAt = DateTimeField(default=timezone.now)


# Logs for daily intervention execution
class PatientInterventionLogs(Document):
    meta = {"collection": "InterventionLogs"}
    userId = ReferenceField("Patient", required=True)
    interventionId = ReferenceField("Intervention", required=True)
    rehabilitationPlanId = ReferenceField("RehabilitationPlan", required=True)
    date = DateTimeField(required=True)
    status = ListField(StringField(choices=["completed", "skipped", "upcoming", "postponed"]))
    feedback = ListField(EmbeddedDocumentField(FeedbackEntry))
    comments = StringField()
    createdAt = DateTimeField(default=timezone.now)
    updatedAt = DateTimeField(default=timezone.now)
    video_url = StringField(null=True)  # new
    video_expired = BooleanField(default=False)  # new


class InterventionAssignment(EmbeddedDocument):
    interventionId = ReferenceField(Intervention, required=True)  # References 'interventions' collection
    frequency = StringField()  # Frequency details (e.g., "3 times per week")
    dates = ListField(DateTimeField())  # List of scheduled dates/times for this intervention
    notes = StringField()  # Additional notes on the intervention
    require_video_feedback = BooleanField(default=False)  # Whether video feedback is required


# core/models.py


class DiagnosisAssignmentSettings(EmbeddedDocument):
    # existing
    active = BooleanField(default=True)
    interval = IntField(default=1)
    unit = StringField(choices=["day", "week", "month"], default="week")
    selected_days = ListField(StringField())
    end_type = StringField(default="count")  # legacy
    count_limit = IntField()  # legacy 'count'

    # NEW
    start_day = IntField(default=1)  # Day S (1-based)
    end_day = IntField()  # Day N (optional, else derive)
    suggested_execution_time = IntField()  # minutes (optional)


class DefaultInterventions(EmbeddedDocument):
    recommendation = ReferenceField(Intervention, required=True)
    # allow **list of blocks** per diagnosis: { "Stroke": [block1, block2, ...] }
    diagnosis_assignments = DictField(ListField(EmbeddedDocumentField(DiagnosisAssignmentSettings)))


# core/models.py
class Therapist(Document):
    meta = {"collection": "Therapists"}
    userId = ReferenceField(User, required=True)
    name = StringField(max_length=20)
    first_name = StringField(max_length=20)
    created_at = DateTimeField(default=timezone.now)

    specializations = ListField(
        StringField(max_length=200),
        choices=config["therapistInfo"]["specializations"],
    )

    clinics = ListField(
        StringField(max_length=200),
        choices=list((config["therapistInfo"].get("clinic_projects") or {}).keys()),
    )

    # ✅ store one or more projects the therapist is working with
    # core/models.py
    projects = ListField(
        StringField(max_length=100, choices=config["therapistInfo"]["projects"]),
        default=list,
    )

    default_recommendations = ListField(EmbeddedDocumentField(DefaultInterventions), default=list)


# models.py
class RedcapParticipant(Document):
    meta = {"collection": "Participants"}

    record_id = StringField(required=True, unique=True)  # REDCap record_id

    gender = StringField(default="")  # keep as string (REDCap codes vary)
    primary_diagnosis = StringField(default="")
    clinic = StringField(default="")

    assigned_therapist = ListField(ReferenceField(Therapist))
    imported_by_user = ReferenceField("User")  # who imported/linked
    last_synced_at = DateTimeField()
    created_at = DateTimeField(default=timezone.now)
    updated_at = DateTimeField(default=timezone.now)

    is_active = BooleanField(default=True)

    meta = {"indexes": ["record_id", "assigned_therapist", "clinic"]}


# ---------------------------
# NEW: Embedded thresholds doc
# ---------------------------
class PatientThresholds(EmbeddedDocument):
    # Steps
    steps_goal = IntField(default=10000)

    # Active minutes (color thresholds)
    active_minutes_green = IntField(default=30)
    active_minutes_yellow = IntField(default=20)

    # Sleep thresholds (in minutes)
    sleep_green_min = IntField(default=7 * 60)
    sleep_yellow_min = IntField(default=6 * 60)

    # Blood pressure thresholds (mmHg)
    bp_sys_green_max = IntField(default=129)
    bp_sys_yellow_max = IntField(default=139)
    bp_dia_green_max = IntField(default=84)
    bp_dia_yellow_max = IntField(default=89)


class PatientThresholdsSnapshot(EmbeddedDocument):
    effective_from = DateTimeField(required=True, default=timezone.now)
    reason = StringField(default="")
    changed_by = StringField(default="")
    thresholds = EmbeddedDocumentField("PatientThresholds", required=True)


class Patient(Document):
    meta = {"collection": "Patients"}

    # ✅ Platform linking / auth
    userId = ReferenceField("User", required=True)

    # ✅ Connector to REDCap (pat_id)
    patient_code = StringField(max_length=30, required=True, unique=True)

    # ✅ Platform relationships
    therapist = ReferenceField("Therapist", required=True)

    # ✅ Access fields (platform)
    access_word = StringField(max_length=100, required=False, default="")

    # ✅ Only if you still use it; otherwise remove
    pwdhash = StringField(required=False, default="")

    # ✅ Platform-specific settings
    thresholds = EmbeddedDocumentField("PatientThresholds", default=lambda: PatientThresholds())
    thresholds_history = ListField(EmbeddedDocumentField("PatientThresholdsSnapshot"), default=list)

    # ✅ Optional platform fields (can also come from REDCap)
    clinic = StringField(max_length=120, default="")
    last_clinic_visit = DateTimeField(required=False, null=True)

    # ✅ Optional “profile” fields (REDCap source of truth)
    name = StringField(max_length=80, required=False, default="")
    first_name = StringField(max_length=80, required=False, default="")
    age = StringField(max_length=20, required=False, default="")

    sex = StringField(max_length=20, required=False, default="")  # removed choices constraint to avoid mismatch
    diagnosis = ListField(StringField(max_length=120), required=False, default=list)
    function = ListField(StringField(max_length=200), required=False, default=list)

    level_of_education = StringField(max_length=60, required=False, default="")
    professional_status = StringField(max_length=60, required=False, default="")
    marital_status = StringField(max_length=60, required=False, default="")
    lifestyle = ListField(StringField(max_length=200), required=False, default=list)
    personal_goals = ListField(StringField(max_length=200), required=False, default=list)

    restrictions = StringField(max_length=200, required=False, default="")
    social_support = ListField(StringField(max_length=120), required=False, default=list)
    duration = IntField(required=False, null=True)
    care_giver = StringField(max_length=80, required=False, default="")
    initial_questionnaire_enabled = BooleanField(default=False)

    reha_end_date = DateTimeField(required=False, null=True)

    createdAt = DateTimeField(default=timezone.now)
    updatedAt = DateTimeField(default=timezone.now)

    preferred_language = StringField(
        max_length=10,
        choices=["en", "es", "fr", "de", "it", "nl", "sv", "zh", "ja", "ko"],
        default="en",
    )

    def save(self, *args, **kwargs):
        self.updatedAt = timezone.now()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.patient_code} (Patient)"


class HealthQuestionnaire(Document):
    meta = {"collection": "HealthQuestionnaires"}
    key = StringField(required=True, unique=True)  # e.g., "PHQ-9"
    title = StringField(required=True)  # human title
    description = StringField()
    questions = ListField(ReferenceField("FeedbackQuestion"))
    tags = ListField(StringField())
    createdAt = DateTimeField(default=timezone.now)


class QuestionnaireAssignment(EmbeddedDocument):
    questionnaireId = ReferenceField(HealthQuestionnaire, required=True)
    frequency = StringField()  # e.g., "Daily", "2 times / week", etc.
    dates = ListField(DateTimeField())  # next scheduled dates (optional bootstrap)
    notes = StringField()


class RehabilitationPlan(Document):
    meta = {"collection": "RehabilitationPlans"}

    patientId = ReferenceField(Patient, required=True)  # References 'patients' collection
    therapistId = ReferenceField(Therapist, required=True)  # References 'therapists' collection

    startDate = DateTimeField(required=True)  # Start date of the plan
    endDate = DateTimeField(required=True)  # End date of the plan
    status = StringField(choices=["active", "completed", "on_hold"], required=True)  # Plan status

    interventions = ListField(EmbeddedDocumentField(InterventionAssignment))  # List of assigned interventions
    questionnaires = ListField(EmbeddedDocumentField(QuestionnaireAssignment))
    createdAt = DateTimeField(default=timezone.now)  # Timestamp for creation
    updatedAt = DateTimeField(default=timezone.now)  # Timestamp for last update


class PatientICFRating(Document):
    meta = {"collection": "PatientICFRatings"}
    questionId = ReferenceField("FeedbackQuestion", required=True)
    patientId = ReferenceField(Patient, required=True)  # References 'patients' collection
    icfCode = StringField(required=True)  # Official ICF code (e.g., "b28013" for "Pain in back")
    date = DateTimeField(default=timezone.now)  # Date of the rating record
    rating = IntField()  # Score level (e.g., 0-4 or 0-10 scale)
    feedback_entries = ListField(EmbeddedDocumentField(FeedbackEntry))
    notes = StringField()  # Additional notes or observations


# core/models.py
class PatientVitals(Document):
    user = ReferenceField(User, required=True)  # same as FitbitData.user
    patientId = ReferenceField(Patient, required=True)
    date = DateTimeField(required=True)  # store full dt; you can normalize to local midnight when aggregating
    weight_kg = FloatField(null=True)
    bp_sys = IntField(null=True)
    bp_dia = IntField(null=True)
    source = StringField(choices=["manual", "device", "provider"], default="manual")
    origin = StringField(default="patient_page")  # optional—for where it came from
    note = StringField()
    createdAt = DateTimeField(default=timezone.now)
    createdBy = ReferenceField(User)  # therapist who entered, if applicable
    meta = {
        "indexes": [
            ("patientId", "date"),  # fast range queries
        ]
    }


class PasswordAttempt(Document):
    user = ReferenceField(User)
    count = IntField(default=0)
    last_attempt = DateTimeField(default=timezone.now)  # instead of datetime.utcnow

    meta = {"collection": "password_attempts"}


class HealthSliderEntry(Document):
    """
    One saved item (one question answer) for HealthSlider.
    participant_id is user-entered (not DB user id).
    """

    participant_id = StringField(required=True)
    session_id = StringField(required=True)
    question_index = IntField(required=True)  # 0-based
    answer_value = FloatField(null=True)  # or IntField, but float allows future scale
    has_audio = BooleanField(default=False)
    question_text = StringField(required=True)

    # Storage path (MEDIA storage), e.g. "healthslider/SUBJ_001/20260112T093000/SUBJ_001_q01.webm"
    audio_file = StringField(default="")  # storage path
    audio_name = StringField(default="")  # user-friendly filename (for FE)
    audio_mime = StringField()  # "audio/webm", "audio/wav", ...

    answered_at = DateTimeField(default=timezone.now)

    meta = {
        "indexes": [
            ("participant_id", "session_id"),
            ("participant_id", "session_id", "question_index"),
            ("answered_at",),
        ]
    }
