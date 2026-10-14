from django.contrib.postgres.operations import UnaccentExtension
from django.db import migrations


class Migration(migrations.Migration):
    """unaccent() para que el buscador rápido encuentre "Gomez" sin tilde (M2-21)."""

    dependencies = [
        ("pacientes", "0009_configuracionfacial_min_resolution"),
    ]

    operations = [
        UnaccentExtension(),
    ]
