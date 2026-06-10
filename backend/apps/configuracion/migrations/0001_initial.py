from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("clinicas", "0005_servicio_tipo_consentimiento"),
        ("historia_clinica", "0002_fotoclinica_zona_notaclinica_cuidados_post_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumensoConsentimientoTemplate",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "tipo",
                    models.CharField(
                        choices=[
                            ("general", "Consentimiento General"),
                            ("toxina_botulinica", "Toxina Botulinica"),
                            ("rellenos", "Rellenos Dermicos"),
                            ("laser", "Laser y Luz Pulsada"),
                            ("peelings", "Peelings y Exfoliaciones"),
                            ("mesoterapia", "Mesoterapia"),
                            ("otros", "Otros procedimientos"),
                        ],
                        max_length=30,
                    ),
                ),
                ("template_token", models.CharField(max_length=500)),
                (
                    "clinica",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="documenso_templates",
                        to="clinicas.clinica",
                    ),
                ),
            ],
            options={
                "db_table": "documenso_consentimiento_templates",
                "ordering": ["tipo"],
            },
        ),
        migrations.AddConstraint(
            model_name="documensoconsentimientotemplate",
            constraint=models.UniqueConstraint(
                fields=("clinica", "tipo"),
                name="uniq_documenso_template_clinica_tipo",
            ),
        ),
    ]
