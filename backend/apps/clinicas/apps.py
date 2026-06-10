from django.apps import AppConfig


class ClinicasConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.clinicas"

    def ready(self):
        import apps.clinicas.signals  # noqa: F401
    label = "clinicas"
