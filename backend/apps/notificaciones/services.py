import logging
import uuid
from dataclasses import dataclass

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone

from apps.core.storage import get_public_url, upload_public_file
from apps.notificaciones.models import EnvioWhatsApp


logger = logging.getLogger(__name__)


class WhatsAppNoDisponibleError(Exception):
    """La clinica no puede enviar WhatsApp: addon desactivado o cupo mensual agotado."""

    def __init__(self, message, *, code):
        super().__init__(message)
        self.code = code


def _envios_que_cuentan_cupo(clinica, hoy):
    """Envios del mes que descuentan cupo: solo la ruta compartida (los envios
    por numero propio los paga la clinica a Meta)."""
    return EnvioWhatsApp.objects.filter(
        clinica=clinica,
        ruta=EnvioWhatsApp.Ruta.COMPARTIDO,
        created_at__year=hoy.year,
        created_at__month=hoy.month,
    )


def verificar_disponibilidad_whatsapp(clinica) -> None:
    """Valida el addon de WhatsApp antes de disparar un envio. No hace la llamada:
    solo gatea. Levanta WhatsAppNoDisponibleError si la clinica no puede enviar."""
    if not clinica.whatsapp_habilitado:
        raise WhatsAppNoDisponibleError(
            "WhatsApp no está habilitado para esta clínica.", code="WHATSAPP_NO_HABILITADO",
        )
    cupo = clinica.whatsapp_envios_incluidos
    if cupo:
        hoy = timezone.now()
        usados = _envios_que_cuentan_cupo(clinica, hoy).count()
        if usados >= cupo:
            raise WhatsAppNoDisponibleError(
                "Se agotó el cupo de envíos de WhatsApp de este mes.", code="WHATSAPP_CUPO_AGOTADO",
            )


def registrar_envio_whatsapp(clinica, tipo: str, paciente=None, *, motivo_ruta: str = "", respaldo_de=None) -> None:
    """Registra un envio de WhatsApp exitoso por el numero compartido. Llamar
    solo despues de que el envio real haya tenido exito (para no descontar cupo
    por intentos fallidos)."""
    EnvioWhatsApp.objects.create(
        clinica=clinica, tipo=tipo, paciente=paciente, ruta=EnvioWhatsApp.Ruta.COMPARTIDO,
        motivo_ruta=motivo_ruta, respaldo_de=respaldo_de,
    )


def uso_whatsapp_mes_actual(clinica) -> dict:
    """Resumen de consumo del addon de WhatsApp para el mes calendario actual."""
    hoy = timezone.now()
    envios_incluidos = clinica.whatsapp_envios_incluidos
    envios_realizados = _envios_que_cuentan_cupo(clinica, hoy).count()
    sin_limite = envios_incluidos == 0
    # Enviados desde los numeros de la clinica: no cuentan contra el cupo (los
    # paga la clinica a Meta). Los fallidos salieron por el compartido.
    envios_numero_propio = EnvioWhatsApp.objects.filter(
        clinica=clinica,
        ruta=EnvioWhatsApp.Ruta.PROPIO,
        created_at__year=hoy.year,
        created_at__month=hoy.month,
    ).exclude(estado=EnvioWhatsApp.Estado.FALLIDO).count()
    return {
        "habilitado": clinica.whatsapp_habilitado,
        "envios_incluidos": envios_incluidos,
        "envios_realizados": envios_realizados,
        "envios_restantes": None if sin_limite else max(0, envios_incluidos - envios_realizados),
        "sin_limite": sin_limite,
        "envios_numero_propio": envios_numero_propio,
    }


def get_whatsapp_outbound_webhook_url() -> str:
    path = getattr(settings, "WHATSAPP_OUTBOUND_WEBHOOK_URL", "") or getattr(settings, "ORDEN_WEBHOOK_URL", "")
    if not path:
        return ""
    if path.startswith("http"):
        return path
    base = getattr(settings, "N8N_BASE_URL", "").rstrip("/")
    return f"{base}{path}"


def enviar_otp_checkin_webhook(*, paciente, codigo: str) -> dict:
    """Envia el codigo OTP de check-in (citas y sesiones de protocolo) por el
    webhook outbound de n8n -> Lyvio."""
    url = get_whatsapp_outbound_webhook_url()
    if not url:
        raise ValueError("Webhook no configurado")

    payload = {
        "nombre": paciente.nombres,
        "apellido": paciente.apellidos,
        "telefono": paciente.telefono,
        "clinica_id": str(paciente.clinica_id) if paciente.clinica_id else "",
        "paciente_id": str(paciente.id),
        "tipo_notificacion": "checkin_otp",
        "codigo": codigo,
    }

    headers = {}
    if settings.N8N_WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = settings.N8N_WEBHOOK_SECRET

    response = requests.post(url, json=payload, headers=headers, timeout=15)
    response.raise_for_status()
    return payload


def subir_pdf_whatsapp(pdf_bytes: bytes, nombre_archivo_pdf: str) -> str:
    """Sube el PDF a una URL publica para que n8n/Lyvio lo adjunten."""
    hoy = timezone.now()
    storage_path = f"whatsapp_docs/{hoy.year}/{hoy.month:02d}/{uuid.uuid4().hex}/{nombre_archivo_pdf}"
    upload_public_file(pdf_bytes, storage_path, content_type="application/pdf")
    return get_public_url(storage_path)


def enviar_documento_whatsapp_webhook(
    *,
    paciente,
    tipo_notificacion: str,
    nombre_archivo_pdf: str,
    pdf_bytes: bytes | None = None,
    pdf_url: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """`pdf_url` si el PDF ya esta subido (respaldo de un envio por numero propio)."""
    url = get_whatsapp_outbound_webhook_url()
    if not url:
        raise ValueError("Webhook no configurado")

    if not pdf_url:
        pdf_url = subir_pdf_whatsapp(pdf_bytes, nombre_archivo_pdf)

    payload = {
        "nombre": paciente.nombres,
        "apellido": paciente.apellidos,
        "telefono": paciente.telefono,
        "clinica_id": str(paciente.clinica_id) if paciente.clinica_id else "",
        "clinica_nombre": paciente.clinica.nombre if paciente.clinica else "",
        "paciente_id": str(paciente.id),
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


def enviar_link_firma_whatsapp(
    *,
    paciente,
    documento_tipo: str,
    link: str,
    metadata: dict | None = None,
) -> dict:
    """Envia por WhatsApp (mismo webhook outbound de n8n -> Lyvio) un enlace para
    firmar un documento. Generico: consentimientos, registro de asistencia,
    compromiso de pago, etc. No sube ningun PDF; n8n arma el texto desde la
    plantilla de WhatsApp usando `documento_tipo` y `link`."""
    url = get_whatsapp_outbound_webhook_url()
    if not url:
        raise ValueError("Webhook no configurado")

    payload = {
        "nombre": paciente.nombres,
        "apellido": paciente.apellidos,
        "telefono": paciente.telefono,
        "clinica_id": str(paciente.clinica_id) if paciente.clinica_id else "",
        "clinica_nombre": paciente.clinica.nombre if paciente.clinica else "",
        "paciente_id": str(paciente.id),
        "tipo_notificacion": "firma_documento",
        "documento_tipo": documento_tipo,
        "link": link,
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


@dataclass(frozen=True)
class RutaWhatsApp:
    """Por donde sale un envio de WhatsApp: el numero compartido (n8n -> Lyvio,
    cuenta principal) o un numero propio de la clinica (Django -> Lyvio, cuenta
    de CliniQ). `motivo` queda en EnvioWhatsApp.motivo_ruta."""

    clinica: object
    sede: object = None
    canal: str = "compartido"
    numero: object = None
    motivo: str = ""


def resolver_ruta_whatsapp(clinica, sede=None, *, tipo=None, paciente=None, cita=None) -> RutaWhatsApp:
    """Decide por donde sale el envio y valida que la clinica pueda enviar.
    Levanta WhatsAppNoDisponibleError (solo en la ruta compartida: la propia no
    descuenta cupo). Llamarla antes de crear efectos que haya que deshacer (OTP,
    documentos) y pasar el resultado a enviar_whatsapp. Sin `tipo` siempre
    resuelve el compartido."""
    from apps.notificaciones.numero_propio import elegir_numero

    numero, motivo = elegir_numero(clinica, tipo=tipo, sede=sede, cita=cita, paciente=paciente)
    if numero is not None:
        return RutaWhatsApp(clinica=clinica, sede=sede, canal="propio", numero=numero, motivo=motivo)
    verificar_disponibilidad_whatsapp(clinica)
    return RutaWhatsApp(clinica=clinica, sede=sede, motivo=motivo)


def enviar_whatsapp(
    *, tipo: str, paciente, clinica=None, sede=None, cita=None, ruta: RutaWhatsApp | None = None, **datos,
):
    """Punto unico de envio de WhatsApp: resuelve la ruta (si no viene), envia
    y registra el envio. Todos los envios del backend pasan por aqui. `cita`
    ayuda a elegir el numero de la sede cuando el objeto no tiene sede. `datos`
    depende del tipo:

    - checkin_otp: codigo
    - firma_documento: documento_tipo, link, metadata
    - envio_cotizacion / envio_formula: pdf_bytes, nombre_archivo_pdf, metadata
    - recordatorio_cita: payload

    Errores: WhatsAppNoDisponibleError (addon/cupo), ValueError (webhook no
    configurado) y requests.RequestException (fallo del webhook). En la ruta
    compartida, si falla no se registra nada; en la propia, un fallo sale por
    el compartido (ver numero_propio.enviar_por_numero_propio)."""
    if ruta is None:
        ruta = resolver_ruta_whatsapp(clinica, sede, tipo=tipo, paciente=paciente, cita=cita)
    if ruta.canal == "propio":
        from apps.notificaciones.numero_propio import enviar_por_numero_propio

        return enviar_por_numero_propio(ruta, tipo=tipo, paciente=paciente, datos=datos)
    return enviar_por_compartido(ruta.clinica, tipo=tipo, paciente=paciente, datos=datos, motivo=ruta.motivo)


def enviar_por_compartido(clinica, *, tipo: str, paciente, datos: dict, motivo: str = "", respaldo_de=None):
    """Envio por el numero compartido (n8n). Registra el envio, que descuenta
    cupo, solo si el webhook lo acepto."""
    Tipo = EnvioWhatsApp.Tipo
    if tipo == Tipo.CHECKIN_OTP:
        resultado = enviar_otp_checkin_webhook(paciente=paciente, codigo=datos["codigo"])
    elif tipo == Tipo.FIRMA_DOCUMENTO:
        resultado = enviar_link_firma_whatsapp(
            paciente=paciente,
            documento_tipo=datos["documento_tipo"],
            link=datos["link"],
            metadata=datos.get("metadata"),
        )
    elif tipo in (Tipo.ENVIO_COTIZACION, Tipo.ENVIO_FORMULA):
        resultado = enviar_documento_whatsapp_webhook(
            paciente=paciente,
            tipo_notificacion=tipo,
            pdf_bytes=datos.get("pdf_bytes"),
            pdf_url=datos.get("pdf_url"),
            nombre_archivo_pdf=datos["nombre_archivo_pdf"],
            metadata=datos.get("metadata"),
        )
    elif tipo == Tipo.RECORDATORIO_CITA:
        resultado = enviar_recordatorio_cita_webhook(datos["payload"])
    else:
        raise ValueError(f"Tipo de envio de WhatsApp desconocido: {tipo}")

    registrar_envio_whatsapp(clinica, tipo, paciente=paciente, motivo_ruta=motivo, respaldo_de=respaldo_de)
    return resultado


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


