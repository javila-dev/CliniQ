from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.clinicas.models import Sede
from apps.colaboradores.services import ensure_admin_colaborador
from apps.users.models import User


@receiver(post_save, sender=User)
def ensure_colaborador_for_tenant_admin(sender, instance, created, **kwargs):
    if created:
        ensure_admin_colaborador(instance)


@receiver(post_save, sender=Sede)
def attach_pending_admin_colaborador_to_first_sede(sender, instance, created, **kwargs):
    if not created:
        return

    admin_users = User.objects.filter(clinica=instance.clinica, rol_dinamico__slug="admin")
    for user in admin_users:
        ensure_admin_colaborador(user)
