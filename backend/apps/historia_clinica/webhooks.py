import hmac
import json
import logging

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import (
    descargar_pdf_documenso,
    guardar_pdf_firmado,
    marcar_consentimiento_firmado,
)


logger = logging.getLogger(__name__)

_ASISTENCIA_PREFIX = "asistencia:"
_COMPROMISO_PAGO_PREFIX = "compromiso_pago:"


def _resolve_asistencia_by_token(recipients: list):
    """Return the Cita whose firma_asistencia_signing_token matches any recipient token."""
    from apps.agenda.models import Cita

    for recipient in recipients:
        token = (recipient.get("token") or "").strip()
        if token:
            cita = Cita.objects.filter(firma_asistencia_signing_token=token).first()
            if cita is not None:
                return cita
    return None


def _handle_firma_asistencia(external_id: str, event: str, document_id: str | None = None) -> None:
    from django.core.files.base import ContentFile

    from apps.agenda.models import Cita

    cita_id = external_id[len(_ASISTENCIA_PREFIX):]
    cita = Cita.objects.filter(id=cita_id).first()
    if cita is None:
        logger.warning("Webhook Documenso asistencia: cita no encontrada | cita_id=%s", cita_id)
        return

    if event in {"DOCUMENT_COMPLETED", "document.completed"}:
        nuevo_estado = "firmada"
    else:
        nuevo_estado = "rechazada"

    ya_procesado = cita.firma_asistencia_estado == nuevo_estado
    update_fields = ["firma_asistencia_estado", "updated_at"]
    cita.firma_asistencia_estado = nuevo_estado
    cita.save(update_fields=update_fields)
    logger.info(
        "Webhook Documenso asistencia: estado actualizado | cita_id=%s | estado=%s",
        cita_id,
        nuevo_estado,
    )

    # Reintento de un webhook ya procesado (comun en Documenso): no volver a
    # descargar/guardar el PDF, o cada reintento deja un archivo huerfano
    # nuevo en storage (AWS_S3_FILE_OVERWRITE=False).
    if nuevo_estado == "firmada" and document_id and not (ya_procesado and cita.firma_asistencia_archivo):
        pdf_bytes = descargar_pdf_documenso(str(document_id))
        if pdf_bytes:
            try:
                filename = f"asistencia-{cita_id}.pdf"
                cita.firma_asistencia_archivo.save(filename, ContentFile(pdf_bytes), save=False)
                cita.save(update_fields=["firma_asistencia_archivo", "updated_at"])
                logger.info(
                    "Webhook Documenso asistencia: PDF guardado | cita_id=%s | document_id=%s",
                    cita_id, document_id,
                )
            except Exception:
                logger.exception(
                    "No fue posible guardar el PDF de asistencia | cita_id=%s | document_id=%s",
                    cita_id, document_id,
                )
        else:
            logger.warning(
                "Webhook Documenso asistencia: PDF no disponible aún | cita_id=%s | document_id=%s",
                cita_id, document_id,
            )


def _handle_compromiso_pago(external_id: str, event: str, document_id: str | None = None) -> None:
    from apps.consentimientos.models import Consentimiento

    consentimiento_id = external_id[len(_COMPROMISO_PAGO_PREFIX):]
    consentimiento = Consentimiento.objects.filter(id=consentimiento_id).first()
    if consentimiento is None:
        logger.warning("Webhook Documenso compromiso_pago: consentimiento no encontrado | id=%s", consentimiento_id)
        return

    if event not in {"DOCUMENT_COMPLETED", "document.completed"}:
        # No hay estado de "rechazado" propio para Consentimiento; se deja pendiente.
        logger.info("Webhook Documenso compromiso_pago: evento no completado ignorado | id=%s | event=%s", consentimiento_id, event)
        return

    ya_firmado = consentimiento.estado == Consentimiento.Estado.FIRMADO
    if not ya_firmado:
        consentimiento.estado = Consentimiento.Estado.FIRMADO
        from django.utils import timezone as _timezone
        consentimiento.firmado_en = _timezone.now()
        consentimiento.save(update_fields=["estado", "firmado_en", "updated_at"])
        logger.info("Webhook Documenso compromiso_pago: estado actualizado a firmado | id=%s", consentimiento_id)
        # La cotizacion asociada pasa a aceptada automaticamente si la clinica
        # exige el compromiso de pago y aun estaba en borrador.
        try:
            from apps.cotizaciones.services import aceptar_cotizacion_por_firma_compromiso

            aceptar_cotizacion_por_firma_compromiso(consentimiento)
        except Exception:
            logger.exception(
                "Webhook Documenso compromiso_pago: fallo al aceptar cotizacion | id=%s",
                consentimiento_id,
            )

    # Reintento de un webhook ya procesado: no volver a descargar/guardar el
    # PDF, o cada reintento deja un archivo huerfano nuevo en storage
    # (AWS_S3_FILE_OVERWRITE=False).
    if document_id and not (ya_firmado and consentimiento.pdf_archivo):
        pdf_bytes = descargar_pdf_documenso(str(document_id))
        if pdf_bytes:
            try:
                from django.core.files.base import ContentFile
                filename = f"compromiso_pago-{consentimiento_id}.pdf"
                consentimiento.pdf_archivo.save(filename, ContentFile(pdf_bytes), save=False)
                consentimiento.save(update_fields=["pdf_archivo", "updated_at"])
                logger.info("Webhook Documenso compromiso_pago: PDF guardado | id=%s | document_id=%s", consentimiento_id, document_id)
            except Exception:
                logger.exception("No fue posible guardar el PDF de compromiso_pago | id=%s | document_id=%s", consentimiento_id, document_id)


class DocumensoWebhookView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        received_secret = request.headers.get("X-Documenso-Secret", "")
        expected_secret = settings.DOCUMENSO_WEBHOOK_SECRET or ""
        if not received_secret or not hmac.compare_digest(received_secret, expected_secret):
            logger.warning("Webhook Documenso rechazado por secret invalido")
            return Response({"error": "Unauthorized"}, status=401)

        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return Response({"error": "Invalid payload"}, status=400)

        event = body.get("event")
        payload = body.get("payload") or {}
        handled_events = {
            "DOCUMENT_COMPLETED", "document.completed",
            "DOCUMENT_DECLINED", "document.declined",
        }
        if event not in handled_events:
            return Response({"ok": True, "skipped": True}, status=200)

        external_id = payload.get("externalId")
        document_id = payload.get("id")
        if not external_id:
            # externalId is absent when the envelope was created via multipart upload
            # (Documenso ignores that field in /api/v2/envelope/create). Fall back to
            # matching the recipient signing token against firma_asistencia_signing_token.
            resolved = _resolve_asistencia_by_token(payload.get("recipients") or [])
            if resolved is not None:
                logger.info(
                    "Webhook Documenso: externalId ausente, cita resuelta por token | cita_id=%s",
                    resolved.id,
                )
                _handle_firma_asistencia(
                    f"{_ASISTENCIA_PREFIX}{resolved.id}",
                    event,
                    document_id=str(document_id) if document_id else None,
                )
            else:
                logger.warning("Webhook Documenso sin externalId | payload=%s", payload)
            return Response({"ok": True}, status=200)

        if external_id.startswith(_ASISTENCIA_PREFIX):
            _handle_firma_asistencia(external_id, event, document_id=str(document_id) if document_id else None)
            return Response({"ok": True}, status=200)

        if external_id.startswith(_COMPROMISO_PAGO_PREFIX):
            _handle_compromiso_pago(external_id, event, document_id=str(document_id) if document_id else None)
            return Response({"ok": True}, status=200)

        if event not in {"DOCUMENT_COMPLETED", "document.completed"}:
            return Response({"ok": True, "skipped": True}, status=200)

        consentimiento = ConsentimientoInformado.objects.filter(id=external_id).first()
        if consentimiento is None:
            logger.warning("Webhook Documenso con externalId no encontrado | external_id=%s", external_id)
            return Response({"ok": True}, status=200)

        marcar_consentimiento_firmado(
            consentimiento,
            documenso_document_id=str(document_id) if document_id is not None else None,
        )

        pdf_bytes = descargar_pdf_documenso(str(document_id)) if document_id is not None else None
        if pdf_bytes:
            try:
                guardar_pdf_firmado(
                    consentimiento,
                    pdf_bytes,
                    filename=f"consentimiento-documenso-{consentimiento.id}.pdf",
                )
            except Exception:
                logger.exception(
                    "No fue posible guardar el PDF firmado de Documenso | consentimiento_id=%s | document_id=%s",
                    consentimiento.id,
                    document_id,
                )

        return Response({"ok": True}, status=200)
