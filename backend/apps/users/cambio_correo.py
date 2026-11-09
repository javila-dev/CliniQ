"""Cambio del correo de acceso de un usuario de clínica, desde soporte del console.

Caso típico: el usuario perdió el acceso a su correo y no puede recuperar la
contraseña. El correo es con lo que inicia sesión (USERNAME_FIELD) y es único en
toda la plataforma; todo lo demás (citas, notas, auditoría) apunta al id, así que
cambiarlo no mueve nada más.

Al cambiarlo se anulan los enlaces de contraseña o invitación que se mandaron al
correo viejo: quien controle ese buzón no debe poder usarlos.
"""

import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.core.logging import registrar_accion
from apps.notificaciones.services import email_backend_requires_password, enviar_email
from apps.users import services
from apps.users.models import PasswordResetToken

User = get_user_model()

MOTIVO_MINIMO = 10
ACCION_LOG = "usuario.cambiar_correo"


def _error(mensaje: str, code: str):
    raise ValidationError({"error": mensaje, "code": code})


def normalizar_correo(valor) -> str:
    correo = (valor or "").strip().lower()
    if not correo:
        _error("Escribe el correo nuevo.", "CORREO_REQUERIDO")
    try:
        validate_email(correo)
    except DjangoValidationError:
        _error("Ese correo no es válido.", "CORREO_INVALIDO")
    return correo


def _cerrar_sesiones(user) -> None:
    """Invalida los refresh tokens y cambia el sid: la sesión abierta cae en su
    siguiente petición (ver ClinicScopedJWTAuthentication)."""
    ya_bloqueados = BlacklistedToken.objects.filter(token__user=user).values_list("token_id", flat=True)
    for token in OutstandingToken.objects.filter(user=user).exclude(id__in=ya_bloqueados):
        BlacklistedToken.objects.get_or_create(token=token)
    user.sesion_actual_id = uuid.uuid4().hex
    user.save(update_fields=["sesion_actual_id"])


def _anular_enlaces_pendientes(user) -> int:
    now = timezone.now()
    return PasswordResetToken.objects.filter(
        user=user, used_at__isnull=True, activo=True, expires_at__gt=now,
    ).update(used_at=now, activo=False)


def _invitacion_pendiente(user) -> bool:
    return user.last_login is None and not user.has_usable_password()


def _enviar_enlace(user) -> dict:
    """Manda al correo nuevo el enlace para crear contraseña: invitación si nunca
    la creó, restablecer si ya tenía. Devuelve el enlace aunque el correo falle,
    para que soporte lo pueda pasar por otro medio."""
    if _invitacion_pendiente(user):
        token, url, enviado = services.generar_link_invitacion(user)
        return {"tipo": "invitacion", "url": url, "email_enviado": enviado, "vence": token.expires_at}

    horas = settings.PASSWORD_RESET_TOKEN_TTL_HOURS
    token = services.create_password_reset_token(user, expiration_hours=horas)
    url = services.build_password_reset_url(token.token)
    enviado = False
    try:
        if not (email_backend_requires_password() and not settings.EMAIL_HOST_PASSWORD):
            nombre = user.first_name.strip() or user.nombre_completo
            enviar_email(
                to=[user.email],
                subject="Crea tu nueva contrasena en CliniQ",
                body=(
                    f"Hola {nombre},\n\n"
                    "Actualizamos el correo con el que entras a CliniQ.\n"
                    f"Usa este enlace para crear tu contrasena:\n{url}\n\n"
                    f"El enlace vence en {horas} horas."
                ),
                html_body=services.build_password_reset_email_html(nombre=nombre, url=url, expiration_hours=horas),
            )
            enviado = True
    except Exception:
        pass
    return {"tipo": "restablecer", "url": url, "email_enviado": enviado, "vence": token.expires_at}


def cambiar_correo(
    user, correo_nuevo, *, motivo, enviar_enlace=True, cerrar_sesiones=True, request=None,
) -> dict:
    motivo = (motivo or "").strip()
    if len(motivo) < MOTIVO_MINIMO:
        _error("Escribe el motivo del cambio (cómo se confirmó que es la persona).", "MOTIVO_REQUERIDO")
    if user.clinica_id is None:
        _error("Este usuario es del equipo de la plataforma, no de una clínica.", "USUARIO_SIN_CLINICA")
    correo_nuevo = normalizar_correo(correo_nuevo)

    with transaction.atomic():
        user = User.objects.select_for_update(of=("self",)).select_related("clinica").get(pk=user.pk)
        correo_anterior = user.email
        if correo_nuevo == correo_anterior.lower():
            _error("El correo nuevo es igual al actual.", "CORREO_IGUAL")
        if User.objects.filter(email__iexact=correo_nuevo).exclude(pk=user.pk).exists():
            _error("Ya existe otro usuario con ese correo.", "CORREO_EN_USO")

        user.email = correo_nuevo
        user.save(update_fields=["email"])
        enlaces_anulados = _anular_enlaces_pendientes(user)
        if cerrar_sesiones:
            _cerrar_sesiones(user)

    # Un usuario que la clínica desactivó no puede usar un enlace de restablecer
    # (get_valid_password_reset_token lo rechaza): se cambia el correo y ya.
    puede_recibir_enlace = user.activo or _invitacion_pendiente(user)
    enlace = _enviar_enlace(user) if enviar_enlace and puede_recibir_enlace else None

    registrar_accion(
        request, ACCION_LOG, user,
        {
            "resumen": f"Correo de acceso cambiado de {correo_anterior} a {correo_nuevo}",
            "usuario_nombre": user.nombre_completo,
            "correo_anterior": correo_anterior,
            "correo_nuevo": correo_nuevo,
            "motivo": motivo,
            "enlaces_anulados": enlaces_anulados,
            "sesiones_cerradas": bool(cerrar_sesiones),
            "enlace_enviado": enlace["tipo"] if enlace else None,
            "email_enviado": enlace["email_enviado"] if enlace else False,
        },
        clinica=user.clinica,
    )

    return {
        "id": str(user.id),
        "email": user.email,
        "correo_anterior": correo_anterior,
        "enlace": enlace,
    }


def cambios_recientes(clinica, limite: int = 10) -> list[dict]:
    from apps.core.models import LogAccion

    logs = (
        LogAccion.objects.filter(clinica=clinica, accion=ACCION_LOG)
        .select_related("usuario")
        .order_by("-created_at")[:limite]
    )
    return [
        {
            "id": str(log.id),
            "fecha": log.created_at,
            "usuario_nombre": log.detalle.get("usuario_nombre", ""),
            "correo_anterior": log.detalle.get("correo_anterior", ""),
            "correo_nuevo": log.detalle.get("correo_nuevo", ""),
            "motivo": log.detalle.get("motivo", ""),
            "hecho_por": log.usuario.nombre_completo if log.usuario else "",
        }
        for log in logs
    ]
