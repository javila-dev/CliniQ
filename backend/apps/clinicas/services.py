from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape

from apps.notificaciones.services import email_backend_requires_password, enviar_email
from apps.users.models import Rol, User

from .models import Clinica, RegistroPendiente

TRIAL_DAYS = 14
VERIFICATION_TOKEN_TTL_HOURS = 24


def _build_verification_url(token: str) -> str:
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return f"{frontend_url}/verificar-clinica/{token}"


def _send_verification_email(registro: RegistroPendiente) -> None:
    if email_backend_requires_password() and not settings.EMAIL_HOST_PASSWORD:
        raise ValueError("El canal de email no está configurado.")

    from apps.users.services import build_auth_email_html

    url = _build_verification_url(registro.token)
    nombre = registro.nombre_admin.strip() or registro.email
    subject = "Confirma tu correo para crear tu cuenta en CliniQ"
    body = (
        f"Hola {nombre},\n\n"
        "Gracias por registrarte en CliniQ. Confirma tu dirección de correo haciendo clic en el enlace:\n"
        f"{url}\n\n"
        f"El enlace vence en {VERIFICATION_TOKEN_TTL_HOURS} horas.\n"
        "Si no solicitaste este registro, ignora este mensaje."
    )
    html_body = build_auth_email_html(
        badge="Verificación de correo",
        title="Confirma tu correo",
        preview="Un solo clic y tu clínica estará lista para configurarse.",
        greeting_name=nombre,
        intro=(
            "Gracias por registrar <strong>" + escape(registro.nombre_clinica) + "</strong> en CliniQ. "
            "Para completar el proceso y activar tu cuenta, confirma tu dirección de correo electrónico."
        ),
        button_label="Confirmar correo",
        url=url,
        expiration_hours=VERIFICATION_TOKEN_TTL_HOURS,
        footer_note=(
            "Si no creaste una cuenta en CliniQ, puedes ignorar este mensaje con total seguridad."
        ),
    )
    enviar_email(to=[registro.email], subject=subject, body=body, html_body=html_body)


def iniciar_registro_clinica(
    *,
    nombre_clinica: str,
    nit: str,
    nombre_admin: str,
    apellido_admin: str,
    email: str,
    telefono: str,
) -> RegistroPendiente:
    """
    Paso 1: guarda la solicitud y envía el email de verificación.
    No crea la clínica ni el usuario todavía.
    """
    registro = RegistroPendiente.create(
        nombre_clinica=nombre_clinica,
        nit=nit,
        nombre_admin=nombre_admin,
        apellido_admin=apellido_admin,
        email=email,
        telefono=telefono,
    )
    _send_verification_email(registro)
    return registro


def confirmar_registro_clinica(token: str) -> str:
    """
    Paso 2: verifica el token, crea la clínica + admin.
    Retorna el token de invitación para que el frontend redirija directo
    a la pantalla de crear contraseña — sin enviar un segundo correo.
    """
    try:
        registro = RegistroPendiente.objects.get(token=token)
    except RegistroPendiente.DoesNotExist:
        raise ValueError("El enlace de verificación no es válido.")

    if not registro.is_valid():
        raise ValueError("El enlace de verificación ya fue usado o expiró.")

    from apps.users.models import PasswordResetToken
    from apps.users.rbac import ensure_default_roles_for_clinica
    from apps.users.services import create_password_reset_token

    with transaction.atomic():
        registro.usado_at = timezone.now()
        registro.save(update_fields=["usado_at"])

        clinica = Clinica.objects.create(
            nombre=registro.nombre_clinica,
            nit=registro.nit,
            telefono=registro.telefono,
            trial_expires_at=timezone.now() + timedelta(days=TRIAL_DAYS),
        )

        ensure_default_roles_for_clinica(clinica)

        rol_admin = Rol.objects.filter(clinica=clinica, slug="admin", activo=True).first()
        admin_user = User(
            email=registro.email,
            first_name=registro.nombre_admin,
            last_name=registro.apellido_admin,
            clinica=clinica,
            rol="admin",
            rol_dinamico=rol_admin,
            is_active=False,
            activo=False,
        )
        admin_user.set_unusable_password()
        admin_user.save()

        invite_token = create_password_reset_token(
            admin_user,
            purpose=PasswordResetToken.Purpose.INVITE,
        )

    return invite_token.token
