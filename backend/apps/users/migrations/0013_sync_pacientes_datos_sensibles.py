"""
Registra el permiso `pacientes.datos_sensibles.ver` y lo asigna al rol de
sistema `admin` de cada clinica. Recepcion y profesional NO lo reciben: sin
este permiso, la API enmascara documento / telefono / email / direccion /
fecha de nacimiento del paciente. Mismo patron que 0008/0009/0012.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG

TARGET_KEY = "pacientes.datos_sensibles.ver"


def sync(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    permiso = None
    for clave, modulo, accion, descripcion, assignable in PERMISSION_CATALOG:
        if clave != TARGET_KEY:
            continue
        permiso, _ = Permiso.objects.update_or_create(
            clave=clave,
            defaults={
                "modulo": modulo,
                "accion": accion,
                "descripcion": descripcion,
                "assignable": assignable,
                "activo": True,
            },
        )
        break

    if permiso is None:
        return

    for rol in Rol.objects.filter(activo=True, es_sistema=True, slug="admin"):
        RolPermiso.objects.get_or_create(
            rol=rol,
            permiso=permiso,
            defaults={"activo": True},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0012_sync_system_role_permissions"),
    ]

    operations = [
        migrations.RunPython(sync, migrations.RunPython.noop),
    ]
