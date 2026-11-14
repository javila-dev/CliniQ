"""
Permiso "Terminar ventas" (cotizaciones.terminar).

Da por terminada una venta que el paciente deja a medias (docs/plan-terminacion-ventas.md).
Lo tiene el rol de sistema `admin`; a otro rol se lo da el admin desde Roles.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG

CLAVE = "cotizaciones.terminar"


def sincronizar(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    for clave, modulo, accion, descripcion, assignable in PERMISSION_CATALOG:
        Permiso.objects.update_or_create(
            clave=clave,
            defaults={
                "modulo": modulo,
                "accion": accion,
                "descripcion": descripcion,
                "assignable": assignable,
                "activo": True,
            },
        )
    permiso = Permiso.objects.get(clave=CLAVE)

    roles = Rol.objects.filter(activo=True, es_sistema=True, slug="admin")
    ya_tienen = set(RolPermiso.objects.filter(permiso=permiso).values_list("rol_id", flat=True))
    RolPermiso.objects.bulk_create(
        [RolPermiso(rol=rol, permiso=permiso, activo=True) for rol in roles if rol.id not in ya_tienen],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0029_permiso_regularizar_paquetes"),
    ]

    operations = [
        migrations.RunPython(sincronizar, migrations.RunPython.noop),
    ]
