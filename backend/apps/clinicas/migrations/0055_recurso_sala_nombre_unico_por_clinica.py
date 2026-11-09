from django.db import migrations, models
from django.db.models import F, Q
from django.db.models.functions import Lower, Trim


def renombrar_repetidas(apps, schema_editor):
    """Cabinas con el mismo nombre en dos sedes de la clínica: a la segunda se
    le agrega el nombre de su sede ("Cabina 1 Norte") antes de exigir que el
    nombre sea único en la clínica."""
    Recurso = apps.get_model("clinicas", "Recurso")
    vistos = set()
    for r in Recurso.objects.filter(tipo="sala").select_related("sede").order_by("created_at"):
        clave = (r.clinica_id, r.nombre.strip().lower())
        if clave in vistos:
            nuevo = f"{r.nombre.strip()} {r.sede.nombre}"[:120]
            n = 2
            while Recurso.objects.filter(clinica_id=r.clinica_id, tipo="sala", nombre__iexact=nuevo).exists():
                nuevo = f"{r.nombre.strip()} {r.sede.nombre} {n}"[:120]
                n += 1
            r.nombre = nuevo
            r.save(update_fields=["nombre"])
            clave = (r.clinica_id, nuevo.lower())
        vistos.add(clave)


class Migration(migrations.Migration):

    dependencies = [
        ("clinicas", "0054_salas_y_equipos"),
    ]

    operations = [
        migrations.RunPython(renombrar_repetidas, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name="recurso", name="recurso_nombre_unico_por_sede"),
        migrations.AddConstraint(
            model_name="recurso",
            constraint=models.UniqueConstraint(
                Lower(Trim("nombre")),
                F("sede"),
                name="recurso_nombre_unico_por_sede",
                violation_error_message="Ya existe una cabina, consultorio o equipo con ese nombre en esta sede.",
            ),
        ),
        migrations.AddConstraint(
            model_name="recurso",
            constraint=models.UniqueConstraint(
                Lower(Trim("nombre")),
                F("clinica"),
                condition=Q(tipo="sala"),
                name="recurso_sala_nombre_unico_por_clinica",
                violation_error_message="Ya hay una cabina o consultorio con ese nombre en la clínica.",
            ),
        ),
    ]
