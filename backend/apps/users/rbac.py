from django.db import OperationalError, ProgrammingError, transaction

from apps.users.permissions_catalog import PERMISSION_CATALOG, ROLE_PERMISSION_DEFAULTS


ROLE_LABELS = {
    "admin": ("Administrador", "Rol administrador de la clinica."),
    "recepcion": ("Recepcion", "Rol operativo de recepcion."),
    "profesional": ("Profesional", "Rol de profesional asistencial."),
}

ROLE_PROFESSIONAL_FLAGS = {
    "admin": False,
    "recepcion": False,
    "profesional": True,
}


def ensure_default_roles_for_clinica(clinica):
    from apps.users.models import Permiso, Rol, RolPermiso

    try:
        with transaction.atomic():
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

            for slug, (nombre, descripcion) in ROLE_LABELS.items():
                rol, _ = Rol.objects.update_or_create(
                    clinica=clinica,
                    slug=slug,
                    defaults={
                        "nombre": nombre,
                    "descripcion": descripcion,
                    "es_sistema": True,
                    "editable": slug != "admin",
                    "es_profesional": ROLE_PROFESSIONAL_FLAGS.get(slug, False),
                    "activo": True,
                },
            )
                existing = set(rol.permisos.values_list("clave", flat=True))
                RolPermiso.objects.bulk_create(
                    [
                        RolPermiso(rol=rol, permiso=permisos_por_clave[key])
                        for key in ROLE_PERMISSION_DEFAULTS.get(slug, set())
                        if key in permisos_por_clave and key not in existing
                    ],
                    ignore_conflicts=True,
                )
    except (OperationalError, ProgrammingError):
        return
