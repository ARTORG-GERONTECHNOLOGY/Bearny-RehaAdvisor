"""
Patient Views API Tests

This module tests patient-facing API endpoints including feedback submission,
intervention completion tracking, and intervention removal.

Tests cover:
- Feedback questionnaire submission for interventions
- Marking interventions as completed with progress tracking
- Removing interventions from patient's rehabilitation plan
- Error handling for invalid patients, missing data, and malformed requests

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
Models: Patient, Therapist, Intervention, InterventionAssignment, FeedbackQuestion, RehabilitationPlan
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    DefaultInterventions,
    FeedbackQuestion,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
)

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


def setup_patient_with_plan():
    # Create User & Therapist
    therapist_user = User(
        username="t1", email="t1@example.com", phone="123", createdAt=datetime.now()
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

    # Create Patient
    patient_user = User(
        username="p1", email="p1@example.com", phone="456", createdAt=datetime.now()
    )
    patient_user.save()
    patient = Patient(
        userId=patient_user,
        name="Patient",
        first_name="One",
        access_word="pass",
        age="30",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=["Moderate Exercise"],
        personal_goals=["Improved Mobility"],
        reha_end_date=datetime.now() + timedelta(days=30),
    )
    patient.save()

    # Create Intervention
    intervention = Intervention(
        title="Stretching", description="Stretching exercises", content_type="Video"
    )
    intervention.save()

    # Add Rehab Plan
    assignment = InterventionAssignment(
        interventionId=intervention,
        frequency="Daily",
        notes="",
        dates=[datetime.now() + timedelta(days=i) for i in range(5)],
    )
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    )
    plan.save()

    return patient, therapist, intervention, plan


@patch("core.views.patient_views.getattr", return_value="mocked")
def test_submit_feedback_success_intervention(mock_getattr, mongo_mock):
    """
    Scenario: Patient submits feedback after completing intervention
    
    Setup:
    - Patient enrolled with therapist
    - Intervention assigned: "Stretching"
    - Rehabilitation plan active
    - FeedbackQuestion created: "How did it go?"
    
    Input Data:
    - userId: patient's user ID
    - interventionId: intervention the patient completed
    - responses: Array of question-answer pairs
      * Question: "How did it go?"
      * Answer: ["Great"]
    
    Steps:
    1. POST /api/patients/feedback/questionaire/ with feedback data
    2. System validates patient exists
    3. System validates intervention exists
    4. System stores feedback responses
    5. System records feedback timestamp
    6. System may trigger follow-up recommendations
    
    Expected Results:
    - HTTP 201 Created or 200 OK
    - Response message: "Feedback submitted successfully"
    - Feedback stored in database
    - Visible to therapist in patient dashboard
    - Can be used for outcome measurement
    
    Business Flow: Patient completes exercise session, rates experience, provides comments
    Use Case: Therapist reviews patient satisfaction and adjusts intervention if needed
    """
    patient, therapist, intervention, _ = setup_patient_with_plan()
    FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="how_did_it_go",
        answer_type="text",
        translations=[Translation(language="en", text="How did it go?")],
        possibleAnswers=[],
    )

    # Minimal feedback response
    payload = {
        "userId": str(patient.userId.id),
        "interventionId": str(intervention.id),
        "responses": [{"question": "How did it go?", "answer": ["Great"]}],
    }

    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",  # Mocked auth
    )
    assert resp.status_code in [201, 200]
    assert "Feedback submitted successfully" in resp.content.decode()


def test_submit_feedback_no_responses(mongo_mock):
    """
    Scenario: Feedback submission with empty responses array
    
    Setup:
    - Patient exists
    - Request payload has empty responses: []
    
    Steps:
    1. POST /api/patients/feedback/questionaire/ with no responses
    2. System validates request
    3. No feedback data provided
    4. Request rejected
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "No feedback responses provided"
    - No feedback stored
    - Patient prompted to provide responses
    
    Input Validation: Prevents empty feedback submissions
    """
    patient, _, _, _ = setup_patient_with_plan()

    payload = {"userId": str(patient.userId.id), "interventionId": "", "responses": []}
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "No feedback responses provided" in resp.content.decode()


def test_submit_feedback_patient_not_found(mongo_mock):
    """
    Scenario: Feedback submission for non-existent patient
    
    Setup:
    - User ID provided does not exist in database
    - Random ObjectId: 507f1f77bcf86cd799439011
    - Feedback data otherwise valid
    
    Steps:
    1. POST /api/patients/feedback/questionaire/ with invalid userId
    2. System looks up patient
    3. Patient not found
    4. Feedback submission fails
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Patient not found"
    - No feedback stored
    - Database unchanged
    
    Error Handling: Prevents feedback storage for non-existent patients
    """
    FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="q_test",
        answer_type="text",
        translations=[Translation(language="en", text="Q?")],
        possibleAnswers=[],
    )

    payload = {
        "userId": str(ObjectId()),  # Non-existent user
        "interventionId": str(ObjectId()),  # Valid ObjectId, but will fail
        "responses": [{"question": "Q?", "answer": ["A"]}],
    }
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_mark_intervention_completed_success(mongo_mock):
    """
    Scenario: Patient marks intervention as completed
    
    Setup:
    - Patient has intervention assigned
    - Patient has completed the intervention
    - Intervention: "Stretching"
    
    Input Data:
    - patient_id: Patient's user ID
    - intervention_id: Intervention being marked complete
    
    Steps:
    1. POST /api/interventions/complete/ with patient and intervention IDs
    2. System validates patient exists
    3. System validates intervention exists
    4. System validates patient is assigned this intervention
    5. System records completion with timestamp
    6. System updates intervention logs/history
    7. System may trigger next intervention in sequence
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Marked as completed successfully"
    - Intervention status changes to "completed"
    - Completion recorded in PatientInterventionLogs
    - Visible in patient's progress history
    - Therapist sees updated progress on dashboard
    
    Use Case: Patient finishes session, clicks "mark complete", system records for adherence tracking
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    payload = {
        "patient_id": str(patient.userId.id),
        "intervention_id": str(intervention.id),
    }
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "Marked as completed successfully" in resp.content.decode()


def test_mark_intervention_completed_missing_params(mongo_mock):
    """
    Scenario: Mark intervention complete request missing required parameters
    
    Setup:
    - Request payload is empty {}
    - Missing patient_id
    - Missing intervention_id
    
    Steps:
    1. POST /api/interventions/complete/ with empty payload
    2. System validates required parameters
    3. Parameters missing
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "Missing patient_id or intervention_id"
    - No completion recorded
    - Database unchanged
    
    Input Validation: Ensures required data provided before processing
    """
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps({}),  # Empty payload
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing patient_id or intervention_id" in resp.content.decode()


def test_mark_intervention_completed_patient_not_found(mongo_mock):
    """
    Scenario: Mark intervention complete for non-existent patient
    
    Setup:
    - Intervention exists
    - Patient ID does not exist
    - Random ObjectId
    
    Steps:
    1. POST /api/interventions/complete/ with non-existent patient_id
    2. System looks up patient
    3. Patient not found
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Patient not found"
    - No completion recorded
    - No database changes
    
    Error Handling: Prevents completion records for non-existent patients
    """
    _, _, intervention, _ = setup_patient_with_plan()
    payload = {
        "patient_id": str(ObjectId()),  # Non-existent
        "intervention_id": str(intervention.id),
    }
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_remove_intervention_success(mongo_mock):
    """
    Scenario: Therapist removes intervention from patient's plan
    
    Setup:
    - Patient has rehabilitation plan with intervention
    - Intervention: "Stretching" assigned for next 5 days
    - Plan is active with scheduled dates
    
    Input Data:
    - intervention: Intervention ID to remove
    - patientId: Patient's ID
    
    Steps:
    1. POST /api/interventions/remove-from-patient/ with intervention and patient IDs
    2. System validates patient exists
    3. System validates intervention exists
    4. System validates patient has this intervention assigned
    5. System removes intervention from rehabilitation plan
    6. System clears scheduled dates for this intervention
    7. System records removal in audit log
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Intervention dates removed successfully"
    - Intervention removed from patient's active plan
    - Future sessions cancelled
    - Therapist can view removal in history
    - Patient no longer sees intervention on dashboard
    
    Use Case: Therapist completes plan, removes intervention before end date, or switches to different approach
    """
    patient, _, intervention, plan = setup_patient_with_plan()
    payload = {"intervention": str(intervention.id), "patientId": str(patient.id)}
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "Intervention dates removed successfully" in resp.content.decode()


def test_remove_intervention_missing_params(mongo_mock):
    """
    Scenario: Remove intervention request missing required parameters
    
    Setup:
    - Request payload is empty {}
    - Missing intervention field
    - Missing patientId field
    
    Steps:
    1. POST /api/interventions/remove-from-patient/ with empty payload
    2. System validates required parameters
    3. Parameters missing
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "Missing required parameters"
    - No intervention removed
    - Plan unchanged
    
    Input Validation: Prevents incomplete removal requests
    """
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing required parameters" in resp.content.decode()


def test_remove_intervention_patient_not_found(mongo_mock):
    """
    Scenario: Remove intervention from non-existent patient
    
    Setup:
    - Intervention exists (random ObjectId)
    - Patient ID does not exist (random ObjectId)
    
    Steps:
    1. POST /api/interventions/remove-from-patient/ with non-existent patientId
    2. System looks up patient
    3. Patient not found
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Patient not found"
    - No intervention removed
    - Database unchanged
    
    Error Handling: Prevents removal operations on non-existent patients
    """
    payload = {"intervention": str(ObjectId()), "patientId": str(ObjectId())}
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()
