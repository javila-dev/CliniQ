import django.db.models.functions.text
from django.db import migrations, models


def _clave(nombre):
    return nombre.strip().lower()


def renombrar_duplicados(apps, schema_editor):
    """
    Antes de exigir nombre único por clínica, los duplicados existentes (ignorando
    mayúsculas y espacios en los extremos) se renombran con un sufijo « (2)», « (3)»…
    El más antiguo conserva su nombre original.
    """
    Servicio = apps.get_model("clinicas", "Servicio")
    servicios = list(Servicio.objects.order_by("created_at", "id"))
    usados = {(s.clinica_id, _clave(s.nombre)) for s in servicios}
    vistos = set()
    for servicio in servicios:
        clave = (servicio.clinica_id, _clave(servicio.nombre))
        if clave not in vistos:
            vistos.add(clave)
            continue
        base = servicio.nombre.strip()
        n = 2
        while (servicio.clinica_id, _clave(f"{base} ({n})")) in usados:
            n += 1
        nuevo = f"{base} ({n})"
        usados.add((servicio.clinica_id, _clave(nuevo)))
        servicio.nombre = nuevo
        servicio.save(update_fields=["nombre"])


class Migration(migrations.Migration):

    dependencies = [
        ('clinicas', '0040_quitar_otp_fields'),
        ('configuracion', '0010_configuracionwizard_foto_control_obligatoria'),
    ]

    operations = [
        migrations.RunPython(renombrar_duplicados, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='servicio',
            constraint=models.UniqueConstraint(django.db.models.functions.text.Lower(django.db.models.functions.text.Trim('nombre')), models.F('clinica'), name='servicio_nombre_unico_por_clinica', violation_error_message='Ya existe un procedimiento con ese nombre.'),
        ),
    ]
