from django.apps import AppConfig


class ColaboradoresConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.colaboradores"
    label = "colaboradores"

    def ready(self):
        import apps.colaboradores.signals  # noqa: F401
