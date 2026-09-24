from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.clinicas.models import Clinica, PasoProtocolo, Servicio


@receiver(post_save, sender=Clinica)
def create_default_formas_pago_for_clinic(sender, instance, created, **kwargs):
    if created:
        from apps.clinicas.formas_pago import ensure_default_formas_pago_for_clinica

        ensure_default_formas_pago_for_clinica(instance)


def sync_servicio_tiene_protocolo(servicio_id):
    tiene_protocolo = PasoProtocolo.objects.filter(servicio_id=servicio_id, activo=True).exists()
    Servicio.objects.filter(id=servicio_id).update(tiene_protocolo=tiene_protocolo)


@receiver(post_save, sender=PasoProtocolo)
def paso_protocolo_post_save(sender, instance, **kwargs):
    sync_servicio_tiene_protocolo(instance.servicio_id)


@receiver(post_delete, sender=PasoProtocolo)
def paso_protocolo_post_delete(sender, instance, **kwargs):
    sync_servicio_tiene_protocolo(instance.servicio_id)
