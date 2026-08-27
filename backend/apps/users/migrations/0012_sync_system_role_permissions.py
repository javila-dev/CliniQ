"""
Reconcilia los roles de sistema (admin / recepcion / profesional) de cada
clinica con su set de permisos por defecto.

Clinicas creadas antes de que se agregaran ciertas claves al catalogo
(p.ej. `agenda.crear_bloqueo`, `agenda.aprobar_bloqueo`, `servicios.gestionar`)
quedaron con el rol `admin` incompleto: la seed solo corre al onboarding y
solo *agrega* lo que falta cuando se re-ejecuta. Sin esto, un admin de tenant
no ve "Bloqueos" en la agenda ni puede asociar grupos de zonas a un
procedimiento. Mismo patron que 0008/0009.
"""
from django.db import migrations

from apps.users.permissions_catalog import (
    ALL_PERMISSION_KEYS,
    PERMISSION_CATALOG,
    ROLE_PERMISSION_DEFAULTS,
)


def sync_system_role_permissions(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    # 1. Catalogo completo y activo.
    permisos_por_clave = {}
    for clave, modulo, accion, descripcion, assignable in PERMISSION_CATALOG:
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
        permisos_por_clave[clave] = permiso

    # 2. Reconciliar cada rol de sistema con su set por defecto (solo agrega,
    #    nunca quita — respeta permisos custom que se hayan añadido).
    for rol in Rol.objects.filter(
        activo=True, es_sistema=True, slug__in=["admin", "recepcion", "profesional"]
    ):
        if rol.slug == "admin":
            claves = set(ALL_PERMISSION_KEYS)
        else:
            claves = set(ROLE_PERMISSION_DEFAULTS.get(rol.slug, set()))

        existentes = set(
            RolPermiso.objects.filter(rol=rol).values_list("permiso__clave", flat=True)
        )
        faltantes = [
            RolPermiso(rol=rol, permiso=permisos_por_clave[clave], activo=True)
            for clave in claves
            if clave in permisos_por_clave and clave not in existentes
        ]
        if faltantes:
            RolPermiso.objects.bulk_create(faltantes, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0011_user_sesion_actual_dispositivo_user_sesion_actual_id_and_more"),
    ]

    operations = [
        migrations.RunPython(sync_system_role_permissions, migrations.RunPython.noop),
    ]
