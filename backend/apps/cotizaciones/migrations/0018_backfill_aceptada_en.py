"""Llena aceptada_en / descartada_en en las cotizaciones existentes.

Solo escribe los campos nuevos de 0017; no cambia ningun dato existente. Es
aproximado para el historico (no habia fecha de aceptacion):

* aceptada: la creacion de su cartera; si no tiene, su ultima modificacion.
  Las migradas (asistente de puesta en marcha) usan su fecha de creacion.
* descartada: su ultima modificacion.
"""

from django.db import migrations
from django.db.models import F, OuterRef, Subquery


def backfill(apps, schema_editor):
    Cotizacion = apps.get_model("cotizaciones", "Cotizacion")
    Cartera = apps.get_model("cartera", "Cartera")

    aceptadas = Cotizacion.objects.filter(estado="aceptada", aceptada_en__isnull=True)
    aceptadas.filter(es_migracion=True).update(aceptada_en=F("created_at"))
    cartera_creada = Cartera.objects.filter(cotizacion_id=OuterRef("pk")).values("created_at")[:1]
    aceptadas.filter(es_migracion=False, cartera__isnull=False).update(aceptada_en=Subquery(cartera_creada))
    aceptadas.filter(aceptada_en__isnull=True).update(aceptada_en=F("updated_at"))

    Cotizacion.objects.filter(estado="descartada", descartada_en__isnull=True).update(descartada_en=F("updated_at"))


class Migration(migrations.Migration):

    dependencies = [
        ("cotizaciones", "0017_embudo_comercial"),
        ("cartera", "0007_abonocuota"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
