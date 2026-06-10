from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0004_passwordresettoken"),
    ]

    operations = [
        migrations.AddField(
            model_name="passwordresettoken",
            name="purpose",
            field=models.CharField(
                choices=[("reset", "Recuperacion"), ("invite", "Invitacion")],
                default="reset",
                max_length=20,
            ),
        ),
    ]
