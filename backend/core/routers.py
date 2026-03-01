class BeatRouter:
    def db_for_read(self, model, **hints):
        if model._meta.app_label == "django_celery_beat":
            return "beat"
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == "django_celery_beat":
            return "beat"
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == "django_celery_beat":
            return db == "beat"
        return None
