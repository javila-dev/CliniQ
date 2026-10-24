"""Bloqueo por estado de la suscripción, aplicado a toda petición autenticada.

Se engancha en la autenticación (``ClinicScopedJWTAuthentication``) y no como
permiso por defecto de DRF: más de cien vistas declaran sus propios
``permission_classes`` y con eso se saltaban el antiguo ``TrialNotExpired``.

- Acceso total (prueba, activa, en gracia): pasa todo.
- Solo lectura (solo lectura, cancelada): pasan las consultas (GET) y lo que
  esté marcado con ``permitido_en_solo_lectura``.
- Suspendida: solo lo marcado con ``suscripcion_libre`` (sesión, perfil,
  ayuda y la propia suscripción).

Las vistas o acciones se marcan con el atributo, o con los decoradores de
abajo sobre el método (``@action`` primero, el decorador debajo).
"""

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import SAFE_METHODS

from .services import ACCESO_LECTURA, ACCESO_TOTAL, nivel_acceso, suscripcion_vigente


class SuscripcionBloqueada(APIException):
    status_code = status.HTTP_403_FORBIDDEN


MENSAJE_SOLO_LECTURA = (
    "Tu cuenta está en solo lectura: puedes consultar tu información, pero no crear ni modificar nada. "
    "Elige un plan para seguir trabajando."
)
MENSAJE_SUSPENDIDA = (
    "La cuenta de tu clínica está suspendida. Tu información está a salvo: elige un plan para reactivarla."
)


def suscripcion_libre(func):
    func.suscripcion_libre = True
    return func


def permitido_en_solo_lectura(func):
    func.permitido_en_solo_lectura = True
    return func


def _marcada(request, view, atributo: str) -> bool:
    if view is None:
        return False
    if getattr(view, atributo, False):
        return True
    metodo = getattr(view, "action", None) or request.method.lower()
    return bool(getattr(getattr(view, metodo, None), atributo, False))


def verificar_acceso(request, user, token) -> None:
    """Lanza 403 si el estado de la suscripción no permite esta petición."""
    # El superadmin suplantando a alguien es soporte: puede corregir aunque la
    # cuenta esté bloqueada.
    if token.get("suplantado_por"):
        return
    view = (getattr(request, "parser_context", None) or {}).get("view")
    if _marcada(request, view, "suscripcion_libre"):
        return
    s = suscripcion_vigente(user.clinica_id)
    if s is None:
        return
    nivel = nivel_acceso(s.estado)
    if nivel == ACCESO_TOTAL:
        return
    if nivel == ACCESO_LECTURA:
        if request.method in SAFE_METHODS or _marcada(request, view, "permitido_en_solo_lectura"):
            return
        raise SuscripcionBloqueada(
            {"error": MENSAJE_SOLO_LECTURA, "code": "SUSCRIPCION_SOLO_LECTURA", "estado": s.estado}
        )
    raise SuscripcionBloqueada({"error": MENSAJE_SUSPENDIDA, "code": "SUSCRIPCION_SUSPENDIDA", "estado": s.estado})
