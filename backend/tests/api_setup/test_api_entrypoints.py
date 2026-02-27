import importlib
import os
import sys
from unittest.mock import patch


def _reload(module_name: str):
    if module_name in sys.modules:
        del sys.modules[module_name]
    return importlib.import_module(module_name)


def test_asgi_sets_default_settings_module_and_builds_application(monkeypatch):
    monkeypatch.delenv("DJANGO_SETTINGS_MODULE", raising=False)
    with patch("django.core.asgi.get_asgi_application", return_value="asgi-app") as mocked:
        mod = _reload("api.asgi")
    assert os.environ.get("DJANGO_SETTINGS_MODULE") == "api.settings"
    assert mod.application == "asgi-app"
    mocked.assert_called_once()


def test_wsgi_uses_existing_settings_module_and_builds_application(monkeypatch):
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "api.settings.prod")
    with patch("django.core.wsgi.get_wsgi_application", return_value="wsgi-app") as mocked:
        mod = _reload("api.wsgi")
    assert os.environ.get("DJANGO_SETTINGS_MODULE") == "api.settings.prod"
    assert mod.application == "wsgi-app"
    mocked.assert_called_once()


def test_prod_settings_secure_ssl_redirect_respects_env(monkeypatch):
    monkeypatch.setenv("SECURE_SSL_REDIRECT", "true")
    mod = _reload("api.settings.prod")
    assert mod.DEBUG is False
    assert mod.SECURE_SSL_REDIRECT is True
    assert mod.CSRF_COOKIE_SECURE is True
    assert mod.SESSION_COOKIE_SECURE is True
