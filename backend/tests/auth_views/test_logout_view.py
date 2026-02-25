"""
Cleaned authentication logout view tests (minimal, valid).
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

import json
from datetime import datetime

from django.test import Client

from core.models import User


@pytest.fixture(autouse=True)
def mongo_mock():
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


client = Client()


def test_logout_success(mongo_mock):
    user = User(
        username="logoutuser",
        role="Patient",
        email="logout@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        "/api/auth/logout/",
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
    )
    assert resp.status_code == 200


def test_logout_user_not_found(mongo_mock):
    resp = client.post(
        "/api/auth/logout/",
        data=json.dumps({"userId": "507f1f77bcf86cd799439011"}),
        content_type="application/json",
    )
    assert resp.status_code == 404


def test_logout_missing_user_id(mongo_mock):
    resp = client.post(
        "/api/auth/logout/",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
