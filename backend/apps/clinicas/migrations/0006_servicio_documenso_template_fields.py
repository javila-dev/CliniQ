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


def backfill_servicio_documenso_templates(apps, schema_editor):
    Servicio = apps.get_model("clinicas", "Servicio")
    DocumensoConsentimientoTemplate = apps.get_model("configuracion", "DocumensoConsentimientoTemplate")

    templates = {}
    for template in DocumensoConsentimientoTemplate.objects.filter(activo=True):
        templates[(template.clinica_id, template.tipo)] = template.template_token

    for servicio in Servicio.objects.exclude(tipo_consentimiento__isnull=True).exclude(tipo_consentimiento=""):
        token = templates.get((servicio.clinica_id, servicio.tipo_consentimiento))
        if not token:
            continue
        servicio.documenso_template_token = token
        servicio.documenso_template_nombre = TIPO_LABELS.get(servicio.tipo_consentimiento, servicio.tipo_consentimiento)
        servicio.save(update_fields=["documenso_template_token", "documenso_template_nombre"])


class Migration(migrations.Migration):

    dependencies = [
        ("configuracion", "0001_initial"),
        ("clinicas", "0005_servicio_tipo_consentimiento"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicio",
            name="documenso_template_nombre",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="servicio",
            name="documenso_template_token",
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        migrations.RunPython(backfill_servicio_documenso_templates, migrations.RunPython.noop),
    ]
