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


class Logs(Document):
    meta = {"collection": "logs"}  # MongoDB collection
    userId = ReferenceField(User, required=True)
    action = StringField(
        choices=["LOGIN", "LOGOUT", "UPDATE_PROFILE", "DELETE_ACCOUNT", "OTHER"],
        default="Therapist",
        required=True,
    )
    timestamp = DateTimeField(default=timezone.now)
    userAgent = StringField(max_length=20, required=True)
    details = StringField(max_length=500)

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


class InterventionAssignment(EmbeddedDocument):
    interventionId = ReferenceField(
        Intervention, required=True
    )  # References 'interventions' collection
    frequency = StringField()  # Frequency details (e.g., "3 times per week")
    dates = ListField(
        DateTimeField()
    )  # List of scheduled dates/times for this intervention
    notes = StringField()  # Additional notes on the intervention


class DiagnosisAssignmentSettings(EmbeddedDocument):
    active = BooleanField(default=False)
    interval = IntField()
    unit = StringField()
    selected_days = ListField(StringField())
    end_type = StringField()
    count_limit = IntField()


class DefaultInterventions(EmbeddedDocument):
    recommendation = ReferenceField(Intervention, required=True)
    # Example: {"Heart Attack": {...}, "Stroke": {...}, "all": {...}}
    diagnosis_assignments = DictField(
        EmbeddedDocumentField(DiagnosisAssignmentSettings)
    )


class Therapist(Document):
    meta = {"collection": "Therapist"}  # MongoDB collection
    userId = ReferenceField(User, required=True)
    name = StringField(max_length=20)
    first_name = StringField(max_length=20)
    created_at = DateTimeField(default=timezone.now)
    specializations = ListField(
        StringField(max_length=200), choices=config["therapistInfo"]["specializations"]
    )
    clinics = ListField(
        StringField(max_length=200), choices=config["therapistInfo"]["clinics"]
    )
    default_recommendations = ListField(
        EmbeddedDocumentField(DefaultInterventions)
    )  # TODO needed?

    def __str__(self):
        return f"{self.username} (Therapist)"


class Patient(Document):
    meta = {"collection": "Patients"}  # MongoDB collection
    userId = ReferenceField(User, required=True)
    name = StringField(max_length=20, required=True)
    pwdhash = StringField()
    access_word = StringField(max_length=100, required=True)
    first_name = StringField(max_length=20, required=True)
    age = StringField(max_length=20, required=True)
    therapist = ReferenceField(Therapist, required=True)

    # Fields with choices
    sex = StringField(
        max_length=10, choices=config["patientInfo"]["sex"], required=True
    )
    diagnosis = ListField(
        StringField(max_length=30), choices=all_diagnoses, required=True
    )
    function = ListField(
        StringField(max_length=200, choices=config["therapistInfo"]["specializations"]),
        required=True,
    )
    level_of_education = StringField(
        max_length=30,
        choices=config["patientInfo"]["level_of_education"],
        required=True,
    )
    professional_status = StringField(
        max_length=30,
        choices=config["patientInfo"]["professional_status"],
        required=True,
    )
    marital_status = StringField(
        max_length=30, choices=config["patientInfo"]["marital_status"], required=True
    )
    lifestyle = ListField(
        StringField(max_length=200, choices=config["patientInfo"]["lifestyle"]),
        required=True,
    )
    personal_goals = ListField(
        StringField(max_length=200, choices=config["patientInfo"]["personal_goals"]),
        required=True,
    )
    all_diagnoses = [
        diagnosis
        for category in config["patientInfo"]["function"].values()
        for diagnosis in category["diagnosis"]
    ]
    medication_intake = StringField(max_length=30)
    social_support = ListField(StringField(max_length=30))
    duration = IntField()
    care_giver = StringField(max_length=20, default="")
    reha_end_date = DateTimeField(required=True)

    def __str__(self):
        return f"{self.username} (Patient)"


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
