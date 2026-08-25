from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("historia_clinica", "0011_anotacion_zona"),
    ]

    operations = [
        migrations.AddField(
            model_name="anotacionzona",
            name="radio",
            field=models.FloatField(
                default=0.07,
                help_text="Radio del área tratada como fracción del ancho de la imagen (0.03–0.5)",
            ),
        ),
    ]
