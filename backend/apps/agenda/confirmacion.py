import secrets

from django.conf import settings
from django.utils import timezone

from apps.agenda.models import Cita, ConfirmacionToken, RegistroConfirmacion


def crear_registro_confirmacion(
    *,
    cita: Cita,
    estado_resultante: str,
    usuario=None,
    usuario_nombre: str = "",
    medio: str = "",
    nota: str = "",
):
    if usuario is not None and not usuario_nombre:
        usuario_nombre = getattr(usuario, "nombre_completo", "") or usuario.get_full_name()

    return RegistroConfirmacion.objects.create(
        cita=cita,
        estado_resultante=estado_resultante,
        usuario=usuario,
        usuario_nombre=usuario_nombre,
        medio=medio,
        nota=nota,
    )


def generar_token(cita: Cita) -> ConfirmacionToken:
    return ConfirmacionToken.objects.create(
        cita=cita,
        token=secrets.token_urlsafe(48),
    )


def get_url_confirmacion(token: ConfirmacionToken) -> str:
    return f"{settings.FRONTEND_URL}/confirmar/{token.token}"


def confirmar_cita(token_str: str) -> Cita:
    try:
        token = ConfirmacionToken.objects.select_related(
            "cita",
            "cita__paciente",
            "cita__servicio",
            "cita__profesional",
        ).get(token=token_str)
    except ConfirmacionToken.DoesNotExist as exc:
        raise ValueError("Token de confirmacion invalido.") from exc

    if not token.esta_vigente():
        raise ValueError("El token de confirmacion ya no es valido.")

    token.usado = True
    token.save(update_fields=["usado", "updated_at"])

    cita = token.cita
    cita.estado_confirmacion = Cita.EstadoConfirmacion.CONFIRMADO
    cita.confirmado_en = timezone.now()
    cita.save(update_fields=["estado_confirmacion", "confirmado_en", "updated_at"])
    crear_registro_confirmacion(
        cita=cita,
        estado_resultante=Cita.Estado.CONFIRMADA,
        usuario=None,
        usuario_nombre="Paciente (autoconfirmacion)",
        medio=RegistroConfirmacion.Medio.LINK,
        nota="",
    )
    return cita


def confirmar_manual(cita: Cita, user, *, medio: str = "", nota: str = "") -> Cita:
    cita.estado_confirmacion = Cita.EstadoConfirmacion.CONFIRMADO
    cita.confirmado_por = user
    cita.confirmado_en = timezone.now()
    cita.save(update_fields=["estado_confirmacion", "confirmado_por", "confirmado_en", "updated_at"])
    crear_registro_confirmacion(
        cita=cita,
        estado_resultante=Cita.Estado.CONFIRMADA,
        usuario=user,
        medio=medio,
        nota=nota,
    )
    return cita
