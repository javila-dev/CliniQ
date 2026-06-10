from django.db import migrations, models


def backfill_es_profesional(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(rol="profesional").update(es_profesional=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_alter_user_options_remove_user_username_user_clinica_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="es_profesional",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_es_profesional, noop_reverse),
    ]
