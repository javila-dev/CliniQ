"""
Permiso "Cargar resultados de examenes" (historia.examenes.cargar).

Antes subir un resultado exigia `historia.notas.crear` (solo el check "atiende
pacientes"). Ahora tiene permiso propio para cargarlos desde la historia clinica
despues de la atencion:

- Quien tiene el check "atiende pacientes" lo recibe siempre
  (PERMISOS_ATIENDE_PACIENTES), igual que hoy.
- Roles de sistema `admin` y `profesional`: lo reciben.
- Recepcion y roles personalizados: no; el admin lo activa desde Roles.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG

CLAVE = "historia.examenes.cargar"


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

    roles = Rol.objects.filter(activo=True, es_sistema=True, slug__in=["admin", "profesional"])
    ya_tienen = set(RolPermiso.objects.filter(permiso=permiso).values_list("rol_id", flat=True))
    RolPermiso.objects.bulk_create(
        [RolPermiso(rol=rol, permiso=permiso, activo=True) for rol in roles if rol.id not in ya_tienen],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0026_sesion_suplantacion"),
    ]

    operations = [
        migrations.RunPython(sincronizar, migrations.RunPython.noop),
    ]
