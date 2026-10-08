from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("consentimientos", "0005_consentimiento_plantilla_opcional"),
    ]

    operations = [
        migrations.AddField(
            model_name="consentimiento",
            name="link_enviado_en",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="consentimiento",
            name="link_enviado_a",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
