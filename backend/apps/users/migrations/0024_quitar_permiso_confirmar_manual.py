"""
Se elimina el permiso "Confirmar citas manualmente" (agenda.citas.confirmar_manual).

Registrar la llamada de confirmacion ("Confirmar cita" / "No confirmo") es parte de
gestionar la agenda: ahora lo puede hacer quien puede crear o editar citas. Como
permiso aparte solo lo tenia el admin, y Recepcion recibia siempre "No se pudo
guardar".
"""
from django.db import migrations

CLAVE = "agenda.citas.confirmar_manual"


def quitar(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    RolPermiso = apps.get_model("users", "RolPermiso")
    RolPermiso.objects.filter(permiso__clave=CLAVE).delete()
    Permiso.objects.filter(clave=CLAVE).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0023_permiso_actividad_comercial_sede"),
    ]

    operations = [
        migrations.RunPython(quitar, migrations.RunPython.noop),
    ]
