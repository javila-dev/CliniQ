from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("agenda", "0002_cita_tiempos_reales"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bloqueoagenda",
            name="profesional",
            field=models.ForeignKey(
                limit_choices_to={"es_profesional": True},
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bloqueos_agenda",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="cita",
            name="profesional",
            field=models.ForeignKey(
                limit_choices_to={"es_profesional": True},
                on_delete=django.db.models.deletion.PROTECT,
                related_name="citas_asignadas",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
