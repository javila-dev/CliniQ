"""Prueba de humo contra la instancia real de Documenso.

Crea un sobre de prueba con paciente + profesional provisional, firma los dos lados
(el profesional con imagen PNG, nombre y TP) y verifica que Documenso lo selle. Las
firmas del profesional usan rutas tRPC internas de Documenso: correr este comando
antes de actualizar la version de Documenso.

    python manage.py probar_firma_profesional_documenso [--conservar]
"""
import base64
import io
import time

from django.core.management.base import BaseCommand, CommandError

from apps.historia_clinica.documenso_firmantes import (
    FIRMANTE_PROFESIONAL,
    ROL_FIRMA,
    ROL_NOMBRE,
    ROL_TP,
    _trpc,
    crear_sobre_consentimiento,
    destinatario_firmo,
    document_id_numerico,
    email_profesional_provisional,
    firmar_como_profesional,
)
from apps.historia_clinica.services import DocumensoIntegrationError, _fetch_documenso_json


def _firma_png(texto: str) -> str:
    from PIL import Image, ImageDraw

    imagen = Image.new("RGBA", (600, 200), (255, 255, 255, 0))
    dibujo = ImageDraw.Draw(imagen)
    dibujo.line([(40, 120), (200, 60), (300, 130), (450, 50)], fill=(20, 20, 120, 255), width=4)
    dibujo.text((40, 160), texto, fill=(20, 20, 120, 255))
    buffer = io.BytesIO()
    imagen.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


class Command(BaseCommand):
    help = "Prueba de punta a punta de la firma diferida del profesional en Documenso."

    def add_arguments(self, parser):
        parser.add_argument("--conservar", action="store_true", help="No borrar el sobre de prueba al terminar.")

    def handle(self, *args, **options):
        from weasyprint import HTML

        referencia = f"prueba-{int(time.time())}"
        pdf = HTML(string=(
            "<html><body style='font-family:sans-serif;padding:40px'>"
            "<h1>PRUEBA CliniQ - firma del profesional (borrar)</h1>"
            "<p>Documento generado por probar_firma_profesional_documenso.</p>"
            "</body></html>"
        )).write_pdf()

        campos = [
            {"type": "SIGNATURE", "page": 1, "positionX": 10, "positionY": 60, "width": 35, "height": 8},
            {"firmante": FIRMANTE_PROFESIONAL, "rol": ROL_FIRMA, "page": 1, "positionX": 10, "positionY": 78, "width": 35, "height": 8},
            {"firmante": FIRMANTE_PROFESIONAL, "rol": ROL_NOMBRE, "page": 1, "positionX": 50, "positionY": 78, "width": 30, "height": 6},
            {"firmante": FIRMANTE_PROFESIONAL, "rol": ROL_TP, "page": 1, "positionX": 50, "positionY": 86, "width": 30, "height": 6},
        ]
        sobre = crear_sobre_consentimiento(
            pdf_bytes=pdf,
            nombre_archivo="prueba.pdf",
            titulo=f"PRUEBA CliniQ {referencia} (borrar)",
            paciente_nombre="Paciente Prueba",
            paciente_email=f"paciente-{referencia}@noreply.clinica",
            campos=campos,
            con_profesional=True,
            email_profesional=email_profesional_provisional(referencia),
        )
        envelope_id = sobre["envelope_id"]
        self.stdout.write(f"Sobre creado: {envelope_id}")

        try:
            envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
            campo_paciente = next(
                f for f in envelope["fields"] if str(f["recipientId"]) == sobre["recipient_paciente_id"]
            )
            _trpc(
                "envelope.field.sign",
                {"token": sobre["signing_token"], "fieldId": campo_paciente["id"],
                 "fieldValue": {"type": "SIGNATURE", "value": _firma_png("Paciente Prueba")}},
                ip=None, user_agent=None,
            )
            _trpc(
                "recipient.completeDocumentWithToken",
                {"token": sobre["signing_token"], "documentId": document_id_numerico(envelope)},
                ip=None, user_agent=None,
            )
            envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
            if not destinatario_firmo(envelope, sobre["recipient_paciente_id"]) or envelope.get("status") == "COMPLETED":
                raise CommandError("Tras la firma del paciente el sobre debia quedar pendiente del profesional.")
            self.stdout.write("Paciente firmado; sobre pendiente del profesional.")

            firmar_como_profesional(
                envelope_id=envelope_id,
                recipient_id=sobre["recipient_profesional_id"],
                nombre="Dra. Prueba CliniQ",
                email=f"dra-{referencia}@noreply.clinica",
                registro_profesional="TP-12345",
                firma_data_url=_firma_png("Dra. Prueba"),
                ip="203.0.113.10",
                user_agent="CliniQ-prueba/1.0 (navegador del profesional)",
            )

            for _ in range(20):
                envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
                if envelope.get("status") == "COMPLETED":
                    break
                time.sleep(3)
            if envelope.get("status") != "COMPLETED":
                raise CommandError(f"El sobre no quedo sellado (estado={envelope.get('status')}).")

            valores = {
                f["type"]: f.get("customText") for f in envelope["fields"]
                if str(f["recipientId"]) == sobre["recipient_profesional_id"]
            }
            if valores.get("TEXT") != "TP-12345" or valores.get("NAME") != "Dra. Prueba CliniQ":
                raise CommandError(f"Los campos del profesional no quedaron con los valores esperados: {valores}")
            self.stdout.write(self.style.SUCCESS(f"OK: sobre sellado con las dos firmas. Campos: {valores}"))
        except DocumensoIntegrationError as exc:
            raise CommandError(f"Fallo la integracion con Documenso: {exc}") from exc
        finally:
            if not options["conservar"]:
                _fetch_documenso_json("POST", "/api/v2/envelope/delete", json_payload={"envelopeId": envelope_id})
                self.stdout.write(f"Sobre de prueba borrado: {envelope_id}")
