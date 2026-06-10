from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("configuracion", "0002_configuracionhistoria_configuracionsignosvitales"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="documensoconsentimientotemplate",
            name="uniq_documenso_template_clinica_tipo",
        ),
        migrations.AddConstraint(
            model_name="documensoconsentimientotemplate",
            constraint=models.UniqueConstraint(
                fields=("clinica", "template_token"),
                name="uniq_documenso_template_clinica_token",
            ),
        ),
    ]
