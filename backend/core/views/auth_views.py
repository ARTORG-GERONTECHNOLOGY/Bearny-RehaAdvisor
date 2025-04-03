import json

from django.contrib.auth.hashers import check_password, make_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import datetime
from django.db.models import Q
from bson import ObjectId
from django.utils import timezone

from core.models import Therapist, Patient, User, Therapist, Logs, InterventionAssignment, RehabilitationPlan, PatientInterventionLogs
from utils.utils import (
    get_labels,
    generate_custom_id,
    generate_repeat_dates
)


def create_rehab_plan(patient, therapist):
    try:
        new_interventions = []
        patient_diagnoses = patient.diagnosis  # Assuming it's a list
        interventions_data = therapist.default_recommendations

        for item in interventions_data:
            for diagnosis in patient_diagnoses:
                # Skip if the intervention is not assigned to this diagnosis
                if diagnosis not in item.diagnosis_assignments:
                    continue

                assignment_data = item.diagnosis_assignments[diagnosis]

                if not assignment_data.active:
                    continue

                # Construct intervention schedule config
                intervention_dates = {
                    "interval": int(assignment_data.interval) or 1,
                    "unit": assignment_data.unit or "week",
                    "selectedDays": assignment_data.selected_days or [],
                    'end':{
                        "type": assignment_data.end_type or "never",
                        "count": assignment_data.count_limit,
                    }
                   
                }
                scheduled_dates = generate_repeat_dates(patient.reha_end_date, intervention_dates)
                assignment = InterventionAssignment(
                    interventionId=item.recommendation,
                    frequency="",  # Adjust if needed
                    notes="",
                    dates=scheduled_dates
                )
                new_interventions.append(assignment)
        # Avoid duplicates by checking existing plan
        existing_plan = RehabilitationPlan.objects(patientId=patient).first()
        if existing_plan:
            existing_ids = {str(i.interventionId.id) for i in existing_plan.interventions}
            interventions_to_add = [
                ni for ni in new_interventions
                if str(ni.interventionId.id) not in existing_ids
            ]
            if interventions_to_add:
                existing_plan.interventions.extend(interventions_to_add)
                existing_plan.updatedAt = timezone.now()
                existing_plan.save()
        else:
            rehab_plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=patient.userId.createdAt,
                endDate=patient.reha_end_date,
                status="active",
                interventions=new_interventions,
                createdAt=timezone.now(),
                updatedAt=timezone.now()
            )
            rehab_plan.save()

        return True

    except Exception as e:
        print(f"Error creating rehab plan: {e}")




@csrf_exempt  # Disable CSRF for simplicity; handle CSRF tokens properly in production.
def login(request):
    if request.method == 'POST':
        # Parse JSON data from the request body
        data = json.loads(request.body)
        # Try to find the user by email
        try:
            user = User.objects.filter(__raw__={"$or": [{"email": data.get('email')}, {"username": data.get('email')}]}).first()
            if user.role == 'Therapist':
                name = Therapist.objects.get(userId=user).first_name
                spec = Therapist.objects.get(userId=user).specializations
            else:
                name = Patient.objects.get(userId=user).first_name
                spec = Patient.objects.get(userId=user).function

        except Therapist.DoesNotExist:
            user = None

        if user is not None:
            if user.isActive:
                # Check hashed password for email login
                if check_password(data.get('password'), user['pwdhash']):
                    log = Logs(
                        userId = user,
                        action = 'LOGIN',
                        userAgent = user.role
                    )
                    log.save()
                    # Generate or fetch the token
                    # Generate JWT tokens
                    refresh = RefreshToken.for_user(user)
                    access_token = str(refresh.access_token)
                    refresh_token = str(refresh)
                    return JsonResponse({
                        'user_type': user['role'],
                        'id': str(user["id"]),  # Convert to string if using ObjectId or ensure compatibility
                        'access_token': access_token,
                        'refresh_token': refresh_token,
                        'full_name': name,
                        'specialisation': spec
                    }, status=200)
                else:
                    return JsonResponse({'error': 'Invalid Credentials.'}, status=400)
            else:
                    return JsonResponse({'error': 'User has not been yet accepted.'}, status=400)
        else: 
            # If user is not found by either email or username
            return JsonResponse({'error': 'User not found.'}, status=404)
    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)

@permission_classes([IsAuthenticated])
@csrf_exempt  # Disable CSRF for simplicity; handle CSRF tokens properly in production.
def logout(request):
    if request.method == 'POST':
        # Parse JSON data from the request body
        data = json.loads(request.body)
        user = User.objects.get(pk=ObjectId(data.get('userId')))
        # Try to find the user by email
        try:
            Logs(
                        userId = user,
                        action = 'LOGOUT',
                        userAgent = user.role
            ).save()
        except:
            pass
        return JsonResponse({'data': 'OK'}, status=200)
    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def forgot_password(request):  # TODO
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        email = data.get('email')
        return JsonResponse({'email': email}, status=200)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)


@csrf_exempt
@permission_classes([IsAuthenticated])
def reset_password(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        email = data.get('email')
        new_password = data.get('password')

        user = collection.find_one({'email': email})
        if user:
            hashed_password = make_password(new_password)
            collection.update_one({'email': email}, {'$set': {'password': hashed_password}})
            return JsonResponse({'message': 'Password reset successfully'}, status=200)

        return JsonResponse({'error': 'User not found'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def register(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        user_type = data.get('userType')
        email = data.get('email')
        password = make_password(data.get('password'))

        if User.objects.filter(email=email):
            return JsonResponse({'error': 'Email already exists'}, status=400)

        user = User(
            username = generate_custom_id( data.get('userType')),
            role =  data.get('userType'),
            createdAt = datetime.today(),
            email = data.get('email'),
            phone = data.get('phone', ''),
            pwdhash = password,
            isActive = data.get('userType') == "Patient"
        )
        user.save()

        if user_type == 'Patient':
            # Creating a Patient with all required fields
            therapist_user = User.objects.get(pk=data.get('therapist'))
            pat_therapist = Therapist.objects.get(userId=therapist_user)
            if pat_therapist:
                reha_end_date=datetime.strptime(data.get('rehaEndDate'), "%Y-%m-%d")

                patient = Patient(
                    userId=user,
                    name=data.get('lastName'),
                    first_name=data.get('firstName'),
                    age=data.get('age', ''),  # Assuming age is provided
                    therapist=pat_therapist,  # Assuming therapist ID is provided
                    sex=data.get('sex'),  # Assuming sex is provided
                    diagnosis=data.get('diagnosis'),  # Assuming diagnosis is provided
                    function=data.get('function'),  # Assuming function is provided
                    level_of_education=data.get('levelOfEducation'),  # Assuming education level is provided
                    professional_status=data.get('professionalStatus'),
                    # Assuming professional status is provided
                    marital_status=data.get('civilStatus'),  # Assuming marital status is provided
                    lifestyle=data.get('lifestyle'),  # Assuming lifestyle is provided
                    personal_goals=data.get('lifeGoals'),  # Assuming personal goals are provided
                    medication_intake=data.get('medicationIntake', '-'),  # Assuming medication intake is provided
                    social_support=data.get('socialSupport', []),  # Assuming social support is provided
                    access_word=data.get('password'), 
                    duration=int((reha_end_date.date() - datetime.today().date()).days),
                    reha_end_date=reha_end_date,
                    care_giver=data.get('carreGiver', '')
                )

            patient.save()
            res = create_rehab_plan(patient, pat_therapist)
            if res:
                return JsonResponse({'message': 'Patient registered successfully', 'id': user.username}, status=201)
            else:
                return JsonResponse({'error': 'Rehabilitation plan creation failed.'}, status=400)

        elif user_type == 'Therapist':
            therapist = Therapist(
                userId = user,
                name=data.get('lastName', ''),
                first_name=data.get('firstName', ''),
                specializations=data.get("specialisation"),  # Assuming specializations provided
                clinics=data.get( "clinic"),  # Assuming clinics provided
            )
            therapist.save()
            return JsonResponse({'message': 'Therapist registered successfully', 'id': user.username}, status=201)

        else:
            return JsonResponse({'error': 'Unsupported user type'}, status=400)

    except Therapist.DoesNotExist:
        return JsonResponse({'error': 'Therapist not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def sendVerificationCode(request): # TODO
    user_id = json.loads(request.body)['userId']

    #user = User.find_one({'username': user_id})  # Adjust based on your schema
    #if user:
    #    return JsonResponse({'error': 'User not found'}, status=404)

    # Generate and save verification code
    # verification = SMSVerification.objects.create(user=user)

    # Send SMS TODO
    return JsonResponse({'message': 'Verification code sent'}, status=200)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def verify_code(request): # TODO
    code = json.loads(request.body)['verificationCode']

    if '0000' == code:
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

