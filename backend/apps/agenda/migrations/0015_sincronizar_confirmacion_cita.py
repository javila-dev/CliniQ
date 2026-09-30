from django.db import migrations
from django.db.models import F
from django.db.models.functions import Coalesce


def sincronizar(apps, schema_editor):
    """Alinea las dos confirmaciones de la cita: confirmada (estado) y paciente confirmó
    (estado_confirmacion). Antes se guardaban por separado y quedaban "Confirmada" +
    "Por confirmar", o "Pendiente" + "Paciente confirmó"."""
    Cita = apps.get_model("agenda", "Cita")
    Cita.objects.filter(estado="confirmada").exclude(estado_confirmacion="confirmado").update(
        estado_confirmacion="confirmado",
        confirmado_en=Coalesce(F("confirmado_en"), F("updated_at")),
    )
    Cita.objects.filter(estado="pendiente", estado_confirmacion="confirmado").update(estado="confirmada")


class Migration(migrations.Migration):
    dependencies = [
        ("agenda", "0014_cita_es_migracion_cita_lote_migracion"),
    ]

    operations = [
        migrations.RunPython(sincronizar, migrations.RunPython.noop),
    ]
