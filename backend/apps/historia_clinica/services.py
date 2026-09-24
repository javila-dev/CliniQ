import logging
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.inventario.models import MovimientoInventario
from apps.inventario.services import registrar_ajuste, registrar_salida


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
    paciente_email = (getattr(paciente, "email", "") or "").strip()
    if paciente_email:
        return paciente_email
    clinica_email = (getattr(paciente.clinica, "email", "") or "").strip()
    if clinica_email:
        return clinica_email
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


def _firmantes_por_orden(recipients: list[dict]) -> list[dict]:
    """Firmantes (SIGNER) ordenados por signingOrder: el primero es el paciente y, si hay
    otro, es el profesional que firma en la primera atención."""
    firmantes = [r for r in recipients if str(r.get("role") or "SIGNER").upper() == "SIGNER"]
    return sorted(firmantes, key=lambda r: (r.get("signingOrder") is None, r.get("signingOrder") or 0))


def _signatario_paciente_de_template(template: dict) -> dict | None:
    firmantes = _firmantes_por_orden(template.get("recipients") or [])
    return firmantes[0] if firmantes else _buscar_signatario(template.get("recipients") or [])


def _resolver_template_documenso(template_token: str) -> tuple[dict, dict]:
    if template_token.isdigit():
        template = _fetch_documenso_json("GET", f"/api/v2/template/{template_token}")
        signer = _signatario_paciente_de_template(template)
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
                signer = _signatario_paciente_de_template(template)
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


def url_firma_documenso(signing_token: str) -> str:
    """URL publica de firma de Documenso para un signing_token dado."""
    base = (settings.DOCUMENSO_API_URL or "").rstrip("/")
    return f"{base}/sign/{signing_token}" if base and signing_token else ""


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

    # Rama nueva: plantilla self-service con PDF propio
    if getattr(consentimiento, "plantilla_id", None) and consentimiento.plantilla and consentimiento.plantilla.pdf_file:
        logger.info("iniciar_firma | rama=plantilla_pdf | plantilla_id=%s", consentimiento.plantilla_id)
        from apps.consentimientos.services import iniciar_firma_consentimiento_desde_plantilla
        signing_token, document_id = iniciar_firma_consentimiento_desde_plantilla(consentimiento)
        consentimiento.documenso_document_id = document_id
        consentimiento.documenso_signing_token = signing_token
        consentimiento.save(update_fields=["documenso_document_id", "documenso_signing_token", "updated_at"])
        return signing_token, document_id

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

    # Plantilla de Documenso con un segundo firmante: es el profesional (convención por
    # signingOrder) y se asigna al profesional real en la primera atención.
    otros_firmantes = [
        r for r in _firmantes_por_orden(payload.get("recipients") or [])
        if str(r.get("id")) != str((recipient or {}).get("id"))
    ]
    consentimiento.documenso_document_id = str(document_id)
    consentimiento.documenso_signing_token = signing_token
    consentimiento.documenso_recipient_paciente_id = str((recipient or {}).get("id") or "")
    consentimiento.requiere_firma_profesional = bool(otros_firmantes)
    consentimiento.documenso_recipient_profesional_id = str(otros_firmantes[0]["id"]) if otros_firmantes else ""
    consentimiento.requiere_tp_profesional = bool(otros_firmantes) and any(
        str(f.get("recipientId")) == consentimiento.documenso_recipient_profesional_id
        and str(f.get("type") or "").upper() == "TEXT"
        for f in payload.get("fields") or []
    )
    consentimiento.save(update_fields=[
        "documenso_document_id",
        "documenso_signing_token",
        "documenso_recipient_paciente_id",
        "requiere_firma_profesional",
        "requiere_tp_profesional",
        "documenso_recipient_profesional_id",
        "updated_at",
    ])
    return signing_token, consentimiento.documenso_document_id


def _id_documento_v1(document_id: str) -> str | None:
    """La API v1 de documentos pide el id numérico. Los sobres creados por la API v2 se guardan
    con su id ``envelope_...``: se traduce con el ``secondaryId`` (``document_514`` → ``514``)."""
    document_id = str(document_id or "")
    if not document_id.startswith("envelope_"):
        return document_id or None
    try:
        envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{document_id}")
    except DocumensoIntegrationError:
        return None
    secondary = str(envelope.get("secondaryId") or "").removeprefix("document_")
    return secondary if secondary.isdigit() else None


def id_documento_para_guardar(actual: str | None, nuevo: str | None) -> str | None:
    """El id ``envelope_...`` es el que usan la firma del profesional y las consultas v2: no se
    reemplaza por el id numérico que envían el embed o el webhook."""
    if actual and str(actual).startswith("envelope_"):
        return actual
    return nuevo or actual


def descargar_pdf_documenso(document_id: str) -> bytes | None:
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY or not document_id:
        return None
    document_id = _id_documento_v1(document_id)
    if not document_id:
        return None

    base = settings.DOCUMENSO_API_URL.rstrip("/")
    headers = {"Authorization": _documenso_api_key()}

    try:
        pdf_resp = requests.get(
            f"{base}/api/v1/documents/{document_id}/download",
            headers=headers,
            timeout=30,
        )
        if pdf_resp.ok:
            return pdf_resp.content

        # Fallback: buscar envelopeItemId en los fields del documento.
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
                "No se encontró envelopeItemId en el documento de Documenso | document_id=%s | status_directo=%s",
                document_id,
                pdf_resp.status_code,
            )
            return None

        fallback_resp = requests.get(
            f"{base}/api/v2/envelope/item/{envelope_item_id}/download",
            headers=headers,
            timeout=30,
        )
        fallback_resp.raise_for_status()
        return fallback_resp.content

    except Exception:
        logger.exception("No fue posible descargar el PDF firmado desde Documenso | document_id=%s", document_id)
        return None


def documento_documenso_sellado(document_id: str) -> bool:
    """True si Documenso ya completo y sello el documento (estado COMPLETED).

    Que el firmante haya firmado no basta: hasta el sellado, la descarga devuelve
    el PDF original SIN firma. Ante cualquier error responde False (no se guarda nada).
    """
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY or not document_id:
        return False
    document_id = _id_documento_v1(document_id)
    if not document_id:
        return False
    try:
        resp = requests.get(
            f"{settings.DOCUMENSO_API_URL.rstrip('/')}/api/v1/documents/{document_id}",
            headers={"Authorization": _documenso_api_key()},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        logger.exception("No fue posible consultar el estado del documento en Documenso | document_id=%s", document_id)
        return False
    status = str(data.get("status") or "").upper()
    return status in {"COMPLETED", "COMPLETE"} or bool(data.get("completedAt"))


def descargar_pdf_documenso_sellado(document_id: str) -> bytes | None:
    """Como :func:`descargar_pdf_documenso`, pero solo si el documento ya esta sellado.

    Devuelve ``None`` mientras Documenso siga sellandolo, para no guardar como
    "firmado" el PDF original sin firma. Usar en toda descarga que no venga del
    webhook de documento completado.
    """
    if not documento_documenso_sellado(document_id):
        logger.info("Documento aun sin sellar en Documenso; no se descarga el PDF | document_id=%s", document_id)
        return None
    return descargar_pdf_documenso(document_id)


def archivo_tiene_el_mismo_contenido(field_file, data: bytes) -> bool:
    """True si el archivo guardado ya contiene exactamente ``data`` (evita reemplazos inutiles)."""
    if not field_file:
        return False
    try:
        field_file.open("rb")
        try:
            return field_file.read() == data
        finally:
            field_file.close()
    except Exception:
        return False


def refrescar_pdf_consentimiento_informado(consentimiento) -> str:
    """Reemplaza el PDF guardado por el firmado y sellado de Documenso.

    Devuelve ``"actualizado"``, ``"sin_cambios"`` (ya era el firmado) o
    ``"no_disponible"`` (sin documento, o Documenso aun no lo sella).
    """
    if not consentimiento.documenso_document_id:
        return "no_disponible"
    pdf_bytes = descargar_pdf_documenso_sellado(consentimiento.documenso_document_id)
    if not pdf_bytes:
        return "no_disponible"
    if archivo_tiene_el_mismo_contenido(consentimiento.archivo, pdf_bytes):
        return "sin_cambios"
    if consentimiento.archivo:
        consentimiento.archivo.delete(save=False)
    guardar_pdf_firmado(
        consentimiento, pdf_bytes, filename=f"consentimiento-documenso-{consentimiento.id}.pdf",
    )
    return "actualizado"


def verificar_firma_consentimiento_en_documenso(consentimiento) -> bool:
    """Consulta a Documenso si el consentimiento ya fue firmado y lo marca como firmado.

    Respaldo del webhook: los envelopes creados con la plantilla PDF propia se
    crean por multipart y Documenso ignora el ``externalId``, asi que el webhook
    puede no poder asociar el documento. Devuelve True si queda firmado. El PDF se
    recupera despues (al leerlo) solo cuando Documenso ya lo selle.
    """
    if consentimiento.firmado:
        return True
    if not consentimiento.documenso_document_id:
        return False

    from apps.historia_clinica.documenso_firmantes import resolver_envelope_id

    try:
        envelope_id = resolver_envelope_id(consentimiento.documenso_document_id)
        payload = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    except DocumensoIntegrationError:
        logger.warning(
            "No se pudo consultar el envelope para verificar la firma | consentimiento_id=%s", consentimiento.id,
        )
        return False
    if not paciente_firmo_en_envelope(consentimiento, payload):
        return False
    marcar_consentimiento_firmado(consentimiento)
    return True


def paciente_firmo_en_envelope(consentimiento, payload: dict) -> bool:
    """True si el paciente ya firmó. Con firma diferida del profesional el sobre sigue
    pendiente tras la firma del paciente, así que se mira solo su destinatario."""
    from apps.consentimientos.services import _estado_firma_desde_envelope
    from apps.historia_clinica.documenso_firmantes import destinatario_firmo

    if consentimiento.requiere_firma_profesional and consentimiento.documenso_recipient_paciente_id:
        return destinatario_firmo(payload, consentimiento.documenso_recipient_paciente_id)
    return _estado_firma_desde_envelope(payload) == "firmada"


def requiere_firma_cada_vez(cita, template_token) -> bool:
    """True si algún procedimiento de la cita exige firmar este consentimiento en cada
    ejecución (en vez de reutilizar una firma vigente por meses)."""
    from apps.clinicas.models import ServicioConsentimiento
    from apps.protocolos.services import _sesion_vinculada_o_pendiente

    if cita is None:
        return False

    procedimiento_ids = set()
    if cita.servicio_id:
        procedimiento_ids.add(cita.servicio_id)
    sesion = _sesion_vinculada_o_pendiente(cita)
    if sesion is not None:
        if sesion.tipo_sesion_id:
            procedimiento_ids.update(
                sesion.tipo_sesion.procedimientos.filter(activo=True).values_list("procedimiento_id", flat=True)
            )
        if sesion.procedimiento_id:
            procedimiento_ids.add(sesion.procedimiento_id)
    if not procedimiento_ids:
        return False
    return ServicioConsentimiento.objects.filter(
        servicio_id__in=procedimiento_ids,
        activo=True,
        requiere_firma_cada_vez=True,
        template__template_token=template_token,
    ).exists()


def consentimiento_informado_vigente(paciente_id, template_token, *, cita_id=None, requiere_cada_vez=False):
    """Último ConsentimientoInformado que satisface el requisito del paciente para el template.

    En modo vigencia (default): la última firma no vencida, sin importar la cita.
    En modo "cada vez" (``requiere_cada_vez``): exige una firma enlazada específicamente
    a ``cita_id`` — una firma vigente de otra cita no cuenta.
    """
    from django.db.models import Q

    from apps.historia_clinica.models import ConsentimientoInformado

    queryset = ConsentimientoInformado.objects.filter(
        paciente_id=paciente_id,
        documenso_template_token=template_token,
        firmado=True,
    )

    if requiere_cada_vez:
        if not cita_id:
            return None
        return queryset.filter(cita_id=cita_id).order_by("-fecha_firma", "-created_at").first()

    hoy = timezone.localdate()
    return (
        queryset.filter(Q(fecha_vencimiento__isnull=True) | Q(fecha_vencimiento__gte=hoy))
        .order_by("-fecha_firma", "-created_at")
        .first()
    )


def consentimiento_satisfecho(paciente_id, template_token, *, informado=None, cita_id=None, requiere_cada_vez=False) -> bool:
    """True si el paciente tiene el consentimiento satisfecho en cualquiera de los dos modelos:
    ConsentimientoInformado (firma Documenso) o ConsentimientoPaciente (registro manual/legado).

    ``requiere_cada_vez`` bifurca el chequeo: en modo vigencia (default) basta una firma no
    vencida; en modo "cada vez" se exige una firma enlazada específicamente a ``cita_id``.
    """
    from apps.protocolos.models import ConsentimientoPaciente

    if informado is not None:
        return True
    if consentimiento_informado_vigente(
        paciente_id, template_token, cita_id=cita_id, requiere_cada_vez=requiere_cada_vez
    ) is not None:
        return True

    queryset = ConsentimientoPaciente.objects.filter(paciente_id=paciente_id, template_token=template_token)
    if requiere_cada_vez:
        if not cita_id:
            return False
        return queryset.filter(cita_id=cita_id).exists()
    return queryset.filter(vigencia_hasta__gte=timezone.localdate()).exists()


def marcar_consentimiento_firmado(consentimiento, *, documenso_document_id: str | None = None):
    documenso_document_id = id_documento_para_guardar(consentimiento.documenso_document_id, documenso_document_id)
    if consentimiento.firmado:
        if documenso_document_id and consentimiento.documenso_document_id != documenso_document_id:
            consentimiento.documenso_document_id = documenso_document_id
            consentimiento.save(update_fields=["documenso_document_id", "updated_at"])
        return consentimiento

    consentimiento.firmado = True
    consentimiento.fecha_firma = timezone.localdate()
    update_fields = ["firmado", "fecha_firma", "updated_at"]
    if documenso_document_id and documenso_document_id != consentimiento.documenso_document_id:
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


@transaction.atomic
def registrar_consumo_insumo(*, nota, insumo, cantidad, user, notas: str = "", sede=None):
    from apps.historia_clinica.models import ConsumoInsumo
    from rest_framework.exceptions import ValidationError

    sede_consumo = nota.cita.sede if nota.cita_id else sede
    if sede_consumo is None:
        raise ValidationError(
            {"error": "Esta nota no tiene una cita asociada: indica la sede del consumo.", "code": "SEDE_REQUERIDA"}
        )

    movimiento = registrar_salida(
        insumo=insumo,
        sede=sede_consumo,
        cantidad=cantidad,
        origen=MovimientoInventario.OrigenMovimiento.CONSUMO_CITA,
        referencia_id=nota.id,
        referencia_tipo="nota_clinica",
        user=user,
    )
    return ConsumoInsumo.objects.create(
        nota=nota,
        insumo=insumo,
        cantidad=cantidad,
        movimiento=movimiento,
        notas=notas,
        registrado_por=user,
    )


@transaction.atomic
def eliminar_consumo_insumo(consumo, user):
    from apps.clinicas.models import Sede
    from apps.inventario.services import get_or_crear_stock

    sede = consumo.movimiento.sede if consumo.movimiento_id else (
        Sede.objects.filter(clinica_id=consumo.insumo.clinica_id, activo=True).order_by("created_at").first()
    )
    if sede is None:
        from rest_framework.exceptions import ValidationError
        raise ValidationError(
            {"error": "No se pudo determinar la sede de este consumo.", "code": "SEDE_REQUERIDA"}
        )
    stock_actual = get_or_crear_stock(consumo.insumo, sede).stock_actual
    registrar_ajuste(
        insumo=consumo.insumo,
        sede=sede,
        cantidad_nueva=stock_actual + consumo.cantidad,
        user=user,
        motivo=f"Reversion de consumo en atencion (nota {consumo.nota_id})",
    )
    consumo.activo = False
    consumo.save(update_fields=["activo", "updated_at"])


def descargar_pdf_documento_original(envelope_id: str) -> bytes | None:
    """PDF del primer documento del sobre tal como está (sin sellar). Para mostrarlo antes de firmar."""
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY or not envelope_id:
        return None
    from apps.historia_clinica.documenso_firmantes import resolver_envelope_id

    try:
        envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{resolver_envelope_id(envelope_id)}")
        items = envelope.get("envelopeItems") or []
        if not items:
            return None
        resp = requests.get(
            f"{settings.DOCUMENSO_API_URL.rstrip('/')}/api/v2/envelope/item/{items[0]['id']}/download",
            headers={"Authorization": _documenso_api_key()},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.content
    except Exception:
        logger.exception("No fue posible descargar el documento original de Documenso | envelope_id=%s", envelope_id)
        return None
