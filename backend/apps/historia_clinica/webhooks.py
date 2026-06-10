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
        if event not in {"DOCUMENT_COMPLETED", "document.completed"}:
            return Response({"ok": True, "skipped": True}, status=200)

        external_id = payload.get("externalId")
        document_id = payload.get("id")
        if not external_id:
            logger.warning("Webhook Documenso sin externalId | payload=%s", payload)
            return Response({"ok": True}, status=200)

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
