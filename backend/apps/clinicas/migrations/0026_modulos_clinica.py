from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0025_diagrama_corporal_servicio_diagrama"),
    ]

    operations = [
        migrations.AddField(
            model_name="clinica",
            name="modulo_estetico_habilitado",
            field=models.BooleanField(
                default=True,
                help_text="Habilita el módulo estético (procedimientos, zonas corporales). Activado por defecto.",
            ),
        ),
        migrations.AddField(
            model_name="clinica",
            name="modulo_obesidad_habilitado",
            field=models.BooleanField(
                default=False,
                help_text="Habilita el módulo de obesidad (tratamientos, sesiones, control de peso). Activado por superadmin.",
            ),
        ),
    ]
