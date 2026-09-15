"""
"Registrar insumos consumidos en la atencion" pasa de ser una capacidad
opcional aparte a formar parte de "Realizar atenciones y escribir en la
historia" (ver permissions_catalog.py): no tiene sentido que alguien pueda
atender y escribir notas pero no pueda descontar del inventario lo que uso.

De paso, `inventario.consumo.registrar` e `inventario.consumo.eliminar` se
agregaron al catalogo (permissions_catalog.py) despues de que 0012 corriera
por ultima vez y nunca se sincronizaron como filas `Permiso`: la capacidad
"Registrar insumos consumidos" del editor de roles nunca pudo asignarse de
verdad. Esta migracion sincroniza el catalogo completo (igual que 0012) y
despues reconcilia los roles que ya existen: cualquier rol (de sistema o
personalizado por una clinica) que tenga `historia.notas.crear` pero le
falte `inventario.consumo.registrar` o `inventario.ver` recibe esos
permisos. Solo agrega, nunca quita.
"""
from django.db import migrations

from apps.users.permissions_catalog import PERMISSION_CATALOG


def backfill_consumo_insumos(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    # 1. Sincronizar el catalogo completo (mismo patron que 0012) para que
    #    ninguna clave del catalogo quede sin su fila Permiso.
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

    permiso_notas = permisos_por_clave.get("historia.notas.crear")
    permiso_consumo = permisos_por_clave.get("inventario.consumo.registrar")
    permiso_ver_inventario = permisos_por_clave.get("inventario.ver")
    if not (permiso_notas and permiso_consumo and permiso_ver_inventario):
        return

    roles_con_escribir_historia = Rol.objects.filter(
        rol_permisos__permiso=permiso_notas, activo=True
    ).distinct()

    faltantes = []
    for rol in roles_con_escribir_historia:
        existentes = set(
            RolPermiso.objects.filter(rol=rol).values_list("permiso_id", flat=True)
        )
        if permiso_consumo.id not in existentes:
            faltantes.append(RolPermiso(rol=rol, permiso=permiso_consumo, activo=True))
        if permiso_ver_inventario.id not in existentes:
            faltantes.append(RolPermiso(rol=rol, permiso=permiso_ver_inventario, activo=True))

    if faltantes:
        RolPermiso.objects.bulk_create(faltantes, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0013_sync_pacientes_datos_sensibles"),
    ]

    operations = [
        migrations.RunPython(backfill_consumo_insumos, migrations.RunPython.noop),
    ]
