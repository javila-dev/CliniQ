"""
Subir fotos clínicas pasa a depender del check "atiende pacientes"
(User.es_profesional), como los permisos de 0017: deja de ser asignable y se
quita de los roles (salvo admin). `historia.consentimientos.gestionar` también
lo da el check, pero sigue asignable por rol (recepción firma consentimientos),
así que no se toca.
"""
from django.db import migrations

CLAVE = "historia.fotos.subir"


def ligar_al_check(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    RolPermiso = apps.get_model("users", "RolPermiso")
    Permiso.objects.filter(clave=CLAVE).update(assignable=False)
    RolPermiso.objects.filter(permiso__clave=CLAVE).exclude(rol__slug="admin").delete()


def revertir(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")
    Permiso.objects.filter(clave=CLAVE).update(assignable=True)
    permiso = Permiso.objects.filter(clave=CLAVE).first()
    if permiso is None:
        return
    RolPermiso.objects.bulk_create(
        [RolPermiso(rol=rol, permiso=permiso) for rol in Rol.objects.filter(es_profesional=True).exclude(slug="admin")],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0017_permisos_atencion_ligados_al_check"),
    ]

    operations = [
        migrations.RunPython(ligar_al_check, revertir),
    ]
