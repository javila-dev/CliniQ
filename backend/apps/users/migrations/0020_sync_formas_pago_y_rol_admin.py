"""
Las claves `configuracion.formas_pago.ver` y `configuracion.formas_pago.gestionar`
se agregaron al catalogo sin crear sus filas de Permiso, y el rol de sistema
`admin` de varias clinicas quedo sin permisos agregados despues (cajas,
formas de pago, migracion...). Sin esto, un administrador con el rol de sistema
no ve la seccion "Finanzas" de Configuracion (formas de pago y cajas).

- Crea/actualiza todo el catalogo de permisos.
- Rol de sistema `admin`: todos los permisos (mismo criterio que 0012).
- Roles de sistema `recepcion` y `profesional`: solo las claves de formas de pago
  que traen por defecto; no se re-agregan otras que una clinica haya quitado.
"""
from django.db import migrations

from apps.users.permissions_catalog import (
    ALL_PERMISSION_KEYS,
    PERMISSION_CATALOG,
    ROLE_PERMISSION_DEFAULTS,
)

CLAVES_FORMAS_PAGO = {"configuracion.formas_pago.ver", "configuracion.formas_pago.gestionar"}


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

    for rol in Rol.objects.filter(
        activo=True, es_sistema=True, slug__in=["admin", "recepcion", "profesional"]
    ):
        if rol.slug == "admin":
            claves = set(ALL_PERMISSION_KEYS)
        else:
            claves = set(ROLE_PERMISSION_DEFAULTS.get(rol.slug, set())) & CLAVES_FORMAS_PAGO

        existentes = set(RolPermiso.objects.filter(rol=rol).values_list("permiso__clave", flat=True))
        faltantes = [
            RolPermiso(rol=rol, permiso=permisos_por_clave[clave], activo=True)
            for clave in claves
            if clave in permisos_por_clave and clave not in existentes
        ]
        if faltantes:
            RolPermiso.objects.bulk_create(faltantes, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0019_capturafirmatoken"),
    ]

    operations = [
        migrations.RunPython(sincronizar, migrations.RunPython.noop),
    ]
