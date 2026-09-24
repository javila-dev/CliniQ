import django.db.models.deletion
from django.db import migrations, models

TIPOS_CONOCIDOS = {
    "efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito",
    "credito", "cuotas", "financiamiento", "otro",
}


def _forma(cache, FormaDePago, clinica_id, tipo_base):
    tipo_base = tipo_base if tipo_base in TIPOS_CONOCIDOS else "otro"
    key = (clinica_id, tipo_base)
    if key not in cache:
        cache[key] = FormaDePago.objects.filter(clinica_id=clinica_id, tipo_base=tipo_base).first() \
            or FormaDePago.objects.filter(clinica_id=clinica_id, tipo_base="otro").first()
    return cache[key]


def poblar_forma_pago(apps, schema_editor):
    CuotaCartera = apps.get_model("cartera", "CuotaCartera")
    FormaDePago = apps.get_model("clinicas", "FormaDePago")

    cache = {}
    for cuota in CuotaCartera.objects.select_related("cartera__paciente").all():
        clinica_id = cuota.cartera.paciente.clinica_id
        forma_tipo = _forma(cache, FormaDePago, clinica_id, cuota.tipo)
        cuota.tipo_nuevo_id = forma_tipo.id if forma_tipo else None

        medio_texto = (cuota.medio_pago or "").strip()
        if medio_texto:
            forma_medio = _forma(cache, FormaDePago, clinica_id, medio_texto)
            cuota.medio_pago_nuevo_id = forma_medio.id if forma_medio else None
        else:
            cuota.medio_pago_nuevo_id = None

        cuota.save(update_fields=["tipo_nuevo", "medio_pago_nuevo"])


def revertir(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('cartera', '0005_cuotacartera_anulada_acuerdopago_and_more'),
        ('clinicas', '0044_backfill_formas_pago'),
    ]

    operations = [
        migrations.AddField(
            model_name='cuotacartera',
            name='tipo_nuevo',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cuotas_por_tipo_tmp',
                to='clinicas.formadepago',
            ),
        ),
        migrations.AddField(
            model_name='cuotacartera',
            name='medio_pago_nuevo',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cuotas_por_medio_pago_tmp',
                to='clinicas.formadepago',
            ),
        ),
        migrations.RunPython(poblar_forma_pago, revertir),
        migrations.RemoveField(
            model_name='cuotacartera',
            name='tipo',
        ),
        migrations.RemoveField(
            model_name='cuotacartera',
            name='medio_pago',
        ),
        migrations.RenameField(
            model_name='cuotacartera',
            old_name='tipo_nuevo',
            new_name='tipo',
        ),
        migrations.RenameField(
            model_name='cuotacartera',
            old_name='medio_pago_nuevo',
            new_name='medio_pago',
        ),
        migrations.AlterField(
            model_name='cuotacartera',
            name='tipo',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cuotas_por_tipo',
                to='clinicas.formadepago',
            ),
        ),
        migrations.AlterField(
            model_name='cuotacartera',
            name='medio_pago',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cuotas_por_medio_pago',
                to='clinicas.formadepago',
            ),
        ),
    ]
