"""Crea la historia de los pacientes que no la tenían (AT-12).

Los pacientes registrados antes de la señal que crea la historia no la tenían:
no se podía documentar su atención y "Datos clínicos" respondía 500. Ahora la
historia también se crea al consultarla, pero así quedan todos al día.
"""
from datetime import date

from django.db import migrations
from django.db.models import Max


def crear_historias_faltantes(apps, schema_editor):
    HistoriaClinica = apps.get_model("historia_clinica", "HistoriaClinica")
    Paciente = apps.get_model("pacientes", "Paciente")

    prefijo = f"HC-{date.today().year}-"
    ultimo = HistoriaClinica.objects.filter(numero__startswith=prefijo).aggregate(m=Max("numero"))["m"]
    secuencial = int(ultimo.split("-")[-1]) if ultimo else 0
    for paciente in Paciente.objects.filter(historia_clinica__isnull=True).order_by("created_at"):
        secuencial += 1
        HistoriaClinica.objects.create(
            paciente=paciente, clinica_id=paciente.clinica_id, numero=f"{prefijo}{secuencial:05d}",
        )


class Migration(migrations.Migration):

    dependencies = [
        ("historia_clinica", "0019_consentimientoinformado_requiere_tp_profesional"),
        ("pacientes", "0010_unaccent_extension"),
    ]

    operations = [
        migrations.RunPython(crear_historias_faltantes, migrations.RunPython.noop),
    ]
