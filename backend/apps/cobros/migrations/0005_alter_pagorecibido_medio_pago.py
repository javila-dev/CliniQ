import django.db.models.deletion
from django.db import migrations, models

TIPOS_CONOCIDOS = {
    "efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito",
    "credito", "cuotas", "financiamiento", "otro",
}


def poblar_forma_pago(apps, schema_editor):
    PagoRecibido = apps.get_model("cobros", "PagoRecibido")
    FormaDePago = apps.get_model("clinicas", "FormaDePago")

    cache = {}
    for pago in PagoRecibido.objects.select_related("cobro__sede", "cobro__paciente").all():
        clinica_id = pago.cobro.sede.clinica_id if pago.cobro.sede_id else pago.cobro.paciente.clinica_id
        tipo_base = pago.medio_pago if pago.medio_pago in TIPOS_CONOCIDOS else "otro"
        key = (clinica_id, tipo_base)
        if key not in cache:
            cache[key] = FormaDePago.objects.filter(clinica_id=clinica_id, tipo_base=tipo_base).first() \
                or FormaDePago.objects.filter(clinica_id=clinica_id, tipo_base="otro").first()
        pago.medio_pago_nuevo_id = cache[key].id if cache[key] else None
        pago.save(update_fields=["medio_pago_nuevo"])


def revertir(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0044_backfill_formas_pago'),
        ('cobros', '0004_cobro_es_migracion_cobro_lote_migracion_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='pagorecibido',
            name='medio_pago_nuevo',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='pagos_recibidos_tmp',
                to='clinicas.formadepago',
            ),
        ),
        migrations.RunPython(poblar_forma_pago, revertir),
        migrations.RemoveField(
            model_name='pagorecibido',
            name='medio_pago',
        ),
        migrations.RenameField(
            model_name='pagorecibido',
            old_name='medio_pago_nuevo',
            new_name='medio_pago',
        ),
        migrations.AlterField(
            model_name='pagorecibido',
            name='medio_pago',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='pagos_recibidos',
                to='clinicas.formadepago',
            ),
        ),
    ]
