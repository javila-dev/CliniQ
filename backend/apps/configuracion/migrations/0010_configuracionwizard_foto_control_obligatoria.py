# Generated manually for foto_control_obligatoria wizard toggle

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('configuracion', '0009_remove_configuracioncartera_plantilla_compromiso_pago'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracionwizard',
            name='foto_control_obligatoria',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Si True, al registrar un paciente la foto de control facial es '
                    'obligatoria y el recepcionista no puede omitir el paso.'
                ),
            ),
        ),
    ]
