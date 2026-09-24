from django.db import migrations

FORMAS_PAGO_DEFAULT = [
    ("Efectivo", "efectivo", 1),
    ("Transferencia", "transferencia", 2),
    ("Tarjeta débito", "tarjeta_debito", 3),
    ("Tarjeta crédito", "tarjeta_credito", 4),
    ("Crédito", "credito", 5),
    ("Cuotas", "cuotas", 6),
    ("Financiamiento", "financiamiento", 7),
    ("Otro", "otro", 8),
]


def backfill(apps, schema_editor):
    Clinica = apps.get_model("clinicas", "Clinica")
    FormaDePago = apps.get_model("clinicas", "FormaDePago")
    for clinica in Clinica.objects.all():
        for nombre, tipo_base, orden in FORMAS_PAGO_DEFAULT:
            FormaDePago.objects.update_or_create(
                clinica=clinica,
                nombre=nombre,
                defaults={
                    "tipo_base": tipo_base,
                    "es_sistema": True,
                    "activo": True,
                    "orden": orden,
                },
            )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0043_servicioconsentimiento_requiere_firma_cada_vez_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
