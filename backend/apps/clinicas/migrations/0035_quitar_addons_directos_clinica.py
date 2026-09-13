from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0034_copiar_addons_a_override'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='clinica',
            name='facial_verificacion_habilitada',
        ),
        migrations.RemoveField(
            model_name='clinica',
            name='modulo_estetico_habilitado',
        ),
        migrations.RemoveField(
            model_name='clinica',
            name='modulo_obesidad_habilitado',
        ),
    ]
