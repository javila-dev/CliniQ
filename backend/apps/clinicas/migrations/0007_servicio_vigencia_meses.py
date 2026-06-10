from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0006_servicio_documenso_template_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicio",
            name="vigencia_meses",
            field=models.PositiveIntegerField(default=12),
        ),
    ]
