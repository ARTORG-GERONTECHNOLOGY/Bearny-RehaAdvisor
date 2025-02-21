import os
import random
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from mongoengine import (Document, DictField, StringField, EmailField, IntField, ListField, DateTimeField, BooleanField,
                         ReferenceField, EmbeddedDocument, EmbeddedDocumentField)

from utils.config import config

all_diagnoses = [diagnosis for category in config["patientInfo"]["function"].values() for diagnosis in
                 category["diagnosis"]]


class RecommendationAssignment(EmbeddedDocument):
    recommendation = StringField(required=True)  # Reference to the Recommendation ID
    diagnosis_assignments = DictField(BooleanField())  # e.g., {"all": True, "Heart Attack": True}


class Therapist(Document):
    meta = {'collection': 'users'}  # MongoDB collection
    username = StringField(max_length=150, required=True)
    name = StringField(max_length=20)
    first_name = StringField(max_length=20)
    user_type = StringField(max_length=20, default='therapist')  # No choices, but you can enforce them in the logic
    created_at = DateTimeField(default=timezone.now)
    specializations = ListField(StringField(max_length=200), choices=config["therapistInfo"]["specializations"])
    clinics = ListField(StringField(max_length=200), choices=config["therapistInfo"]["clinics"])
    email = EmailField()
    phone = StringField(max_length=20, unique=True)
    pwdhash = StringField()
    accepted = BooleanField(default=False)
    default_recommendations = ListField(EmbeddedDocumentField(RecommendationAssignment))  # New field

    def __str__(self):
        return f'{self.username} (Therapist)'


class Patient(Document):
    all_diagnoses = [diagnosis for category in config["patientInfo"]["function"].values() for diagnosis in
                     category["diagnosis"]]
    meta = {'collection': 'patients'}  # MongoDB collection
    username = StringField(max_length=150, required=True)
    name = StringField(max_length=20)
    pwdhash = StringField()
    access_word = StringField(max_length=100)
    first_name = StringField(max_length=20)
    user_type = StringField(max_length=20, default='patient')
    created_at = DateTimeField(default=timezone.now)
    email = EmailField(unique=True)
    phone = StringField(max_length=20)
    age = StringField(max_length=20)
    therapist = ReferenceField(Therapist, required=True)

    # Fields with choices
    sex = StringField(max_length=10, choices=config["patientInfo"]["sex"])
    diagnosis = ListField(StringField(max_length=30), choices=all_diagnoses)
    function = ListField(StringField(max_length=200, choices=config["therapistInfo"]["specializations"]))
    level_of_education = StringField(max_length=30, choices=config["patientInfo"]["level_of_education"])
    professional_status = StringField(max_length=30, choices=config["patientInfo"]["professional_status"])
    marital_status = StringField(max_length=30, choices=config["patientInfo"]["marital_status"])
    lifestyle = ListField(StringField(max_length=200, choices=config["patientInfo"]["lifestyle"]))
    personal_goals = ListField(StringField(max_length=200, choices=config["patientInfo"]["personal_goals"]))

    medication_intake = StringField(max_length=30)
    social_support = StringField(max_length=30)
    duration = IntField()
    reha_end_date = DateTimeField()

    def __str__(self):
        return f'{self.username} (Patient)'


class Researcher(Document):
    meta = {'collection': 'users'}  # MongoDB collection
    username = StringField(max_length=150, required=True, unique=True)
    name = StringField(max_length=20)
    first_name = StringField(max_length=20)
    user_type = StringField(max_length=20, default='patient')  # No choices, but you can enforce them in the logic
    custom_id = StringField(max_length=10, unique=True, null=True)
    created_at = DateTimeField(default=timezone.now)
    specializations = ListField(StringField(max_length=200), choices=config["therapistInfo"]["specializations"])
    clinics = ListField(StringField(max_length=200), choices=config["therapistInfo"]["clinics"])
    email = EmailField()
    phone = StringField(max_length=20, unique=True)
    pwdhash = StringField()
    accepted = BooleanField(default=False)

    def __str__(self):
        return f'{self.username} (Researcher)'


class Exercise(Document):
    meta = {'collection': 'exercises'}
    name = StringField(max_length=100)
    description = StringField()
    duration = IntField(null=True)  # Store duration as an integer (e.g., in seconds or minutes)
    created_at = DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name


class PatientType(EmbeddedDocument):
    patient_type_diag = all_diagnoses.append('All')
    type = StringField(required=True, choices=config["therapistInfo"]["specializations"])
    diagnosis = StringField(max_length=200, choices=patient_type_diag)
    frequency = StringField(required=True, choices=config["RecomendationInfo"]["frequency"])
    include_option = BooleanField(default=True)  # True means "Include", False means "Exclude"
    meta = {'allow_inheritance': True}


class Recommendation(Document):
    meta = {'collection': 'exercises'}
    title = StringField(required=True, unique=True)
    description = StringField(required=True)
    content_type = StringField(required=True, choices=config["RecomendationInfo"]["types"])
    benefitFor = ListField(StringField())
    tags = ListField(StringField())
    link = StringField()  # Only for articles
    media_file = StringField()  # For video and app content types
    preview_img = StringField()
    patient_types = ListField(EmbeddedDocumentField(PatientType))
    duration = IntField()

    def __str__(self):
        return self.title


# Feedback Embedded Document remains unchanged
class Feedback(EmbeddedDocument):
    meta = {'collection': 'feedback'}
    intervention_id = ReferenceField(Recommendation, required=True)
    date = DateTimeField(default=timezone.now)
    comment = StringField()
    rating = StringField()  # Consider using an IntegerField for rating


# PatientInterventions Model with tracking and scheduling
class PatientInterventions(Document):
    meta = {'collection': 'patientinterventions'}
    patient_id = ReferenceField(Patient, required=True)
    intervention_id = ReferenceField(Recommendation, required=True)
    recommendation_date = DateTimeField(default=timezone.now)
    feedback = ListField(EmbeddedDocumentField(Feedback))
    recomended_t = BooleanField(default=False)
    frequency = StringField(choices=config["RecomendationInfo"]["frequency"], required=True)
    completion_dates = ListField(DateTimeField())  # Dates when patient marked the intervention as done
    end_date = DateTimeField()  # To store the end date of the rehabilitation period
    not_completed_dates = ListField(DateTimeField())

    def __str__(self):
        return f"{self.patient_id} - {self.intervention_id}"

    def mark_done(self, date=None, feedback=None):
        """
        Marks the intervention as done on a specific date.
        Optionally includes feedback for that date.
        """
        date = date or timezone.now()
        if date not in self.completion_dates:
            self.completion_dates.append(date)
            self.save()

        # Optionally add feedback for the specific completion date
        if feedback:
            self.feedback.append(Feedback(date=date, **feedback))
            self.save()

    # Method to get all interventions with their feedback and future dates
    @classmethod
    def get_patient_interventions_with_feedback_and_future_dates(cls, patient):
        """
        Retrieves all interventions for a given patient along with their feedback and future dates.
        """
        interventions = cls.objects(patient_id=patient)
        result = []
        today = timezone.now().date()  # Get today's date without the time component

        for intervention in interventions:
            # Extract feedback data
            feedback_data = [
                {
                    'date': fb.date,
                    'comment': fb.comment,
                    'rating': fb.rating
                }
                for fb in intervention.feedback
            ]

            # Generate future dates specifically for this intervention
            future_dates = intervention.generate_schedule() if intervention.recomended_t else []
            print('hello')
            # Check if today's date is a scheduled date and if it has not been completed
            if intervention.recomended_t:
                if today in [date.date() for date in future_dates] and today not in [
                    date.date() for date in intervention.completion_dates
                ]:
                    # Add today to not_completed_dates if it’s not already there
                    if today not in [date.date() for date in intervention.not_completed_dates]:
                        intervention.not_completed_dates.append(timezone.now())
                        intervention.save()  # Save the updated intervention
            print('hei')
            result.append({
                'intervention_id': str(intervention.intervention_id.pk),
                'intervention_title': intervention.intervention_id.title,
                'frequency': intervention.frequency,
                'description': intervention.intervention_id.description,  # Add the description field here
                'recommendation_date': intervention.recommendation_date,
                'completion_dates': intervention.completion_dates,
                'not_completed_dates': intervention.not_completed_dates,
                'feedback': feedback_data,
                'future_dates': future_dates  # Each intervention has its unique future dates now
            })

        return result

    def generate_schedule(self):
        """
        Generates a list of future dates for intervention based on frequency until the end_date.
        """
        if not self.end_date or not self.frequency:
            return []

        # Ensure the recommendation_date is timezone-aware
        start_date = self.recommendation_date
        if timezone.is_naive(start_date):
            start_date = timezone.make_aware(start_date)

        # Ensure the end_date is timezone-aware
        end_date = self.end_date
        if timezone.is_naive(end_date):
            end_date = timezone.make_aware(end_date)

        # List to store the dates
        dates = []
        print(end_date)
        print(start_date)
        print(self.frequency)
        # Generate the schedule based on frequency until end_date
        while start_date <= end_date:
            dates.append(start_date)
            freq = self.frequency.lower()  # Normalize frequency to lowercase
            if freq == config["RecomendationInfo"]["frequency"][0].lower():
                start_date += timedelta(days=config["RecomendationInfo"]["frequencyDays"][0])
            elif freq == config["RecomendationInfo"]["frequency"][1].lower():
                start_date += timedelta(days=config["RecomendationInfo"]["frequencyDays"][1])
            elif freq == config["RecomendationInfo"]["frequency"][2].lower():
                start_date += timedelta(days=config["RecomendationInfo"]["frequencyDays"][2])
            elif freq == config["RecomendationInfo"]["frequency"][3].lower():
                break

        # Filter out only past dates that have not been completed, but include today
        now = timezone.now()
        future_dates = [date for date in dates if date.date() >= now.date() and date not in self.completion_dates]

        return future_dates

    @classmethod
    def un_recommend(cls, patient, intervention):
        # Check if the PatientIntervention exists and is recommended
        patient_intervention = cls.objects(
            patient_id=patient,
            intervention_id=intervention,
            recomended_t=True
        ).first()

        # If found, update recomended_t to False
        if patient_intervention:
            patient_intervention.recomended_t = False
            patient_intervention.save()
            updated = True
        else:
            updated = False

        return patient_intervention, updated

    @staticmethod
    def get_therapist_patients_with_intervention(therapist, intervention):
        patients = Patient.objects(therapist=therapist)  # Get all patients for the therapist
        result = []

        for patient in patients:
            # Check if the patient is using the intervention
            patient_intervention = PatientInterventions.objects(
                patient_id=patient,
                intervention_id=intervention,
                recomended_t=True
            ).first()
            print(patient_intervention)

            # Append patient info along with whether they are using the intervention
            result.append({
                'username': patient.username,
                'name': patient.name,
                'uses_intervention': bool(patient_intervention)
                # True if patient is using the intervention, False otherwise
            })

        return result

    @classmethod
    def get_or_create(cls, patient, intervention):
        """
        Get or create a PatientIntervention with a frequency based on the patient's function
        and an end date calculated from the patient's rehabilitation duration.
        """
        # Determine the frequency for this patient based on their function (e.g., 'cardio')
        # Get the function value (assuming it's a list, take the first relevant one)
        patient_function = patient.function[0] if patient.function else None

        # Find the corresponding frequency from the recommendation's patient types
        frequency = None
        for patient_type in intervention.patient_types:
            if patient_type.include_option and patient_type.type == patient_function:
                frequency = patient_type.frequency
                break

        # Set a default frequency if not found
        if not frequency:
            frequency = 'Weekly'  # Default to 'weekly' if no match found

        # Calculate the end date based on the patient's duration (in days or weeks)
        recommendation_date = timezone.now()
        end_date = recommendation_date + timedelta(days=patient.duration)

        # Check if the PatientIntervention exists
        patient_intervention = cls.objects(
            patient_id=patient,
            intervention_id=intervention,
        ).first()

        # If it exists but is not recommended, update the details
        if patient_intervention and not patient_intervention.recomended_t:
            patient_intervention.recommendation_date = recommendation_date
            patient_intervention.end_date = end_date
            patient_intervention.recomended_t = True
            patient_intervention.frequency = frequency
            patient_intervention.save()
            created = True
        # If it doesn't exist, create a new one
        elif not patient_intervention:
            patient_intervention = cls(
                patient_id=patient,
                intervention_id=intervention,
                recomended_t=True,
                frequency=frequency,
                end_date=end_date,
                recommendation_date=recommendation_date
            )
            patient_intervention.save()
            created = True
        else:
            # If it already exists and is recommended, do nothing but return it
            created = False

        return patient_intervention, created

    @classmethod
    def get_today_recommendations(cls, patient):
        """
        Retrieves recommendations scheduled for today for a given patient.
        """
        today = timezone.now().date()  # Current date without time
        recommendations_today = []

        # Fetch all active interventions for the patient
        interventions = cls.objects(patient_id=patient, recomended_t=True)

        for intervention in interventions:
            # Check if the intervention's schedule includes today
            scheduled_dates = intervention.generate_schedule()
            if today in [date.date() for date in scheduled_dates]:
                rec_data = {
                    'intervention_id': str(intervention.intervention_id.pk),
                    'intervention_title': intervention.intervention_id.title,
                    'description': intervention.intervention_id.description,
                    'frequency': intervention.frequency,
                    'recommendation_date': intervention.recommendation_date,
                    'completion_dates': intervention.completion_dates,
                    'not_completed_dates': intervention.not_completed_dates,
                    'content_type': intervention.intervention_id.content_type,
                    'feedback': [
                        {
                            'date': fb.date,
                            'comment': fb.comment,
                            'rating': fb.rating
                        }
                        for fb in intervention.feedback if fb.date.date() == today
                    ]
                }

                # Handle content type for each recommendation
                if intervention.intervention_id.link:
                    rec_data["link"] = intervention.intervention_id.link
                elif intervention.intervention_id.media_file:
                    media_file = intervention.intervention_id.media_file
                    if media_file:  # Only include media_url if file path is provided
                        media_file_path = os.path.join(settings.MEDIA_URL, media_file)
                        rec_data["media_url"] = f'http://localhost:8000{media_file_path}'

                recommendations_today.append(rec_data)

        return recommendations_today




class SMSVerification(Document):
    meta = {'collection': 'sms_verifications'}
    #user = ReferenceField(User, reverse_delete_rule=CASCADE)
    code = StringField(max_length=6)
    created_at = DateTimeField(default=timezone.now)
    expires_at = DateTimeField()

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f'{random.randint(100000, 999999)}'
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(minutes=10)
        super(SMSVerification, self).save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.expires_at
