from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0010_tiposesion_tiposesionprocedimiento"),
    ]

    operations = [
        migrations.AlterField(
            model_name="servicio",
            name="precio",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
