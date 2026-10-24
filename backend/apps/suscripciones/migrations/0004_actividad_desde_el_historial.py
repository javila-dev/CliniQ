"""Rellena la actividad diaria con lo que ya registra el historial (LogAccion):
cada acción de un usuario de la clínica cuenta como uso ese día. Sin esto, los
días activos empezarían a contar desde el despliegue."""

import zoneinfo

from django.db import migrations
from django.db.models import Count, F, Max
from django.db.models.functions import TruncDate


def rellenar(apps, schema_editor):
    LogAccion = apps.get_model("core", "LogAccion")
    ActividadDiaria = apps.get_model("suscripciones", "ActividadDiaria")
    bogota = zoneinfo.ZoneInfo("America/Bogota")
    filas = (
        LogAccion.objects.filter(clinica__isnull=False, usuario__clinica_id=F("clinica_id"))
        .annotate(fecha=TruncDate("created_at", tzinfo=bogota))
        .values("clinica_id", "usuario_id", "fecha")
        .annotate(bloques=Count("id"), ultima_at=Max("created_at"))
    )
    ActividadDiaria.objects.bulk_create(
        [ActividadDiaria(**fila) for fila in filas.iterator()],
        batch_size=1000,
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("suscripciones", "0003_seguimiento_activacion"),
        ("core", "0004_configuracionglobal_correos_ciclo_vida_habilitados"),
        ("users", "0026_sesion_suplantacion"),
    ]

    operations = [migrations.RunPython(rellenar, migrations.RunPython.noop)]
