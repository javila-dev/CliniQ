import secrets

import django.db.models.deletion
from django.db import migrations, models


def populate_tokens(apps, schema_editor):
    Clinica = apps.get_model("clinicas", "Clinica")
    used = set()
    for clinica in Clinica.objects.all().only("id", "token_registro_publico"):
        if clinica.token_registro_publico:
            used.add(clinica.token_registro_publico)
            continue
        while True:
            token = secrets.token_urlsafe(24)
            if token not in used:
                used.add(token)
                Clinica.objects.filter(pk=clinica.pk).update(token_registro_publico=token)
                break


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0018_h33_clinica_config_deuda"),
    ]

    operations = [
        migrations.AddField(
            model_name="clinica",
            name="token_registro_publico",
            field=models.CharField(
                blank=True,
                editable=False,
                help_text="Token permanente para el link de autoregistro publico de pacientes.",
                max_length=64,
                null=True,
            ),
        ),
        migrations.RunPython(populate_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="clinica",
            name="token_registro_publico",
            field=models.CharField(
                editable=False,
                help_text="Token permanente para el link de autoregistro publico de pacientes.",
                max_length=64,
                unique=True,
            ),
        ),
    ]
