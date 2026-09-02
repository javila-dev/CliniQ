from decimal import Decimal

from django.db import migrations


def unificar_precio(apps, schema_editor):
    """Un solo precio por procedimiento.

    - Los que solo tenían `precio` (referencia) y no `precio_base`: se copia
      `precio` -> `precio_base` y se les pone `descuento_maximo_pct = 100`
      (precio libre) para conservar el comportamiento actual (editable sin tope).
    - Los que ya tenían `precio_base`: se respeta tal cual (precio y tope).
    - Se espeja `precio_base` -> `precio` en todos para dejar ambas columnas
      iguales.
    """
    Servicio = apps.get_model("clinicas", "Servicio")

    solo_referencia = Servicio.objects.filter(precio_base__isnull=True, precio__isnull=False)
    solo_referencia.update(precio_base=None)  # no-op explícito para claridad
    for s in solo_referencia.iterator():
        s.precio_base = s.precio
        s.descuento_maximo_pct = Decimal("100")
        s.save(update_fields=["precio_base", "descuento_maximo_pct"])

    # Espejar precio_base -> precio en los que ya tenían precio_base.
    for s in Servicio.objects.filter(precio_base__isnull=False).iterator():
        if s.precio != s.precio_base:
            s.precio = s.precio_base
            s.save(update_fields=["precio"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0030_clinica_modo_puesta_en_marcha"),
    ]

    operations = [
        migrations.RunPython(unificar_precio, noop),
    ]
