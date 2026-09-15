from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0037_plan_precio_sede_adicional_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='whatsapp_habilitado',
            field=models.BooleanField(default=True, help_text='Addon: envío de mensajes de WhatsApp (documentos, firma, OTP de check-in, recordatorios) incluido en este plan.'),
        ),
        migrations.AddField(
            model_name='plan',
            name='whatsapp_envios_incluidos',
            field=models.PositiveIntegerField(default=0, help_text='Envíos de WhatsApp incluidos por mes en este plan. 0 significa sin límite.'),
        ),
        migrations.AddField(
            model_name='clinica',
            name='whatsapp_override',
            field=models.BooleanField(blank=True, default=None, help_text='Anula el addon de WhatsApp del plan para esta clínica. Null = hereda del plan.', null=True),
        ),
        migrations.AddField(
            model_name='clinica',
            name='whatsapp_envios_incluidos_override',
            field=models.PositiveIntegerField(blank=True, default=None, help_text='Anula el cupo mensual de envíos de WhatsApp para esta clínica. Null = hereda del plan. 0 = sin límite.', null=True),
        ),
    ]
