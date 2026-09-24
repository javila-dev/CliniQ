"""Sobres de Documenso para consentimientos con dos firmantes: paciente y profesional.

El paciente firma primero (al aceptar la cotizacion) y el profesional despues, en la
primera atencion. Como en ese momento no se sabe que profesional atendera, el sobre
se crea con un destinatario provisional que se reemplaza por el profesional real
justo antes de firmar.

La firma del profesional se hace desde el backend con la imagen guardada en su
perfil. La API publica de Documenso no permite firmar, asi que se usan las rutas
tRPC que usa la propia pantalla de firma (autenticadas con el token del
destinatario, no con la API key). Son rutas internas: al actualizar Documenso hay
que correr ``python manage.py probar_firma_profesional_documenso``.
"""
import base64
import io
import json
import logging

import requests
from django.conf import settings

from apps.historia_clinica.services import (
    DocumensoIntegrationError,
    _documenso_api_key,
    _fetch_documenso_json,
)


logger = logging.getLogger(__name__)

FIRMANTE_PACIENTE = "paciente"
FIRMANTE_PROFESIONAL = "profesional"

ROL_FIRMA = "firma"
ROL_NOMBRE = "nombre"
ROL_TP = "tp"
ROLES_PROFESIONAL = {ROL_FIRMA: "SIGNATURE", ROL_NOMBRE: "NAME", ROL_TP: "TEXT"}
# Solo la firma es obligatoria. El nombre y la TP son opcionales: la TP se ubica en los
# consentimientos que la exigen (p. ej. procedimientos médicos) y, si el documento la tiene,
# quien firma debe tener TP cargada.
ROLES_PROFESIONAL_OBLIGATORIOS = {ROL_FIRMA}

NOMBRE_PROFESIONAL_PROVISIONAL = "Profesional tratante"


def email_profesional_provisional(referencia) -> str:
    """Correo unico del destinatario provisional (no puede repetirse con el del paciente)."""
    return f"profesional+{referencia}@noreply.clinica"


def _base_url() -> str:
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY:
        raise DocumensoIntegrationError("La integracion con Documenso no esta configurada.")
    return settings.DOCUMENSO_API_URL.rstrip("/")


def firmante_de_campo(campo: dict) -> str:
    return FIRMANTE_PROFESIONAL if campo.get("firmante") == FIRMANTE_PROFESIONAL else FIRMANTE_PACIENTE


def crear_sobre_consentimiento(
    *,
    pdf_bytes: bytes,
    nombre_archivo: str,
    titulo: str,
    paciente_nombre: str,
    paciente_email: str,
    campos: list[dict],
    con_profesional: bool,
    email_profesional: str = "",
) -> dict:
    """Crea y distribuye el sobre. Devuelve ids del sobre y de cada destinatario, y el token del paciente.

    Flujo: POST /envelope/create (PDF + destinatarios, sin campos) → GET /envelope/{id}
    (envelopeItemId y ids de destinatarios) → POST /envelope/field/create-many →
    POST /envelope/distribute. Con ``distributionMethod: NONE`` Documenso no envia
    correos: la firma se hace en la app (embed) o por el link de WhatsApp.
    """
    base = _base_url()
    recipients = [
        {"email": paciente_email, "name": paciente_nombre, "role": "SIGNER", "signingOrder": 1, "fields": []},
    ]
    if con_profesional:
        recipients.append(
            {
                "email": email_profesional,
                "name": NOMBRE_PROFESIONAL_PROVISIONAL,
                "role": "SIGNER",
                "signingOrder": 2,
                "fields": [],
            }
        )
    create_payload = {
        "type": "DOCUMENT",
        "title": titulo,
        "recipients": recipients,
        "meta": {
            "signingOrder": "SEQUENTIAL",
            "distributionMethod": "NONE",
            "language": "es",
        },
    }
    try:
        resp = requests.post(
            f"{base}/api/v2/envelope/create",
            headers={"Authorization": _documenso_api_key()},
            data={"payload": json.dumps(create_payload)},
            files={"files": (nombre_archivo, pdf_bytes, "application/pdf")},
            timeout=30,
        )
        logger.info("[crear_sobre_consentimiento] create | status=%s | body=%s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
    except requests.RequestException as exc:
        body = getattr(getattr(exc, "response", None), "text", "")[:500]
        logger.error("[crear_sobre_consentimiento] error crear envelope | exc=%s | body=%s", exc, body)
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.") from exc

    envelope_id = resp.json().get("id")
    if not envelope_id:
        raise DocumensoIntegrationError("Documenso no devolvio id de envelope.")

    detalle = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    items = detalle.get("envelopeItems") or detalle.get("items") or []
    envelope_item_id = items[0].get("id") if items else None
    paciente = _destinatario_por_email(detalle, paciente_email)
    profesional = _destinatario_por_email(detalle, email_profesional) if con_profesional else None
    if paciente is None or (con_profesional and profesional is None):
        raise DocumensoIntegrationError("Documenso no devolvio los destinatarios del documento.")

    ids_por_firmante = {FIRMANTE_PACIENTE: paciente["id"]}
    if profesional is not None:
        ids_por_firmante[FIRMANTE_PROFESIONAL] = profesional["id"]

    fields_data = []
    for campo in campos:
        firmante = firmante_de_campo(campo)
        if firmante not in ids_por_firmante:
            continue
        tipo = (campo.get("type") or "SIGNATURE").upper()
        if firmante == FIRMANTE_PROFESIONAL:
            tipo = ROLES_PROFESIONAL.get(campo.get("rol"), tipo)
        field_entry = {
            "type": tipo,
            "recipientId": ids_por_firmante[firmante],
            "page": campo.get("page", 1),
            "positionX": campo.get("positionX", 10.0),
            "positionY": campo.get("positionY", 75.0),
            "width": campo.get("width", 30.0),
            "height": campo.get("height", 8.0),
        }
        if envelope_item_id:
            field_entry["envelopeItemId"] = envelope_item_id
        fields_data.append(field_entry)

    _fetch_documenso_json(
        "POST",
        "/api/v2/envelope/field/create-many",
        json_payload={"envelopeId": envelope_id, "data": fields_data},
    )
    logger.info("[crear_sobre_consentimiento] campos creados | envelope_id=%s | count=%d", envelope_id, len(fields_data))

    _fetch_documenso_json("POST", "/api/v2/envelope/distribute", json_payload={"envelopeId": envelope_id})
    detalle = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    paciente = _destinatario_por_id(detalle, paciente["id"])
    signing_token = (paciente or {}).get("token")
    if not signing_token:
        raise DocumensoIntegrationError("Documenso no devolvio signing token.")

    return {
        "envelope_id": str(envelope_id),
        "signing_token": signing_token,
        "recipient_paciente_id": str(ids_por_firmante[FIRMANTE_PACIENTE]),
        "recipient_profesional_id": str(ids_por_firmante.get(FIRMANTE_PROFESIONAL) or ""),
    }


def _destinatario_por_email(envelope: dict, email: str) -> dict | None:
    email = (email or "").lower()
    return next(
        (r for r in envelope.get("recipients") or [] if (r.get("email") or "").lower() == email),
        None,
    )


def _destinatario_por_id(envelope: dict, recipient_id) -> dict | None:
    return next(
        (r for r in envelope.get("recipients") or [] if str(r.get("id")) == str(recipient_id)),
        None,
    )


def destinatario_firmo(envelope: dict, recipient_id) -> bool:
    destinatario = _destinatario_por_id(envelope, recipient_id)
    if destinatario is None:
        return False
    estado = str(destinatario.get("signingStatus") or destinatario.get("status") or "").upper()
    return estado in {"SIGNED", "COMPLETED"} or bool(destinatario.get("signedAt"))


def resolver_envelope_id(document_id) -> str:
    """Id ``envelope_...`` que pide la API v2. Si se guardó el id numérico del documento (lo
    envían el embed y el webhook), se traduce con ``GET /api/v2/document/{id}``."""
    document_id = str(document_id or "")
    if not document_id.isdigit():
        return document_id
    documento = _fetch_documenso_json("GET", f"/api/v2/document/{document_id}")
    envelope_id = documento.get("envelopeId")
    if not envelope_id:
        raise DocumensoIntegrationError("Documenso no devolvio el sobre del documento.")
    return str(envelope_id)


def document_id_numerico(envelope: dict) -> int:
    """Id numerico del documento (``secondaryId: "document_514"``) que piden las rutas tRPC."""
    secondary = str(envelope.get("secondaryId") or "").removeprefix("document_")
    if not secondary.isdigit():
        raise DocumensoIntegrationError("Documenso no devolvio el id numerico del documento.")
    return int(secondary)


def imagen_a_data_url_png(datos: bytes) -> str:
    """Convierte la firma guardada (PNG, JPEG o WEBP) a ``data:image/png;base64,...``."""
    from PIL import Image

    imagen = Image.open(io.BytesIO(datos))
    imagen.load()
    if imagen.mode not in {"RGB", "RGBA"}:
        imagen = imagen.convert("RGBA")
    buffer = io.BytesIO()
    imagen.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def _trpc(procedimiento: str, payload: dict, *, ip: str | None, user_agent: str | None) -> dict:
    headers = {"Content-Type": "application/json"}
    if user_agent:
        headers["User-Agent"] = user_agent
    if ip:
        headers["X-Forwarded-For"] = ip
    try:
        resp = requests.post(
            f"{_base_url()}/api/trpc/{procedimiento}",
            json={"json": payload},
            headers=headers,
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception("[trpc] error de red | procedimiento=%s", procedimiento)
        raise DocumensoIntegrationError("No fue posible comunicarse con Documenso.") from exc
    if not resp.ok:
        logger.error("[trpc] error | procedimiento=%s | status=%s | body=%s", procedimiento, resp.status_code, resp.text[:1000])
        raise DocumensoIntegrationError("Documenso rechazo la firma del profesional.")
    return resp.json() if resp.text else {}


def _valor_campo_profesional(tipo: str, *, nombre: str, registro_profesional: str, firma_data_url: str) -> dict:
    if tipo == "SIGNATURE":
        return {"type": "SIGNATURE", "value": firma_data_url}
    if tipo == "NAME":
        return {"type": "NAME", "value": nombre}
    if tipo == "TEXT":
        if not registro_profesional:
            raise DocumensoIntegrationError("Este consentimiento requiere tarjeta profesional.")
        return {"type": "TEXT", "value": registro_profesional}
    if tipo == "DATE":
        return {"type": "DATE", "value": True}
    raise DocumensoIntegrationError(f"El documento tiene un campo del profesional no soportado ({tipo}).")


def firmar_como_profesional(
    *,
    envelope_id: str,
    recipient_id,
    nombre: str,
    email: str,
    registro_profesional: str,
    firma_data_url: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Asigna el destinatario provisional al profesional real, firma sus campos y completa su firma.

    Idempotente: si el profesional ya firmo en Documenso, no hace nada.
    """
    envelope_id = resolver_envelope_id(envelope_id)
    envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    if destinatario_firmo(envelope, recipient_id):
        logger.info("[firmar_como_profesional] ya firmado | envelope_id=%s", envelope_id)
        return

    _fetch_documenso_json(
        "POST",
        "/api/v2/envelope/recipient/update-many",
        json_payload={
            "envelopeId": envelope_id,
            "data": [{"id": int(recipient_id), "name": nombre, "email": email}],
        },
    )
    envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    destinatario = _destinatario_por_id(envelope, recipient_id)
    token = (destinatario or {}).get("token")
    if not token:
        raise DocumensoIntegrationError("Documenso no devolvio el token del profesional.")

    campos = [
        f for f in envelope.get("fields") or []
        if str(f.get("recipientId")) == str(recipient_id) and not f.get("inserted")
    ]
    for campo in campos:
        _trpc(
            "envelope.field.sign",
            {
                "token": token,
                "fieldId": campo["id"],
                "fieldValue": _valor_campo_profesional(
                    str(campo.get("type") or "").upper(),
                    nombre=nombre,
                    registro_profesional=registro_profesional,
                    firma_data_url=firma_data_url,
                ),
            },
            ip=ip,
            user_agent=user_agent,
        )

    _trpc(
        "recipient.completeDocumentWithToken",
        {"token": token, "documentId": document_id_numerico(envelope)},
        ip=ip,
        user_agent=user_agent,
    )
    logger.info(
        "[firmar_como_profesional] ok | envelope_id=%s | recipient_id=%s | campos=%d",
        envelope_id, recipient_id, len(campos),
    )
