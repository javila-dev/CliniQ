from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("historia_clinica", "0002_fotoclinica_zona_notaclinica_cuidados_post_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="consentimientoinformado",
            name="documenso_document_id",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
