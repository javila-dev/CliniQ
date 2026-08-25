from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agenda', '0012_h36_firma_asistencia_archivo'),
    ]

    operations = [
        migrations.AddField(
            model_name='cita',
            name='firma_asistencia_signing_token',
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
