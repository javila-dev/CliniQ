"""
Backfill de datos para el paso a stock por sede.

Hasta ahora Insumo.stock_actual/costo_promedio eran un unico numero
compartido por toda la clinica. Este modulo pasa a StockInsumoSede
(insumo + sede), asi que hay que decidir a que sede le asignamos el stock
que ya existia: se le asigna completo a la sede mas antigua (activa) de
cada clinica -- es la mejor aproximacion posible sin un conteo fisico real
por sede, y queda corregible desde ajustes manuales una vez el cliente
confirme donde esta fisicamente cada insumo.

Los MovimientoInventario existentes tambien quedan sin sede: para los que
vienen de una orden de compra (origen=compra, referencia_tipo=orden_compra)
se recupera la sede real de esa orden; el resto (ajustes, consumos, ventas
retail previas a este cambio) hereda la misma sede principal que el insumo.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Insumo = apps.get_model("inventario", "Insumo")
    StockInsumoSede = apps.get_model("inventario", "StockInsumoSede")
    MovimientoInventario = apps.get_model("inventario", "MovimientoInventario")
    Sede = apps.get_model("clinicas", "Sede")
    OrdenCompra = apps.get_model("proveedores", "OrdenCompra")

    sede_principal_por_clinica = {}

    def sede_principal(clinica_id):
        if clinica_id not in sede_principal_por_clinica:
            sede_principal_por_clinica[clinica_id] = (
                Sede.objects.filter(clinica_id=clinica_id, activo=True)
                .order_by("created_at")
                .first()
            )
        return sede_principal_por_clinica[clinica_id]

    for insumo in Insumo.objects.all():
        sede = sede_principal(insumo.clinica_id)
        if sede is None:
            continue  # clinica sin sedes todavia -- nada que migrar de verdad
        StockInsumoSede.objects.update_or_create(
            insumo=insumo,
            sede=sede,
            defaults={
                "stock_actual": insumo.stock_actual,
                "costo_promedio": insumo.costo_promedio,
            },
        )

    ordenes_sede = dict(OrdenCompra.objects.values_list("id", "sede_id"))

    for mov in MovimientoInventario.objects.filter(sede__isnull=True).select_related("insumo"):
        sede_id = None
        if mov.referencia_tipo == "orden_compra" and mov.referencia_id:
            sede_id = ordenes_sede.get(mov.referencia_id)
        if sede_id is None:
            sede = sede_principal(mov.insumo.clinica_id)
            sede_id = sede.id if sede else None
        if sede_id is not None:
            mov.sede_id = sede_id
            mov.save(update_fields=["sede"])


class Migration(migrations.Migration):

    dependencies = [
        ("inventario", "0004_add_stock_insumo_sede"),
        ("proveedores", "0002_ordencompra_fecha_factura_proveedor_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
