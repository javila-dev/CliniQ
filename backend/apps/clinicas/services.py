from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.notificaciones.services import email_backend_requires_password, enviar_email
from apps.suscripciones.services import crear_prueba
from apps.users.models import Rol, User

from .models import Clinica, RegistroPendiente, Sede

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
            # La plantilla escapa el texto: el nombre va sin etiquetas (antes se veía "<strong>").
            f"Gracias por registrar {registro.nombre_clinica} en CliniQ. "
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
    nit: str = "",
    nombre_admin: str,
    apellido_admin: str,
    email: str,
    telefono: str,
    acepta_whatsapp: bool = False,
    cargo: str = "",
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
        acepta_whatsapp=acepta_whatsapp,
        cargo=cargo,
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

    from apps.users.models import PasswordResetToken
    from apps.users.rbac import ensure_default_roles_for_clinica
    from apps.users.services import admin_con_invitacion_pendiente, create_password_reset_token

    if registro.usado_at is not None and registro.expires_at > timezone.now():
        # Verificó el correo pero cerró antes de crear la contraseña: al volver a
        # abrir el enlace se le da una invitación nueva en vez de dejarla
        # bloqueada (M7-12).
        # El correo es único entre usuarios: identifica al admin aunque la clínica no tenga NIT.
        admin = User.objects.filter(email__iexact=registro.email, clinica__isnull=False).first()
        if admin is not None and admin_con_invitacion_pendiente(admin):
            return create_password_reset_token(admin, purpose=PasswordResetToken.Purpose.INVITE).token
    if not registro.is_valid():
        raise ValueError("El enlace de verificación ya fue usado o expiró.")

    with transaction.atomic():
        registro.usado_at = timezone.now()
        registro.save(update_fields=["usado_at"])

        clinica = Clinica.objects.create(
            nombre=registro.nombre_clinica,
            nit=registro.nit or None,
            telefono=registro.telefono,
        )
        suscripcion = crear_prueba(clinica)
        if registro.acepta_whatsapp:
            suscripcion.whatsapp_autorizado_at = registro.created_at
        if registro.cargo:
            suscripcion.perfil = {**suscripcion.perfil, "cargo": registro.cargo}
        suscripcion.save(update_fields=["whatsapp_autorizado_at", "perfil"])
        # La primera sede con el nombre de la clínica: dirección y horario quedan
        # como paso de "Preparar mi clínica" (antes ni siquiera había sede).
        Sede.objects.create(clinica=clinica, nombre=clinica.nombre, ciudad="", direccion="", telefono=registro.telefono[:20])

        ensure_default_roles_for_clinica(clinica)

        rol_admin = Rol.objects.filter(clinica=clinica, slug="admin", activo=True).first()
        admin_user = User(
            email=registro.email,
            first_name=registro.nombre_admin,
            last_name=registro.apellido_admin,
            telefono=registro.telefono[:20],
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
