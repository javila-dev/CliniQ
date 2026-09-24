from apps.users.permissions_catalog import (
    ALL_PERMISSION_KEYS,
    PERMISOS_ATIENDE_PACIENTES,
    ROLE_PERMISSION_DEFAULTS,
)


def _legacy_role_permissions(role: str) -> set[str]:
    if role == "superadmin":
        return set(ALL_PERMISSION_KEYS)
    return set(ROLE_PERMISSION_DEFAULTS.get(role, set()))


def get_user_permission_keys(user, request=None) -> set[str]:
    if not user or not getattr(user, "is_authenticated", False):
        return set()

    if getattr(user, "rol", None) == "superadmin":
        return set(ALL_PERMISSION_KEYS)

    cache_key = f"user_permissions:{getattr(user, 'id', '')}"
    if request is not None:
        cache = getattr(request, "_rbac_permission_cache", None)
        if cache is None:
            cache = {}
            setattr(request, "_rbac_permission_cache", cache)
        if cache_key in cache:
            return cache[cache_key]

    rol = getattr(user, "rol_dinamico", None)
    if rol is None:
        permissions = _legacy_role_permissions(getattr(user, "rol", ""))
    elif not rol.activo:
        permissions = set()
    else:
        permissions = set(
            rol.permisos.filter(activo=True).values_list("clave", flat=True)
        )
    # El check "atiende pacientes" da los permisos de atencion clinica,
    # independiente del rol (salvo rol desactivado: sin acceso).
    if getattr(user, "es_profesional", False) and not (rol is not None and not rol.activo):
        permissions |= PERMISOS_ATIENDE_PACIENTES

    if request is not None:
        request._rbac_permission_cache[cache_key] = permissions
    return permissions


def user_has_permission(user, permission_key: str, request=None) -> bool:
    return permission_key in get_user_permission_keys(user, request=request)


def user_is_tenant_admin(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "rol", None) == "superadmin":
        return True
    rol = getattr(user, "rol_dinamico", None)
    if rol is not None:
        return rol.slug == "admin"
    return getattr(user, "rol", None) == "admin"


def user_sede_ids_acotadas(user) -> list | None:
    """Sedes a las que esta acotado el usuario, o None si ve todas las de la clinica.

    Ve todas: admin/superadmin, o usuarios sin sede principal en su perfil de
    colaborador. El resto queda acotado a su sede principal + sus sedes asignadas
    (la principal primero).
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if user_is_tenant_admin(user):
        return None
    colaborador = getattr(user, "colaborador", None)
    if colaborador is None or not colaborador.sede_principal_id:
        return None
    ids = [colaborador.sede_principal_id]
    ids += [sid for sid in colaborador.sedes.values_list("id", flat=True) if sid not in ids]
    return ids


def sede_ids_para_filtro(user, sede_id=None) -> list | None:
    """Sedes por las que filtrar un listado, respetando el alcance del usuario.

    - Con `sede_id` pedido: [sede_id] si el usuario tiene acceso, [] si no.
    - Sin `sede_id`: las sedes del usuario, o None (sin filtro) si ve todas.
    Uso: ``if ids is not None: qs = qs.filter(sede_id__in=ids)``.
    """
    acotadas = user_sede_ids_acotadas(user)
    if sede_id:
        if acotadas is not None and str(sede_id) not in {str(i) for i in acotadas}:
            return []
        return [sede_id]
    return acotadas
