import json

from django.contrib.auth.hashers import check_password, make_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import datetime

from core.models import Therapist, Patient
from utils.utils import (
    get_labels,
    generate_custom_id
)


@csrf_exempt  # Disable CSRF for simplicity; handle CSRF tokens properly in production.
def login(request):
    host = request.META.get('HTTP_HOST')
    print(f"HTTP_HOST: {host}")
    if request.method == 'POST':
        # Parse JSON data from the request body
        data = json.loads(request.body)
        email_or_username = data.get('email')
        password = data.get('password')

            # Try to find the user by email
        try:
            user = Therapist.objects.get(email=email_or_username)
        except Therapist.DoesNotExist:
            user = None

        if user is not None:
            if user.accepted:
                # Check hashed password for email login
                if check_password(password, user['pwdhash']):
                    # Generate or fetch the token
                    # Generate JWT tokens
                    refresh = RefreshToken.for_user(user)
                    access_token = str(refresh.access_token)
                    refresh_token = str(refresh)
                    return JsonResponse({
                        'full_name': f'{user.first_name} {user.name}',
                        'user_type': user['user_type'],
                        'id': str(user['username']),  # Convert to string if using ObjectId or ensure compatibility
                        'specialisation': user['specializations'],
                        'access_token': access_token,
                        'refresh_token': refresh_token,
                    }, status=200)
        else:
            # If no user found by email, check by username
            user = Patient.objects.filter(username=email_or_username).first()
            if user:
                # Check plain password for username login
                if password == user.access_word:  # Assuming the password is stored as plain text
                    # Generate or fetch the token
                    refresh = RefreshToken.for_user(user)
                    access_token = str(refresh.access_token)
                    refresh_token = str(refresh)
                    return JsonResponse({
                        'full_name': f'{user.first_name} {user.name}',
                        'user_type': user.user_type,
                        'id': str(user.id),
                        'specialisation': user['function'],
                        'access_token': access_token,
                        'refresh_token': refresh_token,
                    }, status=200)
            else:
                return JsonResponse({'error': 'Invalid Credentials.'}, status=400)

        # If user is not found by either email or username
        return JsonResponse({'error': 'User not found.'}, status=404)
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

        if Therapist.objects.filter(email=email):
            return JsonResponse({'error': 'Email already exists'}, status=400)

        if user_type == 'Patient':
            # Creating a Patient with all required fields
            pat_therapist = Therapist.objects.get(username=data.get('therapist'))
            if pat_therapist:
                reha_end_date=datetime.strptime(data.get('rehaEndDate'), "%Y-%m-%d")

                patient = Patient(
                    username=generate_custom_id(user_type),
                    email=email,
                    pwdhash=password,
                    user_type=user_type,
                    name=data.get('lastName', ''),
                    first_name=data.get('firstName', ''),
                    phone=data.get('phone', ''),  # Assuming phone is provided
                    age=data.get('age', 0),  # Assuming age is provided
                    therapist=pat_therapist,  # Assuming therapist ID is provided
                    sex=get_labels(data, 'sex')[0],  # Assuming sex is provided
                    diagnosis=get_labels(data, 'diagnosis'),  # Assuming diagnosis is provided
                    function=get_labels(data, 'function'),  # Assuming function is provided
                    level_of_education=get_labels(data, 'levelOfEducation')[0],  # Assuming education level is provided
                    professional_status=get_labels(data, 'professionalStatus')[0],
                    # Assuming professional status is provided
                    marital_status=get_labels(data, 'civilStatus')[0],  # Assuming marital status is provided
                    lifestyle=get_labels(data, 'lifestyle'),  # Assuming lifestyle is provided
                    personal_goals=get_labels(data, 'lifeGoals'),  # Assuming personal goals are provided
                    medication_intake=data.get('medicationIntake', ''),  # Assuming medication intake is provided
                    social_support=data.get('socialSupport', ''),  # Assuming social support is provided
                    access_word=data.get('password'), 
                    duration=int((reha_end_date.date() - datetime.today().date()).days),
                    reha_end_date=reha_end_date
                )

            patient.save()
            return JsonResponse({'message': 'Patient registered successfully', 'id': patient.username}, status=201)

        elif user_type == 'Therapist':
            # Extracting the labels
            specialisation_label = get_labels(data, "specialisation")
            clinic_labels = get_labels(data, "clinic")
            therapist = Therapist(
                username=generate_custom_id(user_type),
                email=email,
                pwdhash=password,
                user_type=user_type,
                name=data.get('lastName', ''),
                first_name=data.get('firstName', ''),
                phone=data.get('phone', ''),  # Assuming phone is provided in data
                specializations=specialisation_label,  # Assuming specializations provided
                clinics=clinic_labels,  # Assuming clinics provided
                care_giver=ata.get('careGiver', '')
                # Add other therapist-specific fields here
            )
            print('hi')
            therapist.save()
            return JsonResponse({'message': 'Therapist registered successfully', 'id': therapist.username}, status=201)

        else:
            return JsonResponse({'error': 'Unsupported user type'}, status=400)

    except Therapist.DoesNotExist:
        return JsonResponse({'error': 'Therapist not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def sendVerificationCode(request):
    user_id = json.loads(request.body)['userId']

    #user = Therapist.find_one({'username': user_id})  # Adjust based on your schema
    #if user:
    #    return JsonResponse({'error': 'User not found'}, status=404)

    # Generate and save verification code
    # verification = SMSVerification.objects.create(user=user)

    # Send SMS TODO
    return JsonResponse({'message': 'Verification code sent'}, status=200)


@csrf_exempt  # Disable CSRF for simplicity; for production, ensure to handle CSRF tokens properly.
def verify_code(request):
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
