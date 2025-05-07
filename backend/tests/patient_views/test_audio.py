import io
import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from django.core.files.storage import default_storage
from django.test import Client

from core.models import Patient, Therapist, User

client = Client()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    import mongomock
    from mongoengine import connect, disconnect

    alias = "default"
    from mongoengine.connection import _connections

    if alias in _connections:
        disconnect(alias)

    conn = connect(
        "mongoenginetest",
        alias=alias,
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect(alias)


def setup_patient():
    # First create User for Therapist
    therapist_user = User(
        username="t1", email="t1@example.com", phone="111", createdAt=datetime.now()
    )
    therapist_user.save()

    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Downtown Clinic"],
    )
    therapist.save()

    # Now create Patient
    user = User(
        username="p1", email="p1@example.com", phone="123", createdAt=datetime.now()
    )
    user.save()

    patient = Patient(
        userId=user,
        name="Patient",
        first_name="One",
        access_word="pass",
        age="30",
        therapist=therapist,  # ✅ NOW PROVIDED
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=["Moderate Exercise"],
        personal_goals=["Improved Mobility"],
        reha_end_date=datetime.now(),
    )
    patient.save()
    return patient


@patch("speech_recognition.Recognizer.recognize_google")
@patch("speech_recognition.Recognizer.record")
@patch("speech_recognition.AudioFile")
def test_audio_upload_and_recognition(
    mock_audio_file, mock_record, mock_recognize, mongo_mock
):
    # Setup patient
    patient = setup_patient()

    # Fake recognition output
    mock_recognize.return_value = "This is a test transcription"
    mock_audio_file.return_value.__enter__.return_value = MagicMock()
    mock_record.return_value = MagicMock()

    # Prepare a dummy audio file (simulate upload)
    audio_content = b"Fake audio data"
    file = io.BytesIO(audio_content)
    file.name = "test_audio.wav"

    # Prepare the responses as JSON string
    responses_json = json.dumps([{"question": "How do you feel?", "answer": "Good"}])

    # ✅ Do NOT set content_type manually; let the client handle it
    response = client.post(
        "/api/patients/feedback/questionaire/",
        data={
            "userId": str(patient.userId.id),
            "responses": responses_json,
            "audio_file": file,
        },
        HTTP_AUTHORIZATION="Bearer test",
    )

    # ✅ Assert status code
    assert response.status_code in [200, 201]

    # ✅ Assert recognizer was called (audio was processed)
    mock_recognize.assert_called()
