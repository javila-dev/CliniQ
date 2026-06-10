from datetime import timedelta
from html import escape
import secrets
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.notificaciones.services import email_backend_requires_password, enviar_email
from apps.users.models import PasswordResetToken


User = get_user_model()
PASSWORD_POLICY_ERROR = "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un símbolo."


def validate_password_strength(password: str) -> None:
    has_min_length = len(password) >= 8
    has_upper = any(char.isupper() for char in password)
    has_lower = any(char.islower() for char in password)
    has_symbol = any(not char.isalnum() and not char.isspace() for char in password)

    if not (has_min_length and has_upper and has_lower and has_symbol):
        raise ValidationError(PASSWORD_POLICY_ERROR)


def build_auth_email_html(
    *,
    badge: str,
    title: str,
    preview: str,
    greeting_name: str,
    intro: str,
    button_label: str,
    url: str,
    expiration_hours: int,
    footer_note: str,
) -> str:
    safe_badge = escape(badge)
    safe_title = escape(title)
    safe_preview = escape(preview)
    safe_name = escape(greeting_name)
    safe_intro = escape(intro)
    safe_button = escape(button_label)
    safe_footer = escape(footer_note)
    safe_url = escape(url, quote=True)
    return f"""
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{safe_title}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f5f7fb; font-family:Arial, Helvetica, sans-serif; color:#1f1730;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg, #22121f 0%, #2f1630 100%); padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 24px 0; text-align:center;">
                <div style="display:inline-block; padding:10px 18px; border-radius:999px; background:rgba(255,255,255,0.08); color:#ff8fb1; font-size:12px; font-weight:700; letter-spacing:1.8px; text-transform:uppercase;">
                  CliniQ
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff; border-radius:28px; overflow:hidden; box-shadow:0 20px 60px rgba(22, 12, 32, 0.28);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:40px 40px 24px; background:linear-gradient(135deg, #ff4fa3 0%, #d83fa4 48%, #54d8ff 100%);">
                      <div style="display:inline-block; padding:8px 14px; border-radius:999px; background:rgba(255,255,255,0.16); color:#ffffff; font-size:12px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase;">
                        {safe_badge}
                      </div>
                      <h1 style="margin:18px 0 10px; color:#ffffff; font-size:34px; line-height:1.15; font-weight:800;">
                        {safe_title}
                      </h1>
                      <p style="margin:0; color:rgba(255,255,255,0.92); font-size:16px; line-height:1.7;">
                        {safe_preview}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:36px 40px 12px;">
                      <p style="margin:0 0 16px; font-size:16px; line-height:1.7; color:#43364c;">
                        Hola {safe_name},
                      </p>
                      <p style="margin:0 0 16px; font-size:16px; line-height:1.7; color:#43364c;">
                        {safe_intro}
                      </p>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px;">
                        <tr>
                          <td align="center" style="border-radius:14px; background:linear-gradient(135deg, #ff4fa3 0%, #d93e9f 100%);">
                            <a href="{safe_url}" style="display:inline-block; padding:16px 28px; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:14px;">
                              {safe_button}
                            </a>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:18px 20px; border-radius:18px; background:#f8eef6; border:1px solid #f2d5e5; margin:0 0 24px;">
                        <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#a23373;">
                          Importante
                        </p>
                        <p style="margin:0; font-size:14px; line-height:1.7; color:#5d4c66;">
                          Este enlace vence en {expiration_hours} horas y solo puede usarse una vez.
                        </p>
                      </div>
                      <p style="margin:0 0 12px; font-size:14px; line-height:1.7; color:#5d4c66;">
                        Si el boton no funciona, copia y pega esta URL en tu navegador:
                      </p>
                      <p style="margin:0 0 20px; font-size:13px; line-height:1.8; word-break:break-all;">
                        <a href="{safe_url}" style="color:#c7358b; text-decoration:none;">{safe_url}</a>
                      </p>
                      <p style="margin:0; font-size:14px; line-height:1.7; color:#5d4c66;">
                        {safe_footer}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 40px 36px; border-top:1px solid #f1e7ef;">
                      <p style="margin:0 0 6px; font-size:13px; font-weight:700; color:#1f1730;">
                        CliniQ
                      </p>
                      <p style="margin:0; font-size:13px; line-height:1.7; color:#7d6d86;">
                        Plataforma de gestion clinica para equipos que necesitan una experiencia clara, segura y profesional.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


def build_password_reset_email_html(*, nombre: str, url: str, expiration_hours: int) -> str:
    return build_auth_email_html(
        badge="Seguridad de acceso",
        title="Recupera tu contrasena",
        preview="Protegemos el acceso a tu cuenta con un enlace temporal y seguro.",
        greeting_name=nombre,
        intro="Recibimos una solicitud para restablecer la contrasena de tu cuenta en CliniQ. Para continuar, haz clic en el siguiente boton:",
        button_label="Restablecer contrasena",
        url=url,
        expiration_hours=expiration_hours,
        footer_note="Si no solicitaste este cambio, puedes ignorar este correo con tranquilidad.",
    )


def build_invitation_email_html(*, nombre: str, url: str, expiration_hours: int) -> str:
    return build_auth_email_html(
        badge="Invitacion a CliniQ",
        title="Activa tu acceso",
        preview="Tu cuenta ya fue creada. Solo falta definir una contrasena segura para comenzar.",
        greeting_name=nombre,
        intro="Te invitamos a completar la activacion de tu cuenta en CliniQ. Haz clic en el siguiente boton para crear tu contrasena y acceder a la plataforma:",
        button_label="Crear contrasena",
        url=url,
        expiration_hours=expiration_hours,
        footer_note="Si no esperabas esta invitacion, puedes ignorar este correo o contactar a tu administrador.",
    )


def build_password_reset_url(token: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    path = settings.FRONTEND_PASSWORD_RESET_PATH
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base}{path}?{urlencode({'token': token})}"


def create_password_reset_token(
    user: User,
    *,
    purpose: str = PasswordResetToken.Purpose.RESET,
    expiration_hours: int | None = None,
) -> PasswordResetToken:
    now = timezone.now()
    PasswordResetToken.objects.filter(
        user=user,
        purpose=purpose,
        used_at__isnull=True,
        expires_at__gt=now,
        activo=True,
    ).update(used_at=now, activo=False)
    if expiration_hours is None:
        expiration_hours = settings.PASSWORD_RESET_TOKEN_TTL_HOURS
    return PasswordResetToken.objects.create(
        user=user,
        token=secrets.token_urlsafe(48),
        purpose=purpose,
        expires_at=now + timedelta(hours=expiration_hours),
    )


def get_recent_invitation_token(user: User) -> PasswordResetToken | None:
    cooldown_seconds = getattr(settings, "PASSWORD_INVITATION_RESEND_COOLDOWN_SECONDS", 300)
    if cooldown_seconds <= 0:
        return None

    threshold = timezone.now() - timedelta(seconds=cooldown_seconds)
    return (
        PasswordResetToken.objects.filter(
            user=user,
            purpose=PasswordResetToken.Purpose.INVITE,
            used_at__isnull=True,
            expires_at__gt=timezone.now(),
            activo=True,
            created_at__gte=threshold,
        )
        .order_by("-created_at")
        .first()
    )


def send_password_reset_email(user: User) -> None:
    if email_backend_requires_password() and not settings.EMAIL_HOST_PASSWORD:
        raise ValidationError("El canal de email no esta configurado. Falta EMAIL_HOST_PASSWORD.")

    reset_token = create_password_reset_token(user)
    url = build_password_reset_url(reset_token.token)
    nombre = user.first_name.strip() or user.nombre_completo
    subject = "Recupera tu contrasena en CliniQ"
    body = (
        f"Hola {nombre},\n\n"
        "Recibimos una solicitud para restablecer tu contrasena.\n"
        f"Usa este enlace para continuar:\n{url}\n\n"
        f"El enlace vence en {settings.PASSWORD_RESET_TOKEN_TTL_HOURS} horas.\n"
        "Si no solicitaste este cambio, puedes ignorar este correo."
    )
    html_body = build_password_reset_email_html(
        nombre=nombre,
        url=url,
        expiration_hours=settings.PASSWORD_RESET_TOKEN_TTL_HOURS,
    )
    enviar_email(
        to=[user.email],
        subject=subject,
        body=body,
        html_body=html_body,
    )


def send_invitation_email(user: User) -> None:
    if email_backend_requires_password() and not settings.EMAIL_HOST_PASSWORD:
        raise ValidationError("El canal de email no esta configurado. Falta EMAIL_HOST_PASSWORD.")

    recent_token = get_recent_invitation_token(user)
    if recent_token is not None:
        return

    expiration_hours = settings.PASSWORD_INVITATION_TOKEN_TTL_HOURS
    invite_token = create_password_reset_token(
        user,
        purpose=PasswordResetToken.Purpose.INVITE,
        expiration_hours=expiration_hours,
    )
    url = build_password_reset_url(invite_token.token)
    nombre = user.first_name.strip() or user.nombre_completo
    subject = "Activa tu acceso a CliniQ"
    body = (
        f"Hola {nombre},\n\n"
        "Tu cuenta en CliniQ ya fue creada.\n"
        f"Usa este enlace para crear tu contrasena y activar tu acceso:\n{url}\n\n"
        f"El enlace vence en {expiration_hours} horas.\n"
        "Si no esperabas esta invitacion, puedes ignorar este correo."
    )
    html_body = build_invitation_email_html(
        nombre=nombre,
        url=url,
        expiration_hours=expiration_hours,
    )
    enviar_email(
        to=[user.email],
        subject=subject,
        body=body,
        html_body=html_body,
    )


def request_password_reset(email: str) -> None:
    try:
        user = User.objects.get(email__iexact=email.strip(), activo=True)
    except User.DoesNotExist:
        return
    send_password_reset_email(user)


def send_user_invitation(email: str, *, clinica=None) -> None:
    queryset = User.objects.all()
    if clinica is not None:
        queryset = queryset.filter(clinica=clinica)

    user = queryset.filter(email__iexact=email.strip()).first()
    if user is None:
        raise User.DoesNotExist

    send_invitation_email(user)


def get_valid_password_reset_token(token: str) -> PasswordResetToken:
    try:
        reset_token = PasswordResetToken.objects.select_related("user").get(token=token, activo=True)
    except PasswordResetToken.DoesNotExist as exc:
        raise ValueError("El enlace de recuperacion no es valido.") from exc

    if reset_token.is_used:
        raise ValueError("El enlace de recuperacion ya fue utilizado.")
    if reset_token.is_expired:
        raise ValueError("El enlace de recuperacion ha expirado.")
    if reset_token.purpose != PasswordResetToken.Purpose.INVITE and not reset_token.user.activo:
        raise ValueError("El usuario no esta activo.")
    return reset_token


@transaction.atomic
def confirm_password_reset(token: str, new_password: str) -> User:
    reset_token = get_valid_password_reset_token(token)
    validate_password_strength(new_password)
    user = reset_token.user
    user.set_password(new_password)
    update_fields = ["password"]
    if reset_token.purpose == PasswordResetToken.Purpose.INVITE:
        user.activo = True
        user.is_active = True
        update_fields.extend(["activo", "is_active"])
    user.save(update_fields=update_fields)

    now = timezone.now()
    reset_token.used_at = now
    reset_token.activo = False
    reset_token.save(update_fields=["used_at", "activo", "updated_at"])
    PasswordResetToken.objects.filter(
        user=user,
        used_at__isnull=True,
        activo=True,
    ).exclude(pk=reset_token.pk).update(used_at=now, activo=False)
    return user
