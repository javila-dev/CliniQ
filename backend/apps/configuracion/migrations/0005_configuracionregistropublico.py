import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0007_servicio_vigencia_meses"),
        ("configuracion", "0004_configuracionwizard"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConfiguracionRegistroPublico",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "tab_personal_requerido",
                    models.BooleanField(
                        default=False,
                        help_text="Si True, el tab Datos personales es obligatorio en el autoregistro publico.",
                    ),
                ),
                (
                    "tab_salud_requerido",
                    models.BooleanField(
                        default=False,
                        help_text="Si True, el tab Salud y afiliacion es obligatorio en el autoregistro publico.",
                    ),
                ),
                (
                    "clinica",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="config_registro_publico",
                        to="clinicas.clinica",
                    ),
                ),
            ],
            options={
                "db_table": "configuracion_registro_publico",
            },
        ),
    ]
