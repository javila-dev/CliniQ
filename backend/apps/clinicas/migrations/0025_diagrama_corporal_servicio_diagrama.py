import apps.clinicas.models
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0024_add_facial_verificacion_habilitada"),
    ]

    operations = [
        migrations.CreateModel(
            name="DiagramaCorporal",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("nombre", models.CharField(max_length=255)),
                ("imagen", models.ImageField(upload_to=apps.clinicas.models.diagrama_upload_path)),
                ("orden", models.PositiveIntegerField(default=0)),
            ],
            options={
                "db_table": "diagramas_corporales",
                "ordering": ["orden", "nombre"],
            },
        ),
        migrations.CreateModel(
            name="ServicioDiagrama",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("orden", models.PositiveIntegerField(default=1)),
                (
                    "diagrama",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="servicios",
                        to="clinicas.diagramacorporal",
                    ),
                ),
                (
                    "servicio",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="diagramas",
                        to="clinicas.servicio",
                    ),
                ),
            ],
            options={
                "db_table": "servicios_diagramas",
                "ordering": ["orden", "created_at"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="serviciodiagrama",
            unique_together={("servicio", "diagrama")},
        ),
    ]
