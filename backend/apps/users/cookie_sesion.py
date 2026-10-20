"""Token de renovación en una cookie HttpOnly.

Antes el par de tokens viajaba en el cuerpo de la respuesta y el frontend lo
guardaba en localStorage, donde cualquier script de la página podía leerlo. Ahora
el token de renovación va en una cookie que JavaScript no ve, y el de acceso solo
en memoria del navegador (se pide de nuevo con la cookie al recargar).
"""

from django.conf import settings
from rest_framework.response import Response


def _opciones():
    return {
        "path": settings.AUTH_REFRESH_COOKIE_PATH,
        "samesite": settings.AUTH_REFRESH_COOKIE_SAMESITE,
    }


def poner_cookie(response, refresh: str):
    vida = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    response.set_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(vida.total_seconds()),
        httponly=True,
        secure=settings.AUTH_REFRESH_COOKIE_SECURE,
        **_opciones(),
    )
    return response


def borrar_cookie(response):
    response.delete_cookie(settings.AUTH_REFRESH_COOKIE_NAME, **_opciones())
    return response


def respuesta_con_sesion(data: dict, status_code: int) -> Response:
    """Saca el token de renovación del cuerpo y lo pone en la cookie."""
    data = dict(data)
    refresh = data.pop("refresh", None)
    response = Response(data, status=status_code)
    if refresh:
        poner_cookie(response, refresh)
    return response


def refresh_de_la_peticion(request) -> str:
    """El token de renovación: de la cookie o, una sola vez, del cuerpo.

    El cuerpo solo lo manda el frontend al migrar una sesión abierta antes de
    este cambio (el token que tenía en localStorage), para no obligar a todos a
    iniciar sesión de nuevo.
    """
    cookie = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME, "")
    if cookie:
        return cookie
    cuerpo = getattr(request, "data", None) or {}
    return str(cuerpo.get("refresh") or "") if hasattr(cuerpo, "get") else ""
