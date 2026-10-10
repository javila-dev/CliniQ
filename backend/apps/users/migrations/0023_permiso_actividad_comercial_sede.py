"""
Permiso "Ver la actividad comercial de toda la sede" (comercial.ver_sede).

Quien atiende pacientes sin este permiso solo ve sus propias cotizaciones,
ventas y seguimientos (ver users.authorization.ve_solo_su_actividad_comercial).

Para que nadie cambie lo que ve el dia del deploy, se da a todos los roles
existentes menos al rol de sistema "profesional", que ya veia solo lo suyo.
Los roles creados despues no lo traen: el admin lo activa desde Roles.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG

CLAVE = "comercial.ver_sede"


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

    roles = Rol.objects.exclude(es_sistema=True, slug="profesional")
    ya_tienen = set(RolPermiso.objects.filter(permiso=permiso).values_list("rol_id", flat=True))
    RolPermiso.objects.bulk_create(
        [RolPermiso(rol=rol, permiso=permiso, activo=True) for rol in roles if rol.id not in ya_tienen],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0022_sync_seguimiento_permissions"),
    ]

    operations = [
        migrations.RunPython(sincronizar, migrations.RunPython.noop),
    ]
