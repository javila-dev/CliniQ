"""
El rol de sistema `recepcion` traia permisos de administracion y datos sensibles
que recepcion no necesita (reportes financieros, historia clinica, ficha del
personal, compras, kardex, config de email, asistente de puesta en marcha), y en
algunas clinicas se le habian agregado mas (usuarios, roles...).

Se deja el rol de sistema `recepcion` de todas las clinicas exactamente con el
default acotado: se quita todo lo extra y se agrega lo que falte. Los roles
personalizados que una clinica creo quedan como estan.

La lista va fija (no se importa del catalogo) para que la migracion no cambie si
el default cambia despues. No tiene reversa: no se puede saber que permisos
extra tenia cada clinica.
"""
from django.db import migrations

PERMISOS_RECEPCION = {
    "agenda.citas.cambiar_estado",
    "agenda.citas.crear",
    "agenda.citas.editar",
    "agenda.citas.ver",
    "caja.categorias.ver",
    "caja.gastos.registrar",
    "caja.gastos.ver",
    "cartera.registrar_pago",
    "cartera.ver",
    "clinicas.ver",
    "cobros.crear",
    "cobros.editar_items",
    "cobros.registrar_pago",
    "cobros.ver",
    "colaboradores.horarios.ver",
    "configuracion.formas_pago.ver",
    "consentimientos.generar",
    "consentimientos.plantillas.ver",
    "consentimientos.ver",
    "cotizaciones.ver",
    "historia.consentimientos.gestionar",
    "inventario.ver",
    "notificaciones.email.enviar",
    "pacientes.crear",
    "pacientes.editar",
    "pacientes.foto_control.cambiar",
    "pacientes.ver",
    "reportes.ver_operativos",
    "sedes.ver",
    "servicios.ver",
}


def acotar_recepcion(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    Rol = apps.get_model("users", "Rol")
    RolPermiso = apps.get_model("users", "RolPermiso")

    permisos = {p.clave: p for p in Permiso.objects.filter(clave__in=PERMISOS_RECEPCION)}
    for rol in Rol.objects.filter(es_sistema=True, slug="recepcion"):
        RolPermiso.objects.filter(rol=rol).exclude(permiso__clave__in=PERMISOS_RECEPCION).delete()
        existentes = set(RolPermiso.objects.filter(rol=rol).values_list("permiso__clave", flat=True))
        RolPermiso.objects.bulk_create(
            [
                RolPermiso(rol=rol, permiso=permiso, activo=True)
                for clave, permiso in permisos.items()
                if clave not in existentes
            ],
            ignore_conflicts=True,
        )
        # Sin capacidades clinicas en el set acotado, el rol deja de ser clinico.
        if rol.es_profesional:
            rol.es_profesional = False
            rol.save(update_fields=["es_profesional"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0020_sync_formas_pago_y_rol_admin"),
    ]

    operations = [
        migrations.RunPython(acotar_recepcion, migrations.RunPython.noop),
    ]
