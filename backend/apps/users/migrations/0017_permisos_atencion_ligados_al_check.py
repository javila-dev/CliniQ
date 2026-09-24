"""
Los permisos de atención clínica pasan a depender del check "atiende pacientes"
(User.es_profesional) y dejan de asignarse por rol: se marcan como no
asignables y se quitan de los roles (salvo admin, que conserva todo el catálogo).
Quien tiene el check los recibe en `get_user_permission_keys`.
"""
from django.db import migrations

CLAVES = ("historia.notas.crear", "pacientes.antecedentes.editar", "inventario.consumo.registrar")


def ligar_al_check(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    RolPermiso = apps.get_model("users", "RolPermiso")
    Permiso.objects.filter(clave__in=CLAVES).update(assignable=False)
    RolPermiso.objects.filter(permiso__clave__in=CLAVES).exclude(rol__slug="admin").delete()


def revertir(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")
    Permiso.objects.filter(clave__in=CLAVES).update(assignable=True)
    permisos = list(Permiso.objects.filter(clave__in=CLAVES))
    RolPermiso.objects.bulk_create(
        [
            RolPermiso(rol=rol, permiso=permiso)
            for rol in Rol.objects.filter(es_profesional=True).exclude(slug="admin")
            for permiso in permisos
        ],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0016_sync_textos_permisos_catalogo"),
    ]

    operations = [
        migrations.RunPython(ligar_al_check, revertir),
    ]
