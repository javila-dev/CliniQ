"""Avance automático del embudo con lo que ya pasa en la app.

Cada receptor delega en ``services`` (envuelto para que un error del
seguimiento nunca impida agendar, enviar ni aceptar una cotización).
"""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.agenda.models import Cita
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
from apps.seguimiento import services


@receiver(post_save, sender=Cita, dispatch_uid="seguimiento_cita_creada")
def cita_creada(sender, instance, created, **kwargs):
    if created:
        transaction.on_commit(lambda: services.al_crear_cita(instance))


@receiver(post_save, sender=Cotizacion, dispatch_uid="seguimiento_cotizacion_guardada")
def cotizacion_guardada(sender, instance, created, **kwargs):
    # La aceptación no se escucha aquí: la señal de cotizaciones reinicia
    # _estado_anterior antes de que llegue este receptor. La avisa
    # cotizaciones.services.aceptar_cotizacion (único camino de aceptación).
    if created:
        transaction.on_commit(lambda: services.al_crear_cotizacion(instance))


@receiver(post_save, sender=CotizacionEnvio, dispatch_uid="seguimiento_cotizacion_enviada")
def cotizacion_enviada(sender, instance, created, **kwargs):
    if created:
        transaction.on_commit(lambda: services.al_enviar_cotizacion(instance))
