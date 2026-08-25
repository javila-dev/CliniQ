import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0025_diagrama_corporal_servicio_diagrama"),
        ("historia_clinica", "0010_consentimientoinformado_plantilla"),
    ]

    operations = [
        migrations.CreateModel(
            name="AnotacionZona",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("x", models.FloatField(help_text="Posición horizontal relativa a la imagen (0.0–1.0)")),
                ("y", models.FloatField(help_text="Posición vertical relativa a la imagen (0.0–1.0)")),
                ("texto", models.TextField(blank=True)),
                (
                    "diagrama",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="anotaciones",
                        to="clinicas.diagramacorporal",
                    ),
                ),
                (
                    "nota",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="anotaciones_zona",
                        to="historia_clinica.notaclinica",
                    ),
                ),
            ],
            options={
                "db_table": "anotaciones_zona",
                "ordering": ["created_at"],
            },
        ),
    ]
