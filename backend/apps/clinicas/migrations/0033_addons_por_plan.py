from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0032_alter_clinica_bloquear_agenda_por_deuda'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='facial_verificacion_habilitada',
            field=models.BooleanField(default=False, help_text='Addon: verificación facial biométrica incluida en este plan.'),
        ),
        migrations.AddField(
            model_name='plan',
            name='modulo_estetico_habilitado',
            field=models.BooleanField(default=True, help_text='Addon: módulo estético (procedimientos, zonas corporales) incluido en este plan.'),
        ),
        migrations.AddField(
            model_name='plan',
            name='modulo_obesidad_habilitado',
            field=models.BooleanField(default=False, help_text='Addon: módulo de obesidad (tratamientos, sesiones, control de peso) incluido en este plan.'),
        ),
        migrations.AddField(
            model_name='plan',
            name='otp_checkin_habilitado',
            field=models.BooleanField(default=True, help_text='Addon: check-in de llegada por código OTP de WhatsApp incluido en este plan.'),
        ),
        migrations.AddField(
            model_name='clinica',
            name='facial_verificacion_override',
            field=models.BooleanField(blank=True, default=None, help_text='Anula el addon de verificación facial del plan para esta clínica. Null = hereda del plan.', null=True),
        ),
        migrations.AddField(
            model_name='clinica',
            name='modulo_estetico_override',
            field=models.BooleanField(blank=True, default=None, help_text='Anula el addon de módulo estético del plan para esta clínica. Null = hereda del plan.', null=True),
        ),
        migrations.AddField(
            model_name='clinica',
            name='modulo_obesidad_override',
            field=models.BooleanField(blank=True, default=None, help_text='Anula el addon de módulo obesidad del plan para esta clínica. Null = hereda del plan.', null=True),
        ),
        migrations.AddField(
            model_name='clinica',
            name='otp_checkin_override',
            field=models.BooleanField(blank=True, default=None, help_text='Anula el addon de check-in por OTP del plan para esta clínica. Null = hereda del plan.', null=True),
        ),
    ]
