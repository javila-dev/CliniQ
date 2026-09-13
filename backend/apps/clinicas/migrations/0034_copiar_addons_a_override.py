from django.db import migrations
from django.db.models import F


def copiar_valores_actuales(apps, schema_editor):
    Clinica = apps.get_model('clinicas', 'Clinica')
    Clinica.objects.update(
        facial_verificacion_override=F('facial_verificacion_habilitada'),
        modulo_estetico_override=F('modulo_estetico_habilitado'),
        modulo_obesidad_override=F('modulo_obesidad_habilitado'),
        # El OTP nunca fue un flag por clínica: siempre estuvo disponible para
        # todas. Para que ninguna clínica lo pierda al desplegar (en particular
        # las que no tienen plan asignado, donde el default del plan no aplica),
        # se fija el override explícito en True para todas las existentes.
        otp_checkin_override=True,
    )


def revertir(apps, schema_editor):
    # No-op: al revertir 0033 los campos *_override se eliminan igual, y los
    # campos viejos se recrean con su default. No hay nada que copiar de vuelta.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0033_addons_por_plan'),
    ]

    operations = [
        migrations.RunPython(copiar_valores_actuales, revertir),
    ]
