import datetime
import json
import os

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.core.files.storage import default_storage
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from utils.config import config
from utils.utils import get_db_handle
from .models import PatientType, Researcher, PatientInterventions, Feedback, \
    RecommendationAssignment  # Import your MongoEngine models

ver_code = '0000'
# Get the database handle
db_name, client = get_db_handle('admin', os.environ.get('DB_HOST', 'localhost'), os.environ.get('DB_PORT', 27017),
                                os.environ.get('MONGO_INITDB_ROOT_USERNAME', 'root'),
                                os.environ.get('MONGO_INITDB_ROOT_PASSWORD', 'example'))

# Define Collection
collection = db_name['users']

from .models import Recommendation  # Your model


@csrf_exempt  # Disable CSRF for simplicity; handle CSRF tokens properly in production.
def login(request):
    if request.method == 'POST':
        try:
            # Parse JSON data from the request body
            data = json.loads(request.body)
            email_or_username = data.get('email')
            password = data.get('password')

            # Try to find the user by email
            user = Therapist.objects.filter(email=email_or_username).first()

            if user is not None:
                if user.accepted:
                    # Check hashed password for email login
                    if check_password(password, user['pwdhash']):
                        return JsonResponse({
                            'full_name': f'{user.first_name} {user.name}',
                            'user_type': user['user_type'],
                            'id': str(user['username']),  # Convert to string if using ObjectId or ensure compatibility
                            'specialisation': user['specializations'],
                        }, status=200)
            else:
                # If no user found by email, check by username
                user = Patient.objects.filter(username=email_or_username).first()
                if user:
                    # Check plain password for username login
                    if password == user.access_word:  # Assuming the password is stored as plain text
                        return JsonResponse({
                            'full_name': f'{user.first_name} {user.name}',
                            'user_type': user.user_type,
                            'id': str(user.id),
                            'specialisation': user['function'],
                        }, status=200)
                else:
                    return JsonResponse({'error': 'Invalid Credentials.'}, status=400)


            # If user is not found by either email or username
            return JsonResponse({'error': 'User not found.'}, status=404)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def forgot_password(request):
    if request.method == 'POST':
        ## Parse JSON data from the request body TODO
        data = json.loads(request.body)
        email = data.get('email')
        return JsonResponse({'email': email}, status=200)
    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)


from django.http import JsonResponse
from bson import ObjectId
from core.models import Therapist, Patient  # Adjust import paths if necessary


# Function to fetch patients by therapist ID
@csrf_exempt  # Disable CSRF for simplicity; handle CSRF tokens properly in production
def get_patients_by_therapist(request, therapist_id):
    try:
        # Fetch therapist by ID
        therapist = Therapist.objects.get(username=therapist_id)

        # Fetch patients associated with the therapist
        patients = Patient.objects.filter(therapist=therapist)

        # Convert each patient's '_id' to a string representation using `patient.pk`
        patients_data = []
        for patient in patients:

            patient_dict = dict(patient.to_mongo())

            patient_dict['_id'] = str(patient.pk)  # Convert ObjectId to a string
            patient_dict['therapist'] = str(patient.therapist.name)
            patient_dict['created_at'] = patient['created_at'].isoformat()
            print(patient_dict)
            patients_data.append(patient_dict)


        if not patients_data:
            return JsonResponse({"message": "No patients found for this therapist"}, status=404)

        return JsonResponse(json.loads(json.dumps(patients_data)), safe=False)

    except Therapist.DoesNotExist:
        return JsonResponse({"error": "Therapist not found"}, status=404)

    except Exception as e:
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)



@csrf_exempt  # For simplicity, but handle CSRF properly in production
def get_recommendations(request):
    try:
        # Fetch all recommendations
        recommendations = Recommendation.objects.all()

        # If no recommendations are found, return a 404 response
        if not recommendations:
            return JsonResponse({"message": "No recommendations found."}, status=404)

        # Prepare the response data
        recommendations_list = []

        for rec in recommendations:
            # Start with a base dictionary from the recommendation
            recommendation_data = {
                "_id": str(rec.id),
                "title": rec.title,
                "description": rec.description,
                "content_type": rec.content_type,
                "patient_types": [
                    {
                        "type": pt.type,
                        "frequency": pt.frequency,
                        "include_option": pt.include_option
                    }
                    for pt in rec.patient_types
                ]
            }

            # Handle fields based on content type
            if rec["link"]:
                recommendation_data["link"] = rec.link
            else:
                media_file_path = os.path.join(settings.MEDIA_URL, rec.media_file)
                recommendation_data["media_url"] = f'http://localhost:8000{media_file_path}'

            # Append the formatted recommendation to the list
            recommendations_list.append(recommendation_data)

        return JsonResponse(recommendations_list, safe=False)

    except Exception as e:
        # Return 500 error if something goes wrong
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def reset_password(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        email = data.get('email')
        password = data.get('password')
        user = collection.find_one({'email': email, 'password': password})
        return JsonResponse({'user_type': user['user_type']}, status=200) # TODO
    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)


def convert_to_serializable(obj):
    """Convert MongoEngine objects to serializable dict."""
    if isinstance(obj, ObjectId):
        return str(obj)  # Convert ObjectId to string
    if isinstance(obj, dict):
        return {key: convert_to_serializable(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [convert_to_serializable(item) for item in obj]
    return obj  # Return the object as is if it's not an ObjectId, dict, or list


@csrf_exempt  # For simplicity; handle CSRF properly in production
def get_patients_by_therapist_and_inter(request, therapist, intervention):
    if request.method == 'GET':
        try:
            therapist = Therapist.objects.get(username=therapist)
            intervention = Recommendation.objects.get(pk=intervention)

            # Get therapist's patients and whether they use the intervention
            patients_with_intervention = PatientInterventions.get_therapist_patients_with_intervention(therapist, intervention)
            print(patients_with_intervention)
            return JsonResponse(patients_with_intervention, safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
def rm_rec_intervention_to_patient(request):
    if request.method == 'POST':
        try:
            # Parse JSON body
            data = json.loads(request.body)
            patient_id = data.get('patient_id')
            intervention_id = data.get('intervention_id')

            if not patient_id or not intervention_id:
                return JsonResponse({'error': 'Missing patient_id or intervention_id'}, status=400)

            # Get the Patient and Intervention instances
            patient = Patient.objects.get(username=patient_id)
            intervention = Recommendation.objects.get(pk=intervention_id)

            patient_intervention, created = PatientInterventions.un_recommend(patient, intervention)
            if created:
                print("Unrecomended intervention.")
                return JsonResponse({'success': 'Unrecomended intervention.'}, status=201)
            else:
                print("The intervention was already recommended to this patient.")
                return JsonResponse({'error': 'Intervention not found.'}, status=400)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
def add_intervention_to_patient(request):
    if request.method == 'POST':
        try:
            # Parse JSON body
            data = json.loads(request.body)
            patient_id = data.get('patient_id')
            intervention_id = data.get('intervention_id')

            if not patient_id or not intervention_id:
                return JsonResponse({'error': 'Missing patient_id or intervention_id'}, status=400)

            # Get the Patient and Intervention instances
            patient = Patient.objects.get(username=patient_id)
            intervention = Recommendation.objects.get(pk=intervention_id)


            patient_intervention, created = PatientInterventions.get_or_create(patient, intervention)
            if created:
                print("A new intervention was recommended to the patient.")
                return JsonResponse({'success': 'Intervention recommended to patient'}, status=201)
            else:
                print("The intervention was already recommended to this patient.")
                return JsonResponse({'error': 'Intervention already recommended'}, status=400)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt  # For simplicity; handle CSRF properly in production
def get_patient(request, patient_id):
    if request.method == 'GET':
        try:
            # Fetch user info using the User model
            user_info = Patient.objects.get(username=patient_id)  # Adjust the field if needed
            # Convert to a serializable dictionary
            return JsonResponse(user_info.to_json(), safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)

@csrf_exempt  # For simplicity; handle CSRF properly in production
def get_patient_reha_today(request, patient_id):
    if request.method == 'GET':
        try:
            # Fetch user info using the User model
            patient = Patient.objects.get(pk=patient_id)
            today_rec = PatientInterventions.get_today_recommendations(patient)
            # Convert to a serializable dictionary
            return JsonResponse(today_rec, safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)

@csrf_exempt  # For simplicity; handle CSRF properly in production
def user_profile(request, user_id):
    if request.method == 'GET':
        try:
            # Fetch user info using the User model
            user_info = Therapist.objects.get(username=user_id)  # Adjust the field if needed
            # Convert to a serializable dictionary
            return JsonResponse(user_info.to_json(), safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)

    elif request.method == 'PUT':
        # Update user profile
        data = json.loads(request.body)
        try:
            # Assuming 'id' is the unique identifier in the MongoDB document
            user = Therapist.objects.get(username=user_id)  # Get the user object

            # Update user fields with the new data
            for key, value in data.items():
                if key != "created_at":  # Skip the 'created_at' key
                    setattr(user, key, value)
            user.save()  # Save the changes

            return JsonResponse(user.to_json(), status=200, safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)

    elif request.method == 'DELETE':
        # Delete user profile
        try:
            user = User.objects.get(username=user_id)  # Get the user object
            user.delete()  # Delete the user

            return JsonResponse({"message": "User deleted successfully."}, status=200)

        except DoesNotExist:
            return JsonResponse({"message": "No user found to delete."}, status=404)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def sendVerificationCode(request):
    user_id = json.loads(request.body)['userId']
    try:
        user = collection.find_one({'id': user_id})  # Adjust based on your schema
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)

    # Generate and save verification code
    #verification = SMSVerification.objects.create(user=user)

    # Send SMS TODO
    return JsonResponse({'message': 'Verification code sent'}, status=200)


# views.py
@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def verify_code(request):
    user_id = json.loads(request.body)['userId']
    code = json.loads(request.body)['verificationCode']

    if ver_code == code:
        return JsonResponse({'message': 'Verification successful'}, status=200)
    else:
        return JsonResponse({'error': 'Invalid verification code'}, status=400)
'''try:
    #verification = SMSVerification.objects.get(user=user_id, code=code)
    ver_code === code
except SMSVerification.DoesNotExist:
    return JsonResponse({'error': 'Invalid verification code'}, status=400)

if verification.is_expired():
    return Response({'error': 'Verification code expired'}, status=400)

# If verification is successful, you can now authenticate the user and log them in
verification.delete()  # Optionally, delete the verification code after successful login'''


def assign_recommendations_for_new_patient(patient):
    therapist = patient.therapist
    for rec in therapist.default_recommendations:
        for diagnosis, assign in rec.diagnosis_assignments.items():
            if assign and (diagnosis == "all" or diagnosis in patient.diagnosis):
                intervention = Recommendation.objects.get(pk=rec.recommendation)
                PatientInterventions.get_or_create(patient, intervention)


@csrf_exempt
def register(request):

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            user_type = data.get('userType')
            email = data.get('email')
            password = data.get('password')
            name = data.get('lastName')
            first_name = data.get('firstName')

            # Check if email already exists
            print(Therapist.objects.filter(email=email).first())
            if Therapist.objects.filter(email=email).first():
                return JsonResponse({'error': 'Email already exists'}, status=400)

            # Handle user-specific model creation
            if user_type == 'Patient':
                # Creating a Patient with all required fields
                pat_therapist = Therapist.objects.get(username=data.get('therapist'))
                if pat_therapist:
                    patient = Patient(
                        username=generate_custom_id(user_type),
                        email=email,
                        password=password,
                        user_type=user_type,
                        name=name,
                        first_name=first_name,
                        phone=data.get('phone', ''),  # Assuming phone is provided
                        age=data.get('age', 0),  # Assuming age is provided
                        therapist=pat_therapist,  # Assuming therapist ID is provided
                        sex=get_labels(data, 'sex')[0],  # Assuming sex is provided
                        diagnosis=get_labels(data, 'diagnosis'),  # Assuming diagnosis is provided
                        function=get_labels(data, 'function'),  # Assuming function is provided
                        level_of_education=get_labels(data, 'levelOfEducation')[0],  # Assuming education level is provided
                        professional_status=get_labels(data, 'professionalStatus')[0],  # Assuming professional status is provided
                        marital_status=get_labels(data, 'civilStatus')[0],  # Assuming marital status is provided
                        lifestyle=get_labels(data, 'lifestyle'),  # Assuming lifestyle is provided
                        personal_goals=get_labels(data, 'lifeGoals'),  # Assuming personal goals are provided
                        medication_intake=data.get('medicationIntake', ''),  # Assuming medication intake is provided
                        social_support=data.get('socialSupport', ''),  # Assuming social support is provided
                        access_word=password,  # Assuming access word is provided
                        duration=int(data.get('duration', 0)),
                    )

                    patient.save()
                    assign_recommendations_for_new_patient(patient)
                    print(patient)

                    return JsonResponse({
                        'message': 'Patient registered successfully',
                        'id': str(patient.username)  # MongoEngine id
                    }, status=201)

            elif user_type == 'Therapist':
                # Handle therapist-specific fields
                # Hash the password
                hashed_password = make_password(password)
                # Extracting the labels
                specialisation_label = get_labels(data, "specialisation")
                clinic_labels = get_labels(data, "clinic")
                therapist = Therapist(
                    username=generate_custom_id(user_type),
                    email=email,
                    pwdhash=hashed_password,
                    user_type=user_type,
                    name=name,
                    first_name=first_name,
                    phone=data.get('phone', ''),  # Assuming phone is provided in data
                    specializations=specialisation_label,  # Assuming specializations provided
                    clinics=clinic_labels                   # Assuming clinics provided
                    # Add other therapist-specific fields here
                )
                print(therapist)
                therapist.save()

                return JsonResponse({
                    'message': 'Therapist registered successfully',
                    'id': str(therapist.id)
                }, status=201)
            elif user_type == 'Researcher':
                # Handle therapist-specific fields
                # Hash the password
                hashed_password = make_password(password)
                # Extracting the labels
                specialisation_label = get_labels(data, "Specialisation")
                clinic_labels = get_labels(data, "Clinic")
                researcher = Researcher(
                    username=generate_custom_id('Researcher'),
                    email=email,
                    pwdhash=hashed_password,
                    user_type=user_type,
                    name=name,
                    first_name=first_name,
                    phone=data.get('phone', ''),  # Assuming phone is provided in data
                    specializations=specialisation_label,  # Assuming specializations provided
                    clinics=clinic_labels                   # Assuming clinics provided
                    # Add other therapist-specific fields here
                )
                print(researcher)
                researcher.save()

                return JsonResponse({
                    'message': 'Therapist registered successfully',
                    'id': str(researcher.id)
                }, status=201)
            else:
                # For other user types (e.g., researcher or admin)
                return JsonResponse({
                    'message': 'User registered successfully',
                }, status=201)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)


# Function to get labels
def get_labels(data, key):
    # Check if the key exists in data
    if key in data:
        items = data[key]
        # If items is not a list, make it a list containing the single item
        if not isinstance(items, list):
            items = [items]  # Wrap the single item in a list
        # Return the labels from the list of items
        return [item["label"] for item in items]
    return []  # Return an empty list if the key doesn't exist


def generate_custom_id(user_type: str):
    user_type_prefix = {
        'Therapist': 't',
        'Patient': 'p',
        'Researcher': 'r',
    }.get(user_type)

    existing_users = Patient.objects(user_type=user_type).count() + 1
    return f"{user_type_prefix}{existing_users}"


# Serialize the data properly for JSON
def serialize_datetime(obj):
    """
    Helper function to serialize datetime objects to ISO 8601 format for JSON.
    """
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    elif isinstance(obj, datetime.date):
        return obj.isoformat()
    raise TypeError("Type not serializable")


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def get_patient_recommendations(request, patient_id):
    if request.method == 'GET':
        try:
            recommendations = PatientRecommendation.get_todays_recommendations(patient_id)
            return JsonResponse({'recommendations': recommendations}, safe=False, status=200)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method.'}, status=400)

@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def get_rehab_data(request, patient_id):
    if request.method == 'GET':
        try:
            patient = Patient.objects.get(username=patient_id)
            reha_data = PatientInterventions.get_patient_interventions_with_feedback_and_future_dates(patient)

            # Return the data as JSON response
            return JsonResponse({'reha_data': reha_data, "patient_name": f'{patient.first_name} {patient.name}', "function": patient.function}, safe=False, json_dumps_params={'default': serialize_datetime}, status=200)

        except Patient.DoesNotExist:
            return JsonResponse({'error': 'Patient not found'}, status=404)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


FILE_TYPE_FOLDERS = {
    'mp4': 'videos',
    'mp3': 'audio',
    'jpg': 'images',
    'png': 'images',
    'pdf': 'documents'
}


@csrf_exempt
def add_recommendation(request):
    if request.method == 'POST':
        try:
            # Parse form data or JSON body
            data = request.POST.dict()

            # Parse patientTypes JSON field if present
            if 'patientTypes' in data:
                data['patientTypes'] = json.loads(data['patientTypes'])

            # Check if a recommendation with the same title already exists
            if Recommendation.objects(title=data['title']).first():
                return JsonResponse({'success': False, 'error': 'A recommendation with this title already exists.'},
                                    status=400)

            # Create PatientType embedded documents
            patient_types = [
                PatientType(type=pt['type'], frequency=pt['frequency'], include_option=pt['includeOption'])
                for pt in data.get('patientTypes', [])
            ]

            # Handle media file upload
            media_file_path = ""
            if 'media_file' in request.FILES:
                media_file = request.FILES['media_file']
                file_extension = media_file.name.split('.')[-1].lower()

                # Choose the folder based on file extension
                folder = FILE_TYPE_FOLDERS.get(file_extension, 'others')
                file_path = os.path.join(folder, f"{timezone.now().strftime('%Y%m%d%H%M%S')}_{media_file.name}")

                # Save the file to media directory
                media_file_path = default_storage.save(file_path, media_file)

            # Create the new Recommendation document
            recommendation = Recommendation(
                title=data['title'],
                description=data['description'],
                content_type=data['contentType'],
                link=data.get('link', ''),  # Use `link` instead of `blogLink`
                media_file=media_file_path,  # Path to uploaded media if any
                patient_types=patient_types
            )
            recommendation.save()

            return JsonResponse({'success': True, 'message': 'Recommendation added successfully!'})

        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@csrf_exempt
def give_feedback(request, patient_id, intervention):
    if request.method == 'POST':
        try:
            # Parse JSON data from the request
            data = json.loads(request.body)
            comment = data.get('comment', '')
            rating = data.get('rating', '')

            # Ensure at least one of comment or rating is provided
            if not comment and not rating:
                return JsonResponse({'success': False, 'error': 'At least one of comment or rating is required.'}, status=400)

            # Retrieve the patient intervention
            patient_intervention = PatientInterventions.objects(
                patient_id=patient_id, intervention_id=intervention
            ).first()

            # Check if the intervention was found for the given patient
            if not patient_intervention:
                return JsonResponse({'success': False, 'error': 'Intervention not found for the patient.'}, status=404)

            # Retrieve the Recommendation document for intervention_id reference in Feedback
            recommendation = Recommendation.objects(id=intervention).first()
            if not recommendation:
                return JsonResponse({'success': False, 'error': 'Recommendation not found.'}, status=404)

            # Check if feedback already exists for today
            today = timezone.now().date()
            existing_feedback = next(
                (fb for fb in patient_intervention.feedback if fb.intervention_id == recommendation and fb.date.date() == today),
                None
            )

            if existing_feedback:
                # Update only if each field has a non-empty value
                if comment:
                    existing_feedback.comment = comment
                if rating:
                    existing_feedback.rating = str(rating)
            else:
                # Create new feedback only if at least one value is provided
                new_feedback = Feedback(
                    intervention_id=recommendation,
                    comment=comment if comment else '',
                    rating=str(rating) if rating else ''
                )
                patient_intervention.feedback.append(new_feedback)

            # Save the intervention with the updated or new feedback
            patient_intervention.save()

            return JsonResponse({'success': True, 'message': 'Feedback submitted successfully!'})

        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method.'}, status=400)


@csrf_exempt
def mark_done(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            patient_id = data.get('patient_id')
            intervention_id = data.get('intervention_id')
            feedback = data.get('feedback', None)  # Feedback is optional

            # Retrieve the intervention
            intervention = PatientInterventions.objects(
                patient_id=patient_id,
                intervention_id=intervention_id
            ).first()

            if not intervention:
                return JsonResponse({'error': 'Intervention not found.'}, status=404)

            # Get or default to the current date
            date = timezone.now().date()

            # Use the model's mark_done method
            intervention.mark_done(date=timezone.now(), feedback=feedback)

            # Remove the date from not_completed_dates if it exists there
            if date in [d.date() for d in intervention.not_completed_dates]:
                intervention.not_completed_dates = [
                    d for d in intervention.not_completed_dates if d.date() != date
                ]
                intervention.save()

            return JsonResponse({'success': True, 'message': 'Marked as done successfully.'}, status=200)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    else:
        return JsonResponse({'error': 'Invalid request method.'}, status=400)


@csrf_exempt
def get_recommendation_info(request, intervention):
    if request.method == 'GET':
        try:
            # Retrieve the recommendation details
            recommendation = Recommendation.objects.get(pk=intervention)

            # Collect feedback related to this recommendation across patient interventions
            feedback_list = []
            patient_interventions = PatientInterventions.objects(intervention_id=recommendation)

            # Aggregate feedback data
            for intervention in patient_interventions:
                for fb in intervention.feedback:
                    feedback_list.append({
                        'date': fb.date,
                        'comment': fb.comment,
                        'rating': fb.rating
                    })

            # Prepare recommendation data, conditional on content type
            recommendation_data = {
                'title': recommendation.title,
                'description': recommendation.description,
                'content_type': recommendation.content_type,
                'patient_types': [
                    {
                        'type': pt.type,
                        'frequency': pt.frequency,
                        'include_option': pt.include_option
                    } for pt in recommendation.patient_types
                ]
            }

            # Handle content type for blog, video, and app
            if recommendation.link:
                recommendation_data["link"] = recommendation.link
            elif recommendation.media_file:
                    media_file_path = os.path.join(settings.MEDIA_URL, recommendation.media_file)
                    recommendation_data["media_url"] = f'http://localhost:8000/{media_file_path}'

            # Return recommendation details along with feedback
            return JsonResponse({'recommendation': recommendation_data, 'feedback': feedback_list}, status=200)

        except Recommendation.DoesNotExist:
            return JsonResponse({'error': 'Recommendation not found'}, status=404)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=400)


@csrf_exempt
def assignedDiagnoses(request, intervention, specialisation, therapist_id):
    if request.method == 'GET':
        try:
            # Retrieve the therapist
            therapist = Therapist.objects.get(username=therapist_id)

            # Fetch all diagnoses for the given specialization
            all_diagnoses = config["patientInfo"]["function"][specialisation]["diagnosis"]

            # Initialize the response structure
            diagnosis_status = {diagnosis: False for diagnosis in all_diagnoses}
            all_flag = False

            # Check if the therapist has default recommendations for the provided intervention
            default_rec = next(
                (rec for rec in therapist.default_recommendations if rec.recommendation == intervention),
                None
            )

            if default_rec:
                # Mark diagnoses as true if they're part of the default recommendation
                for diagnosis, assigned in default_rec.diagnosis_assignments.items():
                    if diagnosis == "all":
                        all_flag = assigned
                    elif diagnosis in diagnosis_status:
                        diagnosis_status[diagnosis] = assigned

            return JsonResponse({"diagnoses": diagnosis_status, "all": all_flag}, status=200)

        except Therapist.DoesNotExist:
            return JsonResponse({"error": "Therapist not found"}, status=404)
        except Recommendation.DoesNotExist:
            return JsonResponse({"error": "Recommendation not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Invalid request method"}, status=400)


@csrf_exempt
def assignInterventions_ptypes(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            diagnosis = data.get('diagnosis')
            intervention_id = data.get('intervention_id')
            therapist_id = data.get('therapist')

            if not diagnosis or not intervention_id or not therapist_id:
                return JsonResponse({'error': 'Missing diagnosis, intervention_id, or therapist'}, status=400)

            intervention = Recommendation.objects.get(pk=intervention_id)
            therapist = Therapist.objects.get(username=therapist_id)

            if diagnosis == "all":
                patients = Patient.objects.filter(therapist=therapist)
            else:
                patients = Patient.objects.filter(therapist=therapist, diagnosis__contains=diagnosis)

            for patient in patients:
                PatientInterventions.get_or_create(patient, intervention)

            # Update therapist's default recommendations
            for rec in therapist.default_recommendations:
                if rec.recommendation == intervention_id:
                    rec.diagnosis_assignments[diagnosis] = True
                    break
            else:
                therapist.default_recommendations.append(RecommendationAssignment(
                    recommendation=intervention_id,
                    diagnosis_assignments={diagnosis: True}
                ))
            therapist.save()

            return JsonResponse({'success': f'Intervention assigned to {patients.count()} patients'}, status=201)

        except Recommendation.DoesNotExist:
            return JsonResponse({'error': 'Intervention not found'}, status=404)
        except Therapist.DoesNotExist:
            return JsonResponse({'error': 'Therapist not found'}, status=404)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)


@csrf_exempt
def get_rminterfor_ptypes(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            diagnosis = data.get('diagnosis')
            intervention_id = data.get('intervention_id')
            therapist_id = data.get('therapist')

            if not diagnosis or not intervention_id or not therapist_id:
                return JsonResponse({'error': 'Missing diagnosis, intervention_id, or therapist'}, status=400)

            intervention = Recommendation.objects.get(pk=intervention_id)
            therapist = Therapist.objects.get(username=therapist_id)

            if diagnosis == "all":
                patients = Patient.objects.filter(therapist=therapist)
            else:
                patients = Patient.objects.filter(therapist=therapist, diagnosis__contains=diagnosis)

            for patient in patients:
                PatientInterventions.un_recommend(patient, intervention)

            # Update therapist's default recommendations
            for rec in therapist.default_recommendations:
                if rec.recommendation == intervention_id and diagnosis in rec.diagnosis_assignments:
                    del rec.diagnosis_assignments[diagnosis]
            therapist.save()

            return JsonResponse({'success': f'Intervention removed from {patients.count()} patients'}, status=201)

        except Recommendation.DoesNotExist:
            return JsonResponse({'error': 'Intervention not found'}, status=404)
        except Therapist.DoesNotExist:
            return JsonResponse({'error': 'Therapist not found'}, status=404)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)


# Create your views here.
def index(request):
    return HttpResponse("<h1>Hello and welcome to my <u>Django App</u> project!</h1>")