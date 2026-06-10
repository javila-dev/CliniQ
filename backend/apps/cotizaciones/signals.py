from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.cotizaciones.models import Cotizacion


@receiver(post_save, sender=Cotizacion)
def crear_tratamientos_al_aceptar(sender, instance, **kwargs):
    if instance.estado != Cotizacion.Estado.ACEPTADA or instance._estado_anterior == Cotizacion.Estado.ACEPTADA:
        return

    from apps.protocolos.services import crear_tratamiento_desde_cotizacion

    for item in instance.items.select_related("servicio", "tratamiento", "procedimiento").prefetch_related(
        "servicio__pasos_protocolo",
        "procedimiento__pasos_protocolo",
        "tratamiento__items__procedimiento",
    ).all():
        procedimiento = item.procedimiento or item.servicio
        if item.tratamiento_id or (procedimiento and procedimiento.tiene_protocolo):
            crear_tratamiento_desde_cotizacion(item)
    instance._estado_anterior = instance.estado
