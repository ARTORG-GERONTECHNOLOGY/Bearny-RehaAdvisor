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
    """Fixture to connect mongoengine to mongomock before each test."""
    disconnect()  # disconnect if any real DB is connected
    connect(
        db="testdb",
        host="mongodb://localhost",  # fake URI for compatibility
        mongo_client_class=mongomock.MongoClient,
    )
    yield
    disconnect()  # cleanup after test


def test_create_user():
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
    sms = SMSVerification(
        userId="some-user-id",
        code="123456",
        expires_at=datetime.now() + timedelta(minutes=5),
    )
    sms.save()
    assert SMSVerification.objects.count() == 1
    assert str(sms).startswith("some-user-id")


def test_therapist_and_patient_relationship():
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
        clinics=["Downtown Clinic"],
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
        clinics=["Downtown Clinic"],
    ).save()
    patient = Patient(
        userId=user,
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
    with pytest.raises(Exception):
        User(
            username="nouser",  # missing email and phone
            createdAt=datetime.now(),
        ).save()


def test_intervention_with_patient_types():
    patient_type = PatientType(
        type="Cardiology",
        diagnosis="Heart attack",
        frequency="Daily",
        include_option=True,
    )

    intervention = Intervention(
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
