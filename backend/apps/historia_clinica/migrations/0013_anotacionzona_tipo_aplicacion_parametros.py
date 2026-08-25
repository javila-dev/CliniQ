from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("historia_clinica", "0012_anotacionzona_radio"),
    ]

    operations = [
        migrations.AddField(
            model_name="anotacionzona",
            name="tipo_aplicacion",
            field=models.CharField(
                blank=True,
                choices=[
                    ("equipo", "Equipo"),
                    ("inyectable", "Inyectable"),
                    ("topico", "Tópico"),
                    ("laser", "Láser"),
                    ("otro", "Otro"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="anotacionzona",
            name="parametros",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
