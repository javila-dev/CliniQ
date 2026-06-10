from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG


def sync_cotizaciones_permissions(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    target_keys = {"cotizaciones.gestionar", "cotizaciones.ver"}
    permisos = {}
    for clave, modulo, accion, descripcion, assignable in PERMISSION_CATALOG:
        if clave not in target_keys:
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
        permisos[clave] = permiso

    for rol in Rol.objects.filter(activo=True, slug__in=["admin", "profesional", "recepcion"]):
        claves = {"cotizaciones.ver"}
        if rol.slug in {"admin", "profesional"}:
            claves.add("cotizaciones.gestionar")
        for clave in claves:
            permiso = permisos.get(clave)
            if permiso:
                RolPermiso.objects.get_or_create(
                    rol=rol,
                    permiso=permiso,
                    defaults={"activo": True},
                )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_h46_dynamic_roles_colaboradores"),
    ]

    operations = [
        migrations.RunPython(sync_cotizaciones_permissions, migrations.RunPython.noop),
    ]
