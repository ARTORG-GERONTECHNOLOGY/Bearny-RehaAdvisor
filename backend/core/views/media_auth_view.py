# core/views/media_auth_view.py
#
# Lightweight endpoint used by nginx auth_request to gate /media/ access.
# nginx sends a subrequest to this URL before serving any /media/ file;
# if the response is 2xx the file is served, otherwise nginx returns 401.
#
# The JWTAuthMiddleware already validates the Bearer token before this view
# is reached, so by the time we get here the request is authenticated.
# We just return 200 to confirm to nginx that the auth check passed.

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def media_auth_check(request):
    return HttpResponse(status=200)
