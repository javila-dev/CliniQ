"""Cliente de la API de Lyvio (nuestro Chatwoot) para la cuenta exclusiva de
CliniQ, donde viven los inboxes de los numeros propios de las clinicas.

Solo transporte: arma la URL, autentica y traduce errores. Las reglas de
CliniQ (catalogo, estados, eleccion de numero, respaldo) viven en
numero_propio.py. El token (LYVIO_CLINIQ_API_TOKEN) nunca se loguea.
Referencia: docs/handoff-lyvio-whatsapp-coexistence.md.
"""
import logging
import re

import requests
from django.conf import settings


logger = logging.getLogger(__name__)

TIMEOUT = 20


class LyvioError(Exception):
    """Error de Lyvio o de Meta a traves de Lyvio. `status` es el HTTP de Lyvio
    (None si no hubo respuesta) y `data` el cuerpo JSON, si lo hubo."""

    def __init__(self, mensaje, *, status=None, data=None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status
        self.data = data if isinstance(data, dict) else {}

    @property
    def meta(self) -> dict:
        """Detalle de Meta (`error.meta`): code, subcode, user_title, user_msg..."""
        error = self.data.get("error")
        return error.get("meta") or {} if isinstance(error, dict) else {}


class LyvioNoConfiguradoError(LyvioError):
    pass


def configurado() -> bool:
    return bool(settings.LYVIO_BASE_URL and settings.LYVIO_CLINIQ_ACCOUNT_ID and settings.LYVIO_CLINIQ_API_TOKEN)


def _url(path: str) -> str:
    base = settings.LYVIO_BASE_URL.rstrip("/")
    return f"{base}/api/v1/accounts/{settings.LYVIO_CLINIQ_ACCOUNT_ID}/{path.lstrip('/')}"


def _mensaje_error(data, status) -> str:
    """Chatwoot responde errores con formas distintas segun el endpoint."""
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            meta = error.get("meta") or {}
            return meta.get("user_msg") or error.get("message") or str(error)
        if isinstance(error, str) and error:
            return error
        for clave in ("message", "errors"):
            valor = data.get(clave)
            if isinstance(valor, list) and valor:
                return "; ".join(str(v) for v in valor)
            if valor:
                return str(valor)
    return f"Lyvio respondió {status}."


def request(method: str, path: str, *, json=None, params=None, timeout=TIMEOUT):
    """Llama a Lyvio y devuelve el JSON de la respuesta. Levanta LyvioError con
    el mensaje legible si la respuesta no es 2xx, y deja pasar los errores de
    red de requests (timeout/conexion) para que el llamador decida."""
    if not configurado():
        raise LyvioNoConfiguradoError("La integración con Lyvio no está configurada.")

    response = requests.request(
        method,
        _url(path),
        json=json,
        params=params,
        headers={"api_access_token": settings.LYVIO_CLINIQ_API_TOKEN},
        timeout=timeout,
    )
    try:
        data = response.json()
    except ValueError:
        data = None

    if response.status_code >= 400:
        mensaje = _mensaje_error(data, response.status_code)
        logger.warning("Lyvio %s %s -> %s: %s", method, path, response.status_code, mensaje)
        raise LyvioError(mensaje, status=response.status_code, data=data)
    return data


def autorizar_whatsapp(
    *, code: str, waba_id: str, phone_number_id: str = "", business_id: str = "", inbox_id: str = "",
) -> dict:
    """Canjea el `code` del Embedded Signup (Coexistence) y crea el inbox.
    Chatwoot 4.18 responde solo {success, id, name, channel_type}: `id` es el
    lyvio_inbox_id; el telefono se lee despues con datos_inbox. Con `inbox_id`
    reautoriza ese inbox (mismo numero) en vez de crear uno nuevo."""
    payload = {"code": code, "waba_id": waba_id, "is_coexistence": True}
    if phone_number_id:
        payload["phone_number_id"] = phone_number_id
    if business_id:
        payload["business_id"] = business_id
    if inbox_id:
        payload["inbox_id"] = int(inbox_id)
    return request("POST", "whatsapp/authorization", json=payload, timeout=60)


def crear_plantilla(inbox_id: str, payload: dict) -> dict:
    """Crea la plantilla en la WABA del inbox (endpoint propio de Lyvio). 201 ->
    {id, name, language, status, category}."""
    return request("POST", f"lyvio/inboxes/{inbox_id}/message_templates", json=payload, timeout=60)


def sincronizar_plantillas(inbox_id: str) -> None:
    """Encola en Lyvio la lectura de las plantillas de Meta hacia su cache."""
    request("POST", f"inboxes/{inbox_id}/sync_templates")


def listar_plantillas(inbox_id: str) -> list:
    """Plantillas del cache de Lyvio (objetos de Meta: name, language, status...)."""
    data = request("GET", f"inboxes/{inbox_id}/message_templates")
    if isinstance(data, dict):
        data = data.get("payload", data.get("data", []))
    return data if isinstance(data, list) else []


def datos_inbox(inbox_id: str) -> dict:
    """Lo que CliniQ usa del inbox. La respuesta completa de Lyvio incluye el
    token de Meta (`provider_config.api_key`): no sale de esta funcion ni se
    loguea."""
    data = request("GET", f"inboxes/{inbox_id}") or {}
    config = data.get("provider_config") or {}
    return {
        "channel_type": str(data.get("channel_type") or ""),
        "phone_number": str(data.get("phone_number") or ""),
        "phone_number_id": str(config.get("phone_number_id") or ""),
        "waba_id": str(config.get("business_account_id") or ""),
        # Chatwoot lo marca si Meta rechazo el token o fallo la suscripcion de
        # webhooks al conectar (aunque la autorizacion haya respondido OK).
        "reauthorization_required": bool(data.get("reauthorization_required")),
    }


def salud(inbox_id: str) -> dict:
    """Estado del numero en Meta: status, is_on_biz_app, quality_rating,
    messaging_limit_tier (limite diario del portfolio)..."""
    return request("GET", f"inboxes/{inbox_id}/health") or {}


def telefono_e164(telefono: str, indicativo: str = "57") -> str:
    """Numero en E.164. Los telefonos de pacientes se guardan sin indicativo
    (Colombia): 3001112233 -> +573001112233."""
    telefono = (telefono or "").strip()
    digitos = "".join(c for c in telefono if c.isdigit())
    if not digitos:
        return ""
    if telefono.startswith("+"):
        return f"+{digitos}"
    if len(digitos) == 10 and digitos.startswith("3"):
        return f"+{indicativo}{digitos}"
    return f"+{digitos}"


_E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def telefono_valido(telefono_e164: str) -> bool:
    """Chatwoot rechaza contactos de WhatsApp sin un E.164 valido."""
    return bool(_E164.match(telefono_e164 or ""))


def _payload(data):
    """Chatwoot envuelve casi todo en `payload`."""
    return data.get("payload", data) if isinstance(data, dict) else data


def crear_contacto(inbox_id: str, nombre: str, telefono: str) -> str:
    data = _payload(request("POST", "contacts", json={"inbox_id": int(inbox_id), "name": nombre, "phone_number": telefono}))
    contacto = data.get("contact", data) if isinstance(data, dict) else {}
    return str(contacto.get("id") or "")


def buscar_contacto(telefono: str) -> str:
    """Contacto de la cuenta con ese telefono exacto (los contactos son de toda
    la cuenta de Lyvio, no de un inbox)."""
    resultados = _payload(request("GET", "contacts/search", params={"q": telefono}))
    for contacto in resultados if isinstance(resultados, list) else []:
        if telefono_e164(contacto.get("phone_number") or "") == telefono:
            return str(contacto.get("id") or "")
    return ""


def conversacion_en_inbox(contact_id: str, inbox_id: str) -> str:
    """Conversacion mas reciente del contacto en ese inbox, si hay."""
    conversaciones = _payload(request("GET", f"contacts/{contact_id}/conversations"))
    for conversacion in conversaciones if isinstance(conversaciones, list) else []:
        if str(conversacion.get("inbox_id")) == str(inbox_id):
            return str(conversacion.get("id") or "")
    return ""


def crear_conversacion(inbox_id: str, contact_id: str) -> str:
    data = request("POST", "conversations", json={"inbox_id": int(inbox_id), "contact_id": int(contact_id)})
    return str((data or {}).get("id") or "")


def enviar_mensaje(conversation_id: str, contenido: str, template_params: dict) -> dict:
    """Mensaje con plantilla. Es asincrono: la respuesta no confirma que Meta lo
    acepto; el fallo llega despues por el webhook (message_updated)."""
    return request(
        "POST",
        f"conversations/{conversation_id}/messages",
        json={"content": contenido, "message_type": "outgoing", "private": False, "template_params": template_params},
    ) or {}
