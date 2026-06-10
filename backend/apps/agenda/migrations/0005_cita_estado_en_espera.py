from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("agenda", "0004_registroconfirmacion"),
    ]

    operations = [
        migrations.AlterField(
            model_name="cita",
            name="estado",
            field=models.CharField(
                choices=[
                    ("pendiente", "Pendiente"),
                    ("confirmada", "Confirmada"),
                    ("en_espera", "En espera"),
                    ("en_curso", "En curso"),
                    ("completada", "Completada"),
                    ("cancelada", "Cancelada"),
                    ("no_asistio", "No asistio"),
                ],
                default="pendiente",
                max_length=20,
            ),
        ),
    ]
