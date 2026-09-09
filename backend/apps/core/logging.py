from apps.core.models import LogAccion


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _paciente_nombre(objeto) -> str | None:
    """Best-effort: extract patient full name from the logged object."""
    paciente = getattr(objeto, "paciente", None)
    if paciente is None:
        nombre_completo = getattr(objeto, "nombre_completo", None)
        return str(nombre_completo) if nombre_completo else None
    return getattr(paciente, "nombre_completo", None) or str(paciente)


def registrar_accion(
    request,
    accion: str,
    objeto,
    detalle: dict = None,
    *,
    clinica=None,
    actor=None,
    objeto_tipo: str = None,
    objeto_id: str = None,
):
    """Registra una entrada en LogAccion.

    - `clinica` fija el tenant destino explicitamente. Necesario para acciones del
      superadmin (su `user.clinica` es None) que deben quedar atribuidas a la
      clinica sobre la que opera, no a "Sistema".
    - `actor` fuerza el usuario responsable cuando `request.user` no sirve (login,
      donde el request todavia es anonimo).
    - `objeto_tipo` / `objeto_id` permiten registrar contra un objeto que ya no
      tiene pk (p. ej. despues de un delete) o sin instancia.
    """
    user = actor if actor is not None else getattr(request, "user", None)
    if user is not None and not getattr(user, "is_authenticated", False):
        user = None

    enriched = dict(detalle or {})
    if "paciente_nombre" not in enriched:
        nombre = _paciente_nombre(objeto)
        if nombre:
            enriched["paciente_nombre"] = nombre

    clinica_destino = clinica or getattr(user, "clinica", None)

    LogAccion.objects.create(
        clinica=clinica_destino,
        usuario=user,
        accion=accion,
        objeto_tipo=objeto_tipo or (objeto.__class__.__name__ if objeto is not None else ""),
        objeto_id=objeto_id or (str(objeto.pk) if objeto is not None and objeto.pk is not None else ""),
        detalle=enriched,
        ip=get_client_ip(request) if request is not None else None,
    )
