from django.apps import AppConfig


class HistoriaClinicaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.historia_clinica"
    label = "historia_clinica"

    def ready(self):
        import apps.historia_clinica.signals  # noqa: F401
