"""
Verificación transversal, paso 4 (roles y permisos).

1. Cada capacidad de "gestionar" incluye su permiso de "ver": con "Crear y editar
   procedimientos" sin "Ver catálogo" la pantalla decía "No tienes permiso para ver
   el catálogo". A los roles que ya tienen el permiso de gestionar se les agrega el
   de ver, para que la pantalla de roles los muestre igual que antes.
2. El rol de sistema Profesional deja de ver reportes financieros (decisión del
   usuario); el Admin los sigue viendo.
3. Se eliminan permisos que no hacían nada: aprobar gastos (no hay aprobación de
   gastos) y los de correo administrativo (sus endpoints se eliminaron).
"""
from django.db import migrations

VER_POR_GESTIONAR = {
    "agenda.citas.crear": ["agenda.citas.ver"],
    "agenda.citas.editar": ["agenda.citas.ver"],
    "agenda.citas.cambiar_estado": ["agenda.citas.ver"],
    "pacientes.crear": ["pacientes.ver"],
    "pacientes.editar": ["pacientes.ver"],
    "consentimientos.plantillas.gestionar": ["consentimientos.plantillas.ver"],
    "cobros.crear": ["cobros.ver"],
    "cobros.editar_items": ["cobros.ver"],
    "cobros.registrar_pago": ["cobros.ver"],
    "cobros.anular": ["cobros.ver"],
    "cotizaciones.gestionar": ["cotizaciones.ver"],
    "cartera.registrar_pago": ["cartera.ver"],
    "cartera.modificar_plazo": ["cartera.ver"],
    "caja.gastos.registrar": ["caja.gastos.ver", "caja.categorias.ver"],
    "caja.gastos.editar": ["caja.gastos.ver", "caja.categorias.ver"],
    "caja.categorias.gestionar": ["caja.categorias.ver"],
    "caja.cierre.realizar": ["caja.cierre.ver"],
    "inventario.insumos.gestionar": ["inventario.ver", "inventario.kardex.ver"],
    "inventario.ajustar_stock": ["inventario.ver", "inventario.kardex.ver"],
    "inventario.categorias.gestionar": ["inventario.ver"],
    "proveedores.gestionar": ["proveedores.ver"],
    "proveedores.ordenes.gestionar": ["proveedores.ver", "proveedores.ordenes.ver"],
    "proveedores.ordenes.recibir": ["proveedores.ver", "proveedores.ordenes.ver"],
    "servicios.gestionar": ["servicios.ver"],
    "sedes.gestionar": ["sedes.ver"],
    "colaboradores.gestionar": ["colaboradores.ver", "colaboradores.horarios.ver"],
    "colaboradores.horarios.gestionar": ["colaboradores.horarios.ver"],
    "usuarios.crear": ["usuarios.ver"],
    "usuarios.editar": ["usuarios.ver"],
    "clinicas.editar": ["clinicas.ver"],
    "configuracion.formas_pago.gestionar": ["configuracion.formas_pago.ver"],
}

ELIMINADOS = ("caja.gastos.aprobar", "notificaciones.email.enviar", "notificaciones.email.ver_config")


def aplicar(apps, schema_editor):
    Permiso = apps.get_model("users", "Permiso")
    RolPermiso = apps.get_model("users", "RolPermiso")

    # 1. ver junto a gestionar
    permisos = {p.clave: p for p in Permiso.objects.all()}
    existentes = set(RolPermiso.objects.values_list("rol_id", "permiso__clave"))
    nuevos = []
    for rol_id, clave in list(existentes):
        for ver in VER_POR_GESTIONAR.get(clave, ()):
            if ver in permisos and (rol_id, ver) not in existentes:
                existentes.add((rol_id, ver))
                nuevos.append(RolPermiso(rol_id=rol_id, permiso=permisos[ver], activo=True))
    RolPermiso.objects.bulk_create(nuevos, ignore_conflicts=True)

    # 2. Profesional de sistema sin reportes financieros
    RolPermiso.objects.filter(
        rol__es_sistema=True, rol__slug="profesional", permiso__clave="reportes.ver_financieros",
    ).delete()

    # 3. Permisos sin efecto
    RolPermiso.objects.filter(permiso__clave__in=ELIMINADOS).delete()
    Permiso.objects.filter(clave__in=ELIMINADOS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0024_quitar_permiso_confirmar_manual"),
    ]

    operations = [
        migrations.RunPython(aplicar, migrations.RunPython.noop),
    ]
