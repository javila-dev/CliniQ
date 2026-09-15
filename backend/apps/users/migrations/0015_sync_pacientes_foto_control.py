"""
Registra los permisos `pacientes.foto_control.cambiar` y
`pacientes.foto_control.eliminar` y los asigna a los roles de sistema de cada
clinica. `cambiar` va a admin/recepcion/profesional (mismo alcance que tenia
`pacientes.editar` para esta accion antes de separarla). `eliminar` solo va a
admin, igual que otros permisos destructivos (pacientes.eliminar,
historia.fotos.eliminar). Mismo patron que 0013.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG

TARGET_KEYS = {
    "pacientes.foto_control.cambiar": {"admin", "recepcion", "profesional"},
    "pacientes.foto_control.eliminar": {"admin"},
}


def sync(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    for clave, modulo, accion, descripcion, assignable in PERMISSION_CATALOG:
        if clave not in TARGET_KEYS:
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
        roles_objetivo = TARGET_KEYS[clave]
        for rol in Rol.objects.filter(activo=True, es_sistema=True, slug__in=roles_objetivo):
            RolPermiso.objects.get_or_create(
                rol=rol,
                permiso=permiso,
                defaults={"activo": True},
            )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0014_consumo_insumos_con_escribir_historia"),
    ]

    operations = [
        migrations.RunPython(sync, migrations.RunPython.noop),
    ]
