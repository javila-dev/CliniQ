import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0007_servicio_vigencia_meses"),
        ("configuracion", "0003_alter_documensotemplate_unique_constraint"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConfiguracionWizard",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("paso_checkin", models.BooleanField(default=True)),
                ("paso_consentimientos", models.BooleanField(default=True)),
                ("paso_pago", models.BooleanField(default=True)),
                ("paso_firma_asistencia", models.BooleanField(default=True)),
                (
                    "clinica",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="config_wizard",
                        to="clinicas.clinica",
                    ),
                ),
            ],
            options={
                "db_table": "configuracion_wizard",
            },
        ),
    ]
