import logging
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone


logger = logging.getLogger(__name__)


class DocumensoIntegrationError(Exception):
    pass


def _documenso_api_key() -> str:
    api_key = (settings.DOCUMENSO_API_KEY or "").strip()
    if api_key.lower().startswith("bearer "):
        api_key = api_key[7:].strip()
    return api_key


def _documenso_headers() -> dict[str, str]:
    return {
        "Authorization": _documenso_api_key(),
        "Content-Type": "application/json",
    }


def _extraer_template_token(template: dict) -> str | None:
    direct_link = template.get("directLink") or template.get("direct_link") or {}
    candidates = (
        direct_link.get("token"),
        direct_link.get("publicId"),
        direct_link.get("public_id"),
        direct_link.get("externalId"),
        direct_link.get("external_id"),
        template.get("externalId"),
        template.get("external_id"),
        template.get("publicId"),
        template.get("public_id"),
        template.get("templatePublicId"),
        template.get("template_public_id"),
        template.get("token"),
    )
    return next((candidate for candidate in candidates if candidate), None)


def _extraer_signing_token(recipient: dict) -> str | None:
    token = recipient.get("token")
    if token:
        return token

    signing_url = recipient.get("signingUrl") or recipient.get("signing_url")
    if not signing_url:
        return None

    path = urlparse(signing_url).path.rstrip("/")
    if not path:
        return None
    return path.split("/")[-1] or None


def _obtener_email_destinatario(consentimiento) -> str:
    paciente = consentimiento.paciente
    email = (paciente.email or "").strip()
    if email:
        return email
    fallback = (getattr(settings, "DOCUMENSO_FALLBACK_EMAIL", "") or "").strip()
    if fallback:
        return fallback
    return f"paciente-{paciente.id}@noreply.clinica"


def _buscar_signatario(recipients: list[dict], *, template_recipient_id=None, email: str | None = None) -> dict | None:
    if template_recipient_id is not None:
        for recipient in recipients:
            if recipient.get("id") == template_recipient_id:
                return recipient

    if email:
        normalized_email = email.lower()
        for recipient in recipients:
            if (recipient.get("email") or "").lower() == normalized_email:
                return recipient

    for recipient in recipients:
        if recipient.get("role") == "SIGNER":
            return recipient

    return recipients[0] if recipients else None


def _fetch_documenso_json(method: str, path: str, *, json_payload: dict | None = None, params: dict | None = None) -> dict:
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY:
        raise DocumensoIntegrationError("La integracion con Documenso no esta configurada.")

    url = f"{settings.DOCUMENSO_API_URL.rstrip('/')}{path}"
    logger.debug("Documenso request | method=%s | url=%s | payload=%s", method, url, json_payload)
    try:
        response = requests.request(
            method,
            url,
            headers=_documenso_headers(),
            json=json_payload,
            params=params,
            timeout=15,
        )
        if not response.ok:
            logger.error(
                "Documenso error | method=%s | url=%s | status=%s | payload=%s | response=%s",
                method,
                url,
                response.status_code,
                json_payload,
                response.text,
            )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.exception("Error consumiendo Documenso | method=%s | path=%s", method, path)
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.") from exc
    except ValueError as exc:
        logger.exception("Respuesta invalida de Documenso | method=%s | path=%s", method, path)
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.") from exc


def _resolver_template_documenso(template_token: str) -> tuple[dict, dict]:
    if template_token.isdigit():
        template = _fetch_documenso_json("GET", f"/api/v2/template/{template_token}")
        signer = _buscar_signatario(template.get("recipients") or [])
        if not signer:
            raise DocumensoIntegrationError("Error al crear el documento en Documenso.")
        return template, signer

    page = 1
    while True:
        payload = _fetch_documenso_json(
            "GET",
            "/api/v2/template",
            params={"page": page, "perPage": 100},
        )
        templates = payload.get("data") or []
        for template in templates:
            candidates = {
                str(template.get("id")),
                _extraer_template_token(template),
            }
            if template_token in {candidate for candidate in candidates if candidate}:
                signer = _buscar_signatario(template.get("recipients") or [])
                if not signer:
                    raise DocumensoIntegrationError("Error al crear el documento en Documenso.")
                return template, signer

        pagination = payload.get("pagination") or {}
        total_pages = pagination.get("totalPages") or page
        if page >= total_pages:
            break
        page += 1

    raise DocumensoIntegrationError("Error al crear el documento en Documenso.")


def obtener_signing_token_documento(document_id: str, *, recipient_email: str | None = None) -> str | None:
    payload = _fetch_documenso_json("GET", f"/api/v2/envelope/{document_id}")
    recipient = _buscar_signatario(payload.get("recipients") or [], email=recipient_email)
    if not recipient:
        return None
    return _extraer_signing_token(recipient)


def iniciar_firma_consentimiento(consentimiento) -> tuple[str, str]:
    logger.info(
        "iniciar_firma | consentimiento_id=%s | paciente_id=%s | template_token=%s | doc_id=%s | signing_token_guardado=%s",
        consentimiento.id,
        consentimiento.paciente_id,
        consentimiento.documenso_template_token,
        consentimiento.documenso_document_id,
        bool(consentimiento.documenso_signing_token),
    )

    if consentimiento.documenso_document_id and consentimiento.documenso_signing_token:
        logger.info("iniciar_firma | rama=ya_completo | consentimiento_id=%s", consentimiento.id)
        return consentimiento.documenso_signing_token, consentimiento.documenso_document_id

    recipient_email = _obtener_email_destinatario(consentimiento)
    logger.info("iniciar_firma | email=%s", recipient_email)

    if consentimiento.documenso_document_id and not consentimiento.documenso_signing_token:
        logger.info("iniciar_firma | rama=recuperar_token | doc_id=%s", consentimiento.documenso_document_id)
        signing_token = obtener_signing_token_documento(
            consentimiento.documenso_document_id,
            recipient_email=recipient_email,
        )
        if not signing_token:
            logger.error("iniciar_firma | rama=recuperar_token | token_no_encontrado | doc_id=%s", consentimiento.documenso_document_id)
            raise DocumensoIntegrationError("Error al crear el documento en Documenso.")
        consentimiento.documenso_signing_token = signing_token
        consentimiento.save(update_fields=["documenso_signing_token", "updated_at"])
        logger.info("iniciar_firma | rama=recuperar_token | ok | token=%s...", signing_token[:12])
        return signing_token, consentimiento.documenso_document_id

    template_token = (consentimiento.documenso_template_token or "").strip()
    if not template_token:
        logger.error("iniciar_firma | sin_template_token | consentimiento_id=%s", consentimiento.id)
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.")

    logger.info("iniciar_firma | rama=crear_desde_template | template_token=%s", template_token)
    template, signer = _resolver_template_documenso(template_token)
    logger.info("iniciar_firma | template_id=%s | signer_id=%s | signer_email=%s", template["id"], signer.get("id"), signer.get("email"))

    payload = _fetch_documenso_json(
        "POST",
        "/api/v2/template/use",
        json_payload={
            "templateId": template["id"],
            "recipients": [
                {
                    "id": signer["id"],
                    "email": recipient_email,
                    "name": consentimiento.paciente.nombre_completo,
                }
            ],
            "distributeDocument": True,
            "externalId": str(consentimiento.id),
        },
    )

    document_id = payload.get("id")
    recipient = _buscar_signatario(
        payload.get("recipients") or [],
        template_recipient_id=signer["id"],
        email=recipient_email,
    )
    signing_token = _extraer_signing_token(recipient or {})
    logger.info(
        "iniciar_firma | template/use response | document_id=%s | signing_token=%s | recipient=%s",
        document_id,
        signing_token[:12] if signing_token else None,
        recipient,
    )

    if not document_id or not signing_token:
        logger.error(
            "Documenso no devolvio documento/token esperado | consentimiento_id=%s | response_keys=%s",
            consentimiento.id,
            sorted(payload.keys()),
        )
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.")

    consentimiento.documenso_document_id = str(document_id)
    consentimiento.documenso_signing_token = signing_token
    consentimiento.save(update_fields=["documenso_document_id", "documenso_signing_token", "updated_at"])
    return signing_token, consentimiento.documenso_document_id


def descargar_pdf_documenso(document_id: str) -> bytes | None:
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY or not document_id:
        return None

    base = settings.DOCUMENSO_API_URL.rstrip("/")
    headers = {"Authorization": _documenso_api_key()}

    try:
        # Step 1: fetch document fields to extract the envelopeItemId.
        # GET /api/v2/envelope/item/{envelopeItemId}/download works without S3.
        doc_resp = requests.get(
            f"{base}/api/v1/documents/{document_id}",
            headers=headers,
            timeout=10,
        )
        doc_resp.raise_for_status()
        fields = doc_resp.json().get("fields", [])
        envelope_item_id = next(
            (f["envelopeItemId"] for f in fields if f.get("envelopeItemId")),
            None,
        )
        if not envelope_item_id:
            logger.error(
                "No se encontró envelopeItemId en el documento de Documenso | document_id=%s",
                document_id,
            )
            return None

        # Step 2: download via envelope item endpoint (no S3 required).
        pdf_resp = requests.get(
            f"{base}/api/v2/envelope/item/{envelope_item_id}/download",
            headers=headers,
            timeout=30,
        )
        pdf_resp.raise_for_status()
        return pdf_resp.content

    except Exception:
        logger.exception("No fue posible descargar el PDF firmado desde Documenso | document_id=%s", document_id)
        return None


def marcar_consentimiento_firmado(consentimiento, *, documenso_document_id: str | None = None):
    if consentimiento.firmado:
        if documenso_document_id and consentimiento.documenso_document_id != documenso_document_id:
            consentimiento.documenso_document_id = documenso_document_id
            consentimiento.save(update_fields=["documenso_document_id", "updated_at"])
        return consentimiento

    consentimiento.firmado = True
    consentimiento.fecha_firma = timezone.localdate()
    update_fields = ["firmado", "fecha_firma", "updated_at"]
    if documenso_document_id:
        consentimiento.documenso_document_id = documenso_document_id
        update_fields.append("documenso_document_id")
    consentimiento.save(update_fields=update_fields)
    return consentimiento


def guardar_pdf_firmado(consentimiento, pdf_bytes: bytes, *, filename: str | None = None):
    if not pdf_bytes:
        return consentimiento

    filename = filename or f"consentimiento-{consentimiento.id}.pdf"
    consentimiento.archivo.save(filename, ContentFile(pdf_bytes), save=False)
    consentimiento.save(update_fields=["archivo", "updated_at"])
    return consentimiento
