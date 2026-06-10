from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.clinicas.models import Clinica
from apps.users.rbac import ensure_default_roles_for_clinica


@receiver(post_save, sender=Clinica)
def create_default_roles_for_clinic(sender, instance, created, **kwargs):
    if created:
        ensure_default_roles_for_clinica(instance)
