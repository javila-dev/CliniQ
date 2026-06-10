from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agenda", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="cita",
            name="fecha_fin_real",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cita",
            name="fecha_inicio_real",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
