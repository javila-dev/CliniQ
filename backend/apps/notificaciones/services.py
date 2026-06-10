import logging
import uuid

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone

from apps.agenda.confirmacion import generar_token, get_url_confirmacion
from apps.agenda.models import Cita
from apps.core.storage import get_public_url, upload_public_file


logger = logging.getLogger(__name__)


def get_whatsapp_outbound_webhook_url() -> str:
    path = getattr(settings, "WHATSAPP_OUTBOUND_WEBHOOK_URL", "") or getattr(settings, "ORDEN_WEBHOOK_URL", "")
    if not path:
        return ""
    if path.startswith("http"):
        return path
    base = getattr(settings, "N8N_BASE_URL", "").rstrip("/")
    return f"{base}{path}"


def enviar_documento_whatsapp_webhook(
    *,
    paciente,
    tipo_notificacion: str,
    pdf_bytes: bytes,
    nombre_archivo_pdf: str,
    metadata: dict | None = None,
) -> dict:
    url = get_whatsapp_outbound_webhook_url()
    if not url:
        raise ValueError("Webhook no configurado")

    hoy = timezone.now()
    storage_path = f"whatsapp_docs/{hoy.year}/{hoy.month:02d}/{uuid.uuid4().hex}/{nombre_archivo_pdf}"
    upload_public_file(pdf_bytes, storage_path, content_type="application/pdf")
    pdf_url = get_public_url(storage_path)

    payload = {
        "nombre": paciente.nombres,
        "apellido": paciente.apellidos,
        "telefono": paciente.telefono,
        "clinica_nombre": paciente.clinica.nombre if paciente.clinica else "",
        "tipo_notificacion": tipo_notificacion,
        "pdf_url": pdf_url,
        "pdf_nombre_archivo": nombre_archivo_pdf,
    }
    if metadata:
        payload["metadata"] = metadata

    headers = {}
    if settings.N8N_WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = settings.N8N_WEBHOOK_SECRET

    response = requests.post(url, json=payload, headers=headers, timeout=15)
    response.raise_for_status()
    return payload


def get_appointment_reminders_webhook_url() -> str:
    path = getattr(settings, "N8N_APPOINTMENT_REMINDERS_WEBHOOK", "")
    if not path:
        return ""
    if path.startswith("http"):
        return path
    base = getattr(settings, "N8N_BASE_URL", "").rstrip("/")
    return f"{base}{path}"


def enviar_recordatorio_cita_webhook(payload: dict) -> None:
    url = get_appointment_reminders_webhook_url()
    if not url:
        raise ValueError("N8N_APPOINTMENT_REMINDERS_WEBHOOK no configurado.")
    headers = {}
    if settings.N8N_WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = settings.N8N_WEBHOOK_SECRET
    response = requests.post(url, json=payload, headers=headers, timeout=15)
    response.raise_for_status()


def email_backend_requires_password() -> bool:
    return settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend"


def email_provider_config() -> dict:
    return {
        "provider": "resend",
        "backend": settings.EMAIL_BACKEND,
        "host": settings.EMAIL_HOST,
        "port": settings.EMAIL_PORT,
        "username": settings.EMAIL_HOST_USER,
        "use_tls": settings.EMAIL_USE_TLS,
        "use_ssl": settings.EMAIL_USE_SSL,
        "timeout": settings.EMAIL_TIMEOUT,
        "default_from_email": settings.DEFAULT_FROM_EMAIL,
        "configured": (
            bool(settings.EMAIL_BACKEND)
            and (
                not email_backend_requires_password()
                or bool(settings.EMAIL_HOST and settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD)
            )
        ),
    }


def enviar_email(
    *,
    to: list[str],
    subject: str,
    body: str,
    html_body: str = "",
    from_email: str | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    reply_to: list[str] | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> int:
    connection = get_connection(
        backend=settings.EMAIL_BACKEND,
        host=settings.EMAIL_HOST,
        port=settings.EMAIL_PORT,
        username=settings.EMAIL_HOST_USER,
        password=settings.EMAIL_HOST_PASSWORD,
        use_tls=settings.EMAIL_USE_TLS,
        use_ssl=settings.EMAIL_USE_SSL,
        timeout=settings.EMAIL_TIMEOUT,
    )
    email = EmailMultiAlternatives(
        subject=subject,
        body=body,
        from_email=from_email or settings.DEFAULT_FROM_EMAIL,
        to=to,
        cc=cc or [],
        bcc=bcc or [],
        reply_to=reply_to or [],
        connection=connection,
    )
    if html_body:
        email.attach_alternative(html_body, "text/html")
    for attachment in attachments or []:
        email.attach(*attachment)
    return email.send()


def _build_message(cita: Cita) -> str:
    token = generar_token(cita)
    url = get_url_confirmacion(token)
    fecha = cita.fecha_inicio.strftime("%Y-%m-%d %H:%M")
    return (
        f"Hola {cita.paciente.nombre_completo}, te recordamos tu cita de "
        f"{cita.servicio.nombre} el {fecha}. Confirma aqui: {url}"
    )


def enviar_confirmacion_whatsapp(cita: Cita) -> bool:
    if not settings.EVOLUTION_API_URL or not settings.EVOLUTION_API_KEY:
        logger.warning("Evolution API no configurada para enviar WhatsApp.")
        return False

    payload = {
        "number": cita.paciente.telefono,
        "text": _build_message(cita),
    }
    headers = {
        "apikey": settings.EVOLUTION_API_KEY,
        "Content-Type": "application/json",
    }
    url = settings.EVOLUTION_API_URL.rstrip("/")
    if settings.EVOLUTION_INSTANCE:
        url = f"{url}/message/sendText/{settings.EVOLUTION_INSTANCE}"

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        return True
    except Exception as exc:
        logger.exception("Fallo enviando confirmacion por WhatsApp para cita %s: %s", cita.id, exc)
        return False


def enviar_confirmacion_sms(cita: Cita) -> bool:
    if not settings.MENSATEK_API_URL or not settings.MENSATEK_API_KEY:
        logger.warning("Mensatek API no configurada para enviar SMS.")
        return False

    payload = {
        "api_key": settings.MENSATEK_API_KEY,
        "to": cita.paciente.telefono,
        "message": _build_message(cita),
    }
    try:
        response = requests.post(settings.MENSATEK_API_URL, json=payload, timeout=10)
        response.raise_for_status()
        return True
    except Exception as exc:
        logger.exception("Fallo enviando confirmacion por SMS para cita %s: %s", cita.id, exc)
        return False


def enviar_recordatorio(cita: Cita) -> bool:
    if cita.canal_confirmacion == Cita.CanalConfirmacion.WHATSAPP:
        return enviar_confirmacion_whatsapp(cita)
    if cita.canal_confirmacion == Cita.CanalConfirmacion.SMS:
        return enviar_confirmacion_sms(cita)

    logger.info("Cita %s requiere llamada manual; no se envia mensaje externo.", cita.id)
    return False
