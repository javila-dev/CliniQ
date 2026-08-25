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


def registrar_accion(request, accion: str, objeto, detalle: dict = None):
    user = getattr(request, "user", None)
    if user is not None and not getattr(user, "is_authenticated", False):
        user = None

    enriched = dict(detalle or {})
    if "paciente_nombre" not in enriched:
        nombre = _paciente_nombre(objeto)
        if nombre:
            enriched["paciente_nombre"] = nombre

    LogAccion.objects.create(
        clinica=getattr(user, "clinica", None),
        usuario=user,
        accion=accion,
        objeto_tipo=objeto.__class__.__name__,
        objeto_id=str(objeto.pk),
        detalle=enriched,
        ip=get_client_ip(request) if request is not None else None,
    )
