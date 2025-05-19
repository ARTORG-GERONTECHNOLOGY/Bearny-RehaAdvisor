import logging
import requests
from django.shortcuts import redirect
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from core.models import FitbitUserToken, User, FitbitData, Patient
from bson import ObjectId
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from django.http import JsonResponse
from django.utils.timezone import make_aware, is_naive
logger = logging.getLogger(__name__)

FITBIT_API_URL = 'https://api.fitbit.com/1/user/-'


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_status(request, patient_id):
    connected = FitbitUserToken.objects.filter(user=ObjectId(patient_id)).count() > 0
    logger.info(f"[fitbit_status] Patient {patient_id} connected: {connected}")
    return JsonResponse({'connected': connected})


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_callback(request):
    code = request.GET.get('code')
    state = request.GET.get('state')  # carries patient_id from frontend

    if not code:
        logger.warning("[fitbit_callback] No code returned from Fitbit.")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=missing_code")

    if not state:
        logger.error("[fitbit_callback] Missing 'state' param (patient_id).")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=unauthorized")

    try:
        user_id = ObjectId(state)
        user = User.objects.get(id=user_id)
    except Exception as e:
        logger.exception(f"[fitbit_callback] Invalid or missing user: {e}")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=invalid_user")

    logger.info(f"[fitbit_callback] Received code: {code} for user {user.id}")

    token_url = 'https://api.fitbit.com/oauth2/token'
    client_id = settings.FITBIT_CLIENT_ID
    client_secret = settings.FITBIT_CLIENT_SECRET
    redirect_uri = settings.FITBIT_REDIRECT_URI
    basic_auth = requests.auth.HTTPBasicAuth(client_id, client_secret)

    data = {
        'client_id': client_id,
        'grant_type': 'authorization_code',
        'redirect_uri': redirect_uri,
        'code': code,
    }

    headers = {'Content-Type': 'application/x-www-form-urlencoded'}

    try:
        response = requests.post(token_url, auth=basic_auth, data=data, headers=headers)
        logger.debug(f"[fitbit_callback] Token exchange response: {response.status_code}, {response.text}")

        if response.status_code == 200:
            token_data = response.json()

            FitbitUserToken.objects(user=user).update_one(
                set__access_token=token_data['access_token'],
                set__refresh_token=token_data['refresh_token'],
                set__expires_at=timezone.now() + timedelta(seconds=token_data['expires_in']),
                set__fitbit_user_id=token_data['user_id'],
                upsert=True
            )

            logger.info(f"[fitbit_callback] Fitbit token saved for user {user.id}")
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=connected")

        else:
            logger.error(f"[fitbit_callback] Fitbit token exchange failed: {response.text}")
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")

    except Exception as e:
        logger.exception(f"[fitbit_callback] Exception during token exchange: {e}")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")



def get_valid_access_token(user):
    token = FitbitUserToken.objects.get(user=user)

    if is_naive(token.expires_at):
        token.expires_at = make_aware(token.expires_at)

    if token.expires_at <= timezone.now():
        refresh_url = 'https://api.fitbit.com/oauth2/token'
        client_id = settings.FITBIT_CLIENT_ID
        client_secret = settings.FITBIT_CLIENT_SECRET
        basic_auth = requests.auth.HTTPBasicAuth(client_id, client_secret)

        data = {
            'grant_type': 'refresh_token',
            'refresh_token': token.refresh_token,
        }
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}

        try:
            response = requests.post(refresh_url, auth=basic_auth, data=data, headers=headers)
            logger.debug(f"[get_valid_access_token] Refresh token response status: {response.status_code}")
            logger.debug(f"[get_valid_access_token] Response text: {response.text}")

            if response.status_code == 200:
                token_data = response.json()
                token.access_token = token_data['access_token']
                token.refresh_token = token_data.get('refresh_token', token.refresh_token)
                token.expires_at = timezone.now() + timedelta(seconds=token_data['expires_in'])
                token.save()
                logger.info(f"[get_valid_access_token] Token refreshed for user {user.id}")
            else:
                logger.error(f"[get_valid_access_token] Failed to refresh token. Status: {response.status_code}, Body: {response.text}")
                raise Exception('Failed to refresh Fitbit token')
        except Exception as e:
            logger.exception(f"[get_valid_access_token] Exception while refreshing token: {e}")
            raise

    return token.access_token


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_fitbit_health_data(request, patient_id):
    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))

        # Use MongoEngine query and sort
        entries = FitbitData.objects(user=patient.userId).order_by('date')

        data = [
            {
                "date": entry.date.strftime('%Y-%m-%d'),
                "steps": entry.steps,
                "resting_heart_rate": entry.resting_heart_rate,
            }
            for entry in entries
        ]

        return JsonResponse({"data": data}, safe=False)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)