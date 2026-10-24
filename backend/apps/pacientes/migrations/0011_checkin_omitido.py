from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pacientes", "0010_unaccent_extension"),
    ]

    operations = [
        migrations.AddField(
            model_name="checkin",
            name="omitido",
            field=models.BooleanField(db_default=False, default=False),
        ),
    ]
