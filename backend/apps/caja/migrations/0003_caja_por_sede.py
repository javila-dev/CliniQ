from django.db import migrations


def crear_cajas(apps, schema_editor):
    Sede = apps.get_model("clinicas", "Sede")
    Caja = apps.get_model("caja", "Caja")
    for sede in Sede.objects.all():
        Caja.objects.get_or_create(
            sede=sede,
            defaults={"saldo_inicial": 0, "activa": True},
        )


def borrar_cajas(apps, schema_editor):
    Caja = apps.get_model("caja", "Caja")
    Caja.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("caja", "0002_remove_gastocaja_aprobado_en_and_more"),
        ("clinicas", "0002_servicio_sede"),
    ]

    operations = [
        migrations.RunPython(crear_cajas, borrar_cajas),
    ]
