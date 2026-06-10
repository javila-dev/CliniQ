from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("historia_clinica", "0004_consentimientoinformado_documenso_template_fields"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="consentimientoinformado",
            name="uniq_consentimiento_informado_paciente_tipo",
        ),
        migrations.RemoveConstraint(
            model_name="consentimientoinformado",
            name="uniq_consentimiento_informado_paciente_template",
        ),
    ]
