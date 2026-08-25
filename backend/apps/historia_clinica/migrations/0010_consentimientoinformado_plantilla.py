import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("configuracion", "0007_documenso_template_pdf_campos"),
        ("historia_clinica", "0009_h26_rediseno_notaclinica"),
    ]

    operations = [
        migrations.AddField(
            model_name="consentimientoinformado",
            name="plantilla",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="consentimientos_informados",
                to="configuracion.documensoconsentimientotemplate",
            ),
        ),
    ]
