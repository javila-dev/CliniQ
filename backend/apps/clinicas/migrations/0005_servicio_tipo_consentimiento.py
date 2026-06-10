from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0004_clinica_telefono"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicio",
            name="tipo_consentimiento",
            field=models.CharField(
                blank=True,
                choices=[
                    ("general", "Consentimiento General"),
                    ("toxina_botulinica", "Toxina Botulinica"),
                    ("rellenos", "Rellenos Dermicos"),
                    ("laser", "Laser y Luz Pulsada"),
                    ("peelings", "Peelings y Exfoliaciones"),
                    ("mesoterapia", "Mesoterapia"),
                    ("otros", "Otros procedimientos"),
                ],
                help_text="Tipo de consentimiento informado requerido para el servicio.",
                max_length=30,
                null=True,
            ),
        ),
    ]
