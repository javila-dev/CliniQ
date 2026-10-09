"""
Permisos del seguimiento (embudo comercial, docs/plan-funnel-comercial.md).

- Crea/actualiza todo el catalogo de permisos.
- Roles de sistema `admin` y `recepcion`: reciben las dos claves nuevas (la
  recepcion es quien trabaja la bandeja "Para hoy").
- Roles personalizados: no se tocan; el admin las asigna desde Roles.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG

CLAVES = {"seguimiento.oportunidades.ver", "seguimiento.oportunidades.gestionar"}


def sincronizar(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

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

    for rol in Rol.objects.filter(activo=True, es_sistema=True, slug__in=["admin", "recepcion"]):
        existentes = set(RolPermiso.objects.filter(rol=rol).values_list("permiso__clave", flat=True))
        faltantes = [
            RolPermiso(rol=rol, permiso=permisos_por_clave[clave], activo=True)
            for clave in CLAVES
            if clave not in existentes
        ]
        if faltantes:
            RolPermiso.objects.bulk_create(faltantes, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0021_recepcion_permisos_acotados"),
    ]

    operations = [
        migrations.RunPython(sincronizar, migrations.RunPython.noop),
    ]
