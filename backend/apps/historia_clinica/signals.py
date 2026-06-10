from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.historia_clinica.models import HistoriaClinica
from apps.pacientes.models import Paciente


@receiver(post_save, sender=Paciente)
def crear_historia_clinica(sender, instance, created, **kwargs):
    if not created:
        return
    HistoriaClinica.objects.get_or_create(
        paciente=instance,
        defaults={"clinica": instance.clinica},
    )
