from apps.users.permissions_catalog import ALL_PERMISSION_KEYS, ROLE_PERMISSION_DEFAULTS


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
