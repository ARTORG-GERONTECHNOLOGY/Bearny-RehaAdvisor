import os
import random
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from mongoengine import (
    BooleanField,
    DateTimeField,
    DictField,
    Document,
    EmailField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    IntField,
    ListField,
    ReferenceField,
    StringField,
    FloatField,
    DynamicField,
)

from utils.config import config

all_diagnoses = [
    diagnosis
    for category in config["patientInfo"]["function"].values()
    for diagnosis in category["diagnosis"]
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
    meta = {"collection": "users"}  # MongoDB collection
    username = StringField(max_length=150, required=True)
    role = StringField(choices=["Therapist", "Patient", "Admin"], default="Therapist")
    createdAt = DateTimeField(required=True)
    updatedAt = DateTimeField(default=timezone.now)
    email = EmailField(unique=True, required=True)
    phone = StringField(max_length=20, required=True)
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
    sleep_end = StringField()    # ISO datetime string
    awakenings = IntField()

class FitbitData(Document):
    user = ReferenceField(User, required=True)
    date = DateTimeField(required=True, unique_with="user")

    # Core activity & heart rate
    steps = IntField()
    resting_heart_rate = IntField()
    heart_rate_zones = ListField(EmbeddedDocumentField(HeartRateZone))

    # Physical activity
    floors = IntField()
    distance = FloatField()  # in km or miles depending on user setting
    calories = FloatField()
    active_minutes = IntField()

    # Sleep
    sleep = EmbeddedDocumentField(SleepData)

    # Detailed physiological signals
    breathing_rate = DictField()    # Breaths per minute
    hrv = DictField()               # Heart rate variability metrics

    # Exercise logs
    exercise = DictField()          # Exercise session metadata (duration, type, etc.)
    inactivity_minutes = IntField()  # Minutes of inactivity
    meta = {
        'indexes': ['user', 'date'],
        'ordering': ['-date']
    }


class Logs(Document):
    meta = {"collection": "logs"}  # MongoDB collection
    userId = ReferenceField(User, required=True)
    action = StringField(
        choices=["LOGIN", "LOGOUT", "UPDATE_PROFILE", "DELETE_ACCOUNT", "OTHER", "REHATABLE", "HEALTH_PAGE"],
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
    answerKey = ListField(
        EmbeddedDocumentField(AnswerOption)
    )  # Unique key from possibleAnswers
    comment = StringField(default="")
    date = DateTimeField(default=timezone.now)
    audio_url = StringField(null=True)


# Feedback question
class FeedbackQuestion(Document):
    meta = {"collection": "FeedbackQuestions"}
    questionSubject = StringField(
        required=True, choices=["Intervention", "Healthstatus"]
    )
    questionKey = StringField(required=True, unique=True)
    translations = ListField(EmbeddedDocumentField(Translation))
    possibleAnswers = ListField(EmbeddedDocumentField(AnswerOption))  # New structure
    answer_type = StringField(required=True, choices=["multi-select", "text", "select"])
    icfCode = StringField(default="")
    createdAt = DateTimeField(default=timezone.now)
    applicable_types = ListField(StringField())   # e.g., ["Exercises", "Video", "Apps"]


# Simplified PatientType (per intervention)
class PatientType(EmbeddedDocument):
    type = StringField(
        required=True, choices=config["therapistInfo"]["specializations"]
    )
    diagnosis = StringField(
        max_length=200,
        choices=[
            d
            for cat in config["patientInfo"]["function"].values()
            for d in cat["diagnosis"]
        ]
        + ["All"],
    )
    frequency = StringField(
        required=True, choices=config["RecomendationInfo"]["frequency"]
    )
    include_option = BooleanField(default=True)


# Intervention Document
class Intervention(Document):
    meta = {"collection": "exercises"}
    title = StringField(required=True, unique=True)
    description = StringField(required=True)
    content_type = StringField(
        required=True, choices=config["RecomendationInfo"]["types"]
    )
    benefitFor = ListField(StringField())
    tags = ListField(StringField())
    link = StringField()
    media_file = StringField()
    preview_img = StringField()
    patient_types = ListField(EmbeddedDocumentField(PatientType))
    duration = IntField()
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
    status = ListField(
        StringField(choices=["completed", "skipped", "upcoming", "postponed"])
    )
    feedback = ListField(EmbeddedDocumentField(FeedbackEntry))
    comments = StringField()
    createdAt = DateTimeField(default=timezone.now)
    updatedAt = DateTimeField(default=timezone.now)
    video_url    = StringField(null=True)     # new
    video_expired= BooleanField(default=False) # new


class InterventionAssignment(EmbeddedDocument):
    interventionId = ReferenceField(
        Intervention, required=True
    )  # References 'interventions' collection
    frequency = StringField()  # Frequency details (e.g., "3 times per week")
    dates = ListField(
        DateTimeField()
    )  # List of scheduled dates/times for this intervention
    notes = StringField()  # Additional notes on the intervention
    require_video_feedback = BooleanField(default=False)  # Whether video feedback is required


# core/models.py

class DiagnosisAssignmentSettings(EmbeddedDocument):
    # existing
    active = BooleanField(default=True)
    interval = IntField(default=1)
    unit = StringField(choices=['day','week','month'], default='week')
    selected_days = ListField(StringField())
    end_type = StringField(default='count')  # legacy
    count_limit = IntField()                 # legacy 'count'

    # NEW
    start_day = IntField(default=1)              # Day S (1-based)
    end_day = IntField()                         # Day N (optional, else derive)
    suggested_execution_time = IntField()        # minutes (optional)


class DefaultInterventions(EmbeddedDocument):
    recommendation = ReferenceField(Intervention, required=True)
    #allow **list of blocks** per diagnosis: { "Stroke": [block1, block2, ...] }
    diagnosis_assignments = DictField(
        ListField(EmbeddedDocumentField(DiagnosisAssignmentSettings))
    )


class Therapist(Document):
    meta = {"collection": "Therapist"}
    userId = ReferenceField(User, required=True)
    name = StringField(max_length=20)
    first_name = StringField(max_length=20)
    created_at = DateTimeField(default=timezone.now)
    specializations = ListField(StringField(max_length=200),
                                choices=config["therapistInfo"]["specializations"])
    clinics = ListField(StringField(max_length=200),
                        choices=config["therapistInfo"]["clinics"])

    # Templates are **therapist-specific** here:
    default_recommendations = ListField(EmbeddedDocumentField(DefaultInterventions))


# models.py
class Patient(Document):
    meta = {"collection": "Patients"}

    userId = ReferenceField(User, required=True)
    # NEW: stable human-readable patient ID (copy of user.username at creation)
    patient_code = StringField(max_length=30, required=True)

    name = StringField(max_length=20, required=True)
    pwdhash = StringField()
    access_word = StringField(max_length=100, required=True)
    first_name = StringField(max_length=20, required=True)
    age = StringField(max_length=20, required=True)
    therapist = ReferenceField(Therapist, required=True)
    sex = StringField(max_length=10, choices=config["patientInfo"]["sex"], required=True)
    diagnosis = ListField(StringField(max_length=30), choices=all_diagnoses, required=True)
    function = ListField(StringField(max_length=200, choices=config["therapistInfo"]["specializations"]), required=True)
    level_of_education = StringField(max_length=30, choices=config["patientInfo"]["level_of_education"])
    professional_status = StringField(max_length=30, choices=config["patientInfo"]["professional_status"])
    marital_status = StringField(max_length=30, choices=config["patientInfo"]["marital_status"])
    lifestyle = ListField(StringField(max_length=200, choices=config["patientInfo"]["lifestyle"]))
    personal_goals = ListField(StringField(max_length=200, choices=config["patientInfo"]["personal_goals"]))
    restrictions = StringField(max_length=30)
    social_support = ListField(StringField(max_length=30))
    duration = IntField()
    care_giver = StringField(max_length=20, default="")
    reha_end_date = DateTimeField(required=True)

    clinic = StringField(max_length=120, default="")
    last_clinic_visit = DateTimeField(required=False, null=True)

    def __str__(self):
        return f"{self.patient_code} (Patient)"   # optional

class HealthQuestionnaire(Document):
    meta = {"collection": "HealthQuestionnaires"}
    key = StringField(required=True, unique=True)         # e.g., "PHQ-9"
    title = StringField(required=True)                    # human title
    description = StringField()
    questions = ListField(ReferenceField("FeedbackQuestion"))
    tags = ListField(StringField())
    createdAt = DateTimeField(default=timezone.now)

class QuestionnaireAssignment(EmbeddedDocument):
    questionnaireId = ReferenceField(HealthQuestionnaire, required=True)
    frequency = StringField()               # e.g., "Daily", "2 times / week", etc.
    dates = ListField(DateTimeField())      # next scheduled dates (optional bootstrap)
    notes = StringField()

class RehabilitationPlan(Document):
    meta = {"collection": "RehabilitationPlans"}

    patientId = ReferenceField(
        Patient, required=True
    )  # References 'patients' collection
    therapistId = ReferenceField(
        Therapist, required=True
    )  # References 'therapists' collection

    startDate = DateTimeField(required=True)  # Start date of the plan
    endDate = DateTimeField(required=True)  # End date of the plan
    status = StringField(
        choices=["active", "completed", "on_hold"], required=True
    )  # Plan status

    interventions = ListField(
        EmbeddedDocumentField(InterventionAssignment)
    )  # List of assigned interventions
    questionnaires = ListField(EmbeddedDocumentField(QuestionnaireAssignment))
    createdAt = DateTimeField(default=timezone.now)  # Timestamp for creation
    updatedAt = DateTimeField(default=timezone.now)  # Timestamp for last update


class PatientICFRating(Document):
    meta = {"collection": "PatientICFRatings"}
    questionId = ReferenceField("FeedbackQuestion", required=True)
    patientId = ReferenceField(
        Patient, required=True
    )  # References 'patients' collection
    icfCode = StringField(
        required=True
    )  # Official ICF code (e.g., "b28013" for "Pain in back")
    date = DateTimeField(default=timezone.now)  # Date of the rating record
    rating = IntField()  # Score level (e.g., 0-4 or 0-10 scale)
    feedback_entries = ListField(EmbeddedDocumentField(FeedbackEntry))
    notes = StringField()  # Additional notes or observations
