from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.cotizaciones.models import Cotizacion


@receiver(post_save, sender=Cotizacion)
def crear_tratamientos_al_aceptar(sender, instance, **kwargs):
    if instance.estado != Cotizacion.Estado.ACEPTADA or instance._estado_anterior == Cotizacion.Estado.ACEPTADA:
        return

    from apps.protocolos.services import agregar_sesiones_obsequio, crear_tratamiento_desde_cotizacion

    # Solo ítems vigentes: cada edición del borrador desactiva y recrea los
    # ítems, y los desactivados no deben generar seguimiento clínico.
    for item in instance.items.select_related("servicio", "tratamiento", "procedimiento").prefetch_related(
        "servicio__pasos_protocolo",
        "procedimiento__pasos_protocolo",
        "tratamiento__items__procedimiento",
    ).filter(activo=True):
        # Obsequios informativos, productos y sesiones clonadas no crean un
        # seguimiento propio (las clonadas se agregan al del tratamiento de origen).
        if not item.tiene_cupo_propio:
            continue
        procedimiento = item.procedimiento or item.servicio
        if item.tratamiento_id or (procedimiento and procedimiento.tiene_protocolo):
            crear_tratamiento_desde_cotizacion(item)

    # Segunda pasada: las sesiones clonadas se agregan al seguimiento del
    # tratamiento de origen, que ya existe tras la primera.
    for obsequio in instance.items.filter(
        activo=True, es_obsequio=True, agendable=True, item_origen__isnull=False,
    ).select_related("tipo_sesion_origen"):
        agregar_sesiones_obsequio(obsequio)
    instance._estado_anterior = instance.estado
