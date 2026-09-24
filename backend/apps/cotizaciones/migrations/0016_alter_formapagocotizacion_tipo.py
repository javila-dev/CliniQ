import django.db.models.deletion
from django.db import migrations, models

# Tipos que ya existían como CharField y que el catálogo de FormaDePago
# siempre siembra por clínica (ver apps.clinicas.formas_pago).
TIPOS_CONOCIDOS = {
    "efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito",
    "credito", "cuotas", "financiamiento", "otro",
}


def poblar_forma_pago(apps, schema_editor):
    FormaPagoCotizacion = apps.get_model("cotizaciones", "FormaPagoCotizacion")
    FormaDePago = apps.get_model("clinicas", "FormaDePago")

    cache = {}
    for forma in FormaPagoCotizacion.objects.select_related("cotizacion").all():
        clinica_id = forma.cotizacion.clinica_id
        tipo_base = forma.tipo if forma.tipo in TIPOS_CONOCIDOS else "otro"
        key = (clinica_id, tipo_base)
        if key not in cache:
            cache[key] = FormaDePago.objects.filter(
                clinica_id=clinica_id, tipo_base=tipo_base,
            ).first() or FormaDePago.objects.filter(
                clinica_id=clinica_id, tipo_base="otro",
            ).first()
        forma.tipo_nuevo_id = cache[key].id if cache[key] else None
        forma.save(update_fields=["tipo_nuevo"])


def revertir(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0044_backfill_formas_pago'),
        ('cotizaciones', '0015_obsequio_entrega'),
    ]

    operations = [
        migrations.AddField(
            model_name='formapagocotizacion',
            name='tipo_nuevo',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='formas_pago_cotizacion_tmp',
                to='clinicas.formadepago',
            ),
        ),
        migrations.RunPython(poblar_forma_pago, revertir),
        migrations.RemoveField(
            model_name='formapagocotizacion',
            name='tipo',
        ),
        migrations.RenameField(
            model_name='formapagocotizacion',
            old_name='tipo_nuevo',
            new_name='tipo',
        ),
        migrations.AlterField(
            model_name='formapagocotizacion',
            name='tipo',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='formas_pago_cotizacion',
                to='clinicas.formadepago',
            ),
        ),
    ]
