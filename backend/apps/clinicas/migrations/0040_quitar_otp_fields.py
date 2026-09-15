from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0039_copiar_otp_a_whatsapp'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='clinica',
            name='otp_checkin_override',
        ),
        migrations.RemoveField(
            model_name='plan',
            name='otp_checkin_habilitado',
        ),
    ]
