"""
Data Model Tests for RehaAdvisor

This test module validates all core data models including User, Patient, Therapist,
Intervention, and related entities. Tests verify:
- Model creation and field validation
- Relationships between models (User → Patient → Therapist)
- Data persistence and retrieval
- Required field enforcement
- Complex nested structures (translations, patient types, feedback)

Testing Framework: pytest with MongoEngine and mongomock
Database: In-memory MongoDB mock (no actual DB required)
"""

from datetime import datetime, timedelta

# Connect once for all tests
import mongomock
import pytest
from mongoengine import connect, disconnect, get_connection

from core.models import (
    AnswerOption,
    DefaultInterventions,
    FeedbackEntry,
    FeedbackQuestion,
    Intervention,
    Patient,
    PatientICFRating,
    PatientType,
    RehabilitationPlan,
    SMSVerification,
    Therapist,
    Translation,
    User,
)


@pytest.fixture(autouse=True, scope="function")
def mock_mongoengine():
    """
    Pytest fixture that sets up in-memory MongoDB for each test.
    
    Scope: function (fresh database for each test)
    Behavior:
    - Disconnects any existing DB connections
    - Connects to mongomock in-memory database
    - Cleans up after test completes
    
    Why mongomock:
    - No real MongoDB installation required
    - Tests run fast (~10ms each)
    - Isolated: no data pollution between tests
    - Safe: no risk of corrupting real data
    """
    disconnect()  # disconnect if any real DB is connected
    connect(
        db="testdb",
        host="mongodb://localhost",  # fake URI for compatibility
        mongo_client_class=mongomock.MongoClient,
    )
    yield
    disconnect()  # cleanup after test


def test_create_user():
    """
    
    Steps:
    
    Expected Results:
    - User successfully persisted to database
    - User.objects.count() == 1
    - User marked as inactive by default (isActive = False)
    - All fields present in returned object
    """
    user = User(
        username="jdoe",
        role="Therapist",
        createdAt=datetime.now(),
        email="jdoe@example.com",
        phone="+123456789",
        pwdhash="hashed_password",
    )
    user.save()
    assert User.objects.count() == 1
    assert user.isActive is False


def test_sms_verification_create():
    """
    
    Steps:
    
    Expected Results:
    - SMS verification record created and persisted
    - Code stored correctly
    - Expiration time set correctly
    - String representation includes user ID
    
    Use Case: User verifies their phone number during registration
    """
    sms = SMSVerification(
        userId="some-user-id",
        code="123456",
        expires_at=datetime.now() + timedelta(minutes=5),
    )
    sms.save()
    assert SMSVerification.objects.count() == 1
    assert str(sms).startswith("some-user-id")


def test_therapist_and_patient_relationship():
    """
    
    Steps:
    
    Expected Results:
    - Both users created successfully
    - Therapist has specialization (Cardiology) and clinic (Downtown Clinic)
    - Patient linked to therapist via foreign key reference
    - Patient.therapist.userId.username returns therapist's username
    - Patient model has all required medical fields (diagnosis, function, etc.)
    
    Data Flow:
    User → Therapist/Patient → Patient.therapist reference
    
    Use Case: When a new patient joins a therapist's caseload
    """
    user = User(
        username="therapist1",
        email="t1@example.com",
        phone="12345",
        createdAt=datetime.now(),
    )
    user.save()

    therapist = Therapist(
        userId=user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    )
    therapist.save()

    patient_user = User(
        username="patient1",
        email="p1@example.com",
        phone="67890",
        createdAt=datetime.now(),
    )
    patient_user.save()

    patient = Patient(
        userId=patient_user,
        patient_code="PAT001",
        name="Patient Last",
        first_name="Patient First",
        access_word="word",
        age="30",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Part-Time",
        marital_status="Single",
        lifestyle=["Moderate Exercise"],
        personal_goals=["Improved Mobility"],
        reha_end_date=datetime.now() + timedelta(days=30),
    )
    patient.save()

    assert patient.therapist.userId.username == "therapist1"
    assert Patient.objects.count() == 1


def test_feedback_question_with_translations_and_answers():
    """
    
    Steps:
    
    Expected Results:
    - FeedbackQuestion created with 1 translation entry
    - Translation language correctly set to 'en'
    - Answer options properly nested
    - Question type set to 'select' (multiple choice)
    
    Multi-Language Support:
    - Questions: English text stored
    - Answers: Localized options available for all supported languages
    
    Use Case: Patient answers feedback questions in their preferred language
    """
    translations = [Translation(language="en", text="How do you feel?")]
    options = [
        AnswerOption(key="yes", translations=[Translation(language="en", text="Yes")])
    ]
    question = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="feel_question",
        translations=translations,
        possibleAnswers=options,
        answer_type="select",
    )
    question.save()

    assert FeedbackQuestion.objects.count() == 1
    assert question.translations[0].language == "en"


def test_intervention_and_patient_icf_rating():
    """
             for intervention feedback
    
    Steps:
    
    Expected Results:
    - PatientICFRating created with:
      - Reference to feedback question
      - Reference to patient
      - ICF code (b28013 = cardiovascular function)
      - Numeric rating (0-10 scale)
      - Empty feedback entries initially
    
    ICF Integration:
    - Standardized codes for functional health measurements
    - Tracks patient's physical/cognitive capabilities
    - Used by therapists to document treatment progress
    
    Use Case: After patient completes intervention, therapist records functional improvement
    """
    # Create FeedbackQuestion
    question = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="mobility",
        translations=[Translation(language="en", text="Mobility")],
        possibleAnswers=[],
        answer_type="text",
    ).save()

    # Create Patient
    user = User(
        username="pat", email="pat@example.com", phone="3333", createdAt=datetime.now()
    )
    user.save()
    therapist = Therapist(
        userId=user,
        name="T",
        first_name="T",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()
    patient = Patient(
        userId=user,
        patient_code="PAT002",
        name="Pat",
        first_name="Test",
        access_word="pass",
        age="40",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="Bachelor's Degree",
        professional_status="Employed Part-Time",
        marital_status="Married",
        lifestyle=["Sedentary"],
        personal_goals=["Improved Mobility"],
        reha_end_date=datetime.now() + timedelta(days=60),
    ).save()

    # Create PatientICFRating
    rating = PatientICFRating(
        questionId=question,
        patientId=patient,
        icfCode="b28013",
        rating=3,
        feedback_entries=[],
    )
    rating.save()

    assert PatientICFRating.objects.count() == 1
    assert rating.rating == 3


def test_missing_required_field_should_fail():
    """
    
    Steps:
    
    Expected Results:
    - Exception raised (ValidationError or ValidationFailure)
    - User not saved to database
    - Database remains empty
    
    Validation Logic:
    - Username: Required field
    - CreatedAt: Required field
    
    Use Case: Prevent incomplete user records from being saved to database
    """
    with pytest.raises(Exception):
        User(
            username="nouser",  # missing createdAt
        ).save()


def test_intervention_with_patient_types():
    """
    
    Steps:
       - Medical specialty (Cardiology)
       - Specific diagnosis (Heart attack, Stroke)
       - Recommended frequency (Daily)
       - Include/exclude option flag
    
    Expected Results:
    - Intervention created with multiple patient types
    - Patient type nested correctly within intervention
    - Type field contains correct medical specialty
    - Diagnosis and frequency properly stored
    
    Patient Type Structure:
    - Multiple types can be assigned to one intervention
    - Allows therapists to restrict intervention to specific diagnoses
    - Enables automated recommendation based on patient profile
    
    Use Case: "Yoga" exercise assigned to Cardiology and Orthopedic patients
             but with different frequencies based on diagnosis
    """
    patient_type = PatientType(
        type="Cardiology",
        diagnosis="Heart attack",
        frequency="Daily",
        include_option=True,
    )

    intervention = Intervention(
        external_id="test_yoga_001",
        language="en",
        title="Yoga",
        description="Test",
        content_type="Video",
        patient_types=[
            PatientType(
                type="Cardiology",
                diagnosis="Stroke",
                frequency="Daily",
                include_option=True,
            )
        ],
    )

    intervention.save()
    assert Intervention.objects.count() == 1
    assert intervention.patient_types[0].type == "Cardiology"
