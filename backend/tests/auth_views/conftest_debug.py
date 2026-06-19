import pytest


@pytest.fixture(autouse=True, scope="session")
def check_settings():
    from django.conf import settings
    from rest_framework.settings import api_settings

    print("TESTING:", settings.TESTING)
    print("REST_FRAMEWORK:", settings.REST_FRAMEWORK)
    print("DRF auth:", api_settings.DEFAULT_AUTHENTICATION_CLASSES)
