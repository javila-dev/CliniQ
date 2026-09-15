from django.db import migrations
from django.db.models import F


def copiar_valores_actuales(apps, schema_editor):
    Clinica = apps.get_model('clinicas', 'Clinica')
    # El override de OTP era, en la practica, el unico control por clinica sobre
    # WhatsApp que existia. Se preserva como punto de partida del nuevo override
    # unificado para que ninguna clinica con una anulacion explicita la pierda al
    # desplegar. whatsapp_habilitado/whatsapp_envios_incluidos en Plan ya quedaron
    # en True/0 (sin limite) por el default del AddField en la migracion anterior,
    # asi que ninguna clinica pierde acceso a WhatsApp el dia del deploy.
    Clinica.objects.update(whatsapp_override=F('otp_checkin_override'))


def revertir(apps, schema_editor):
    # No-op: al revertir 0038 el campo whatsapp_override se elimina igual.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0038_whatsapp_addon'),
    ]

    operations = [
        migrations.RunPython(copiar_valores_actuales, revertir),
    ]
