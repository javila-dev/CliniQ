"""
Actualiza la descripción visible de los permisos del catálogo: el término de
cara al usuario es "catálogo" (procedimientos y tratamientos), no "servicios".
Las claves `servicios.ver` / `servicios.gestionar` no cambian.
"""
from django.db import migrations

DESCRIPCIONES = {
    "servicios.ver": ("Ver catálogo", "Ver servicios"),
    "servicios.gestionar": ("Crear y editar el catálogo", "Gestionar servicios"),
}


def actualizar(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    for clave, (nueva, _anterior) in DESCRIPCIONES.items():
        Permiso.objects.filter(clave=clave).update(descripcion=nueva)


def revertir(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    for clave, (_nueva, anterior) in DESCRIPCIONES.items():
        Permiso.objects.filter(clave=clave).update(descripcion=anterior)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0015_sync_pacientes_foto_control"),
    ]

    operations = [
        migrations.RunPython(actualizar, revertir),
    ]
