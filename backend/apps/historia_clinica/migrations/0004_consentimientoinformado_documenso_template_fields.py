from django.db import migrations, models


TIPO_LABELS = {
    "general": "Consentimiento General",
    "toxina_botulinica": "Toxina Botulinica",
    "rellenos": "Rellenos Dermicos",
    "laser": "Laser y Luz Pulsada",
    "peelings": "Peelings y Exfoliaciones",
    "mesoterapia": "Mesoterapia",
    "otros": "Otros procedimientos",
}


def backfill_consentimiento_documenso_templates(apps, schema_editor):
    ConsentimientoInformado = apps.get_model("historia_clinica", "ConsentimientoInformado")
    DocumensoConsentimientoTemplate = apps.get_model("configuracion", "DocumensoConsentimientoTemplate")

    templates = {}
    for template in DocumensoConsentimientoTemplate.objects.filter(activo=True):
        templates[(template.clinica_id, template.tipo)] = template.template_token

    for consentimiento in ConsentimientoInformado.objects.all():
        token = templates.get((consentimiento.clinica_id, consentimiento.tipo))
        if not token:
            token = consentimiento.tipo
        consentimiento.documenso_template_token = token
        consentimiento.documenso_template_nombre = TIPO_LABELS.get(consentimiento.tipo, consentimiento.tipo)
        consentimiento.save(update_fields=["documenso_template_token", "documenso_template_nombre"])


class Migration(migrations.Migration):

    dependencies = [
        ("configuracion", "0001_initial"),
        ("clinicas", "0006_servicio_documenso_template_fields"),
        ("historia_clinica", "0003_consentimientoinformado_documenso_document_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="consentimientoinformado",
            name="documenso_template_nombre",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="consentimientoinformado",
            name="documenso_template_token",
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        migrations.RunPython(backfill_consentimiento_documenso_templates, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="consentimientoinformado",
            constraint=models.UniqueConstraint(
                fields=("paciente", "documenso_template_token"),
                name="uniq_consentimiento_informado_paciente_template",
            ),
        ),
    ]
