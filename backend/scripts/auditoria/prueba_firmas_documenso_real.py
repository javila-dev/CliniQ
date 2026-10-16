"""Prueba contra Documenso real de la confirmación de firmas por API (16/10/2026).

Para cada firma (consentimiento con firma posterior del médico, compromiso de pago
y asistencia) crea el sobre real, llama a nuestro endpoint de confirmación ANTES
de firmar (debe responder 409), firma como paciente con el token de firma (las
mismas rutas tRPC que usa el embed) y vuelve a llamar (debe responder 200).

Todo lo de la base corre en una transacción que se deshace al final; los sobres
de Documenso se borran. Las claves se leen de un archivo .env pasado por
DOCUMENSO_ENV_FILE y nunca se imprimen.

    docker exec -e DOCUMENSO_ENV_FILE=/tmp/documenso.env cliniq_backend python scripts/auditoria/prueba_firmas_documenso_real.py
"""
import os
import sys
import time
from datetime import timedelta
from pathlib import Path

ENV = os.environ.get("DOCUMENSO_ENV_FILE")
if ENV:
    for linea in Path(ENV).read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea.startswith("DOCUMENSO") and "=" in linea:
            clave, valor = linea.split("=", 1)
            os.environ[clave.strip()] = valor.strip().strip('"').strip("'")

import django  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.historia_clinica.documenso_firmantes import (  # noqa: E402
    FIRMANTE_PROFESIONAL, ROL_FIRMA, ROL_NOMBRE, ROL_TP, _trpc, crear_sobre_consentimiento,
    document_id_numerico, email_profesional_provisional, firmar_como_profesional,
)
from apps.historia_clinica.services import _fetch_documenso_json  # noqa: E402

RESULTADOS = []
SOBRES = []


class Deshacer(Exception):
    pass


def paso(nombre, ok, detalle=""):
    RESULTADOS.append(ok)
    print(f"{'OK ' if ok else 'XX '} {nombre:70} {detalle}")


def sobre(envelope_id):
    return _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")


def firmar_como_paciente(envelope_id, signing_token, recipient_id=None):
    """Lo mismo que hace el embed: firmar el campo y completar con el token del paciente."""
    from apps.consentimientos.management.commands.probar_firma_profesional_documenso import _firma_png

    datos = sobre(envelope_id)
    if recipient_id is None:
        recipient_id = next(r["id"] for r in datos["recipients"] if r.get("token") == signing_token) \
            if any(r.get("token") for r in datos["recipients"]) else datos["recipients"][0]["id"]
    campo = next(f for f in datos["fields"] if str(f["recipientId"]) == str(recipient_id) and f["type"] == "SIGNATURE")
    _trpc("envelope.field.sign", {"token": signing_token, "fieldId": campo["id"],
          "fieldValue": {"type": "SIGNATURE", "value": _firma_png("Paciente Prueba")}}, ip=None, user_agent=None)
    _trpc("recipient.completeDocumentWithToken",
          {"token": signing_token, "documentId": document_id_numerico(datos)}, ip=None, user_agent=None)


def main():
    from weasyprint import HTML

    from apps.agenda.models import Cita
    from apps.consentimientos.models import Consentimiento
    from apps.consentimientos.services import generar_consentimiento
    from apps.cotizaciones.models import Cotizacion, ItemCotizacion
    from apps.historia_clinica.models import ConsentimientoInformado
    from apps.historia_clinica.services import paciente_firmo_en_envelope
    from apps.pacientes.models import Paciente
    from apps.users.models import User

    admin = User.objects.filter(rol="admin", clinica__isnull=False, activo=True).select_related("clinica").first()
    clinica = admin.clinica
    sede = clinica.sedes.filter(activo=True).first()
    client = APIClient(HTTP_HOST="localhost")
    client.force_authenticate(admin)
    cabeceras = {"HTTP_X_CLINICA_ID": str(clinica.id)}
    ref = f"prueba-{int(time.time())}"
    print(f"Clínica: {clinica.nombre} | referencia {ref}\n")

    paciente = Paciente.objects.create(
        clinica=clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento=f"PF{int(time.time())}",
        nombres="Paciente", apellidos="Prueba Firmas", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
        sexo=Paciente.Sexo.FEMENINO, direccion="Calle 1", telefono="3000000000",
        email=f"paciente-{ref}@noreply.clinica", canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
        autoriza_datos=True,
    )

    # ── 1. Consentimiento con firma posterior del médico ──────────────────
    pdf = HTML(string="<html><body style='padding:40px'><h1>PRUEBA CliniQ (borrar)</h1></body></html>").write_pdf()
    campos = [
        {"type": "SIGNATURE", "page": 1, "positionX": 10, "positionY": 60, "width": 35, "height": 8},
        {"firmante": FIRMANTE_PROFESIONAL, "rol": ROL_FIRMA, "page": 1, "positionX": 10, "positionY": 78, "width": 35, "height": 8},
        {"firmante": FIRMANTE_PROFESIONAL, "rol": ROL_NOMBRE, "page": 1, "positionX": 50, "positionY": 78, "width": 30, "height": 6},
        {"firmante": FIRMANTE_PROFESIONAL, "rol": ROL_TP, "page": 1, "positionX": 50, "positionY": 86, "width": 30, "height": 6},
    ]
    s = crear_sobre_consentimiento(
        pdf_bytes=pdf, nombre_archivo="prueba.pdf", titulo=f"PRUEBA CliniQ {ref} consentimiento (borrar)",
        paciente_nombre=paciente.nombre_completo, paciente_email=paciente.email, campos=campos,
        con_profesional=True, email_profesional=email_profesional_provisional(ref),
    )
    SOBRES.append(s["envelope_id"])
    ci = ConsentimientoInformado.objects.create(
        paciente=paciente, clinica=clinica, tipo="general", documenso_document_id=s["envelope_id"],
        documenso_signing_token=s["signing_token"], requiere_firma_profesional=True,
        documenso_recipient_paciente_id=s["recipient_paciente_id"],
        documenso_recipient_profesional_id=s["recipient_profesional_id"],
    )
    url = f"/api/v1/historia-clinica/consentimientos/{ci.id}/completar_firma/"
    r = client.patch(url, {"documenso_document_id": s["envelope_id"]}, format="json", **cabeceras)
    paso("consentimiento: antes de firmar, confirmar responde 409", r.status_code == 409, f"status={r.status_code}")

    firmar_como_paciente(s["envelope_id"], s["signing_token"], s["recipient_paciente_id"])
    estado_sobre = sobre(s["envelope_id"]).get("status")
    r = client.patch(url, {"documenso_document_id": s["envelope_id"]}, format="json", **cabeceras)
    ci.refresh_from_db()
    paso("consentimiento: firmó el paciente, el sobre sigue abierto por el médico",
         estado_sobre != "COMPLETED", f"estado del sobre={estado_sobre}")
    paso("consentimiento: confirmar responde 200 sin esperar al médico",
         r.status_code == 200 and ci.firmado and ci.pendiente_firma_profesional,
         f"status={r.status_code} firmado={ci.firmado} pendiente_medico={ci.pendiente_firma_profesional}")

    viejo = ConsentimientoInformado(**{**{f.attname: getattr(ci, f.attname) for f in ci._meta.concrete_fields},
                                       "documenso_recipient_paciente_id": ""})
    paso("consentimiento: registro viejo sin id del paciente también se confirma",
         paciente_firmo_en_envelope(viejo, sobre(s["envelope_id"])))

    firmar_como_profesional(
        envelope_id=s["envelope_id"], recipient_id=s["recipient_profesional_id"], nombre="Dra. Prueba CliniQ",
        email=f"dra-{ref}@noreply.clinica", registro_profesional="TP-12345",
        firma_data_url=__import__(
            "apps.consentimientos.management.commands.probar_firma_profesional_documenso", fromlist=["_firma_png"],
        )._firma_png("Dra. Prueba"),
        ip="203.0.113.10", user_agent="CliniQ-prueba/1.0",
    )
    for _ in range(20):
        estado_sobre = sobre(s["envelope_id"]).get("status")
        if estado_sobre == "COMPLETED":
            break
        time.sleep(3)
    paso("consentimiento: tras la firma del médico el sobre queda sellado", estado_sobre == "COMPLETED",
         f"estado del sobre={estado_sobre}")

    # ── 2. Compromiso de pago ─────────────────────────────────────────────
    from apps.clinicas.models import FormaDePago, Servicio
    from apps.consentimientos.services import iniciar_firma_compromiso_pago_documenso
    from apps.cotizaciones.models import FormaPagoCotizacion

    servicio = Servicio.objects.filter(clinica=clinica, activo=True).first()
    cot = Cotizacion.objects.create(clinica=clinica, paciente=paciente, sede=sede, profesional=admin,
                                    estado=Cotizacion.Estado.BORRADOR)
    ItemCotizacion.objects.create(cotizacion=cot, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=servicio,
                                  descripcion="Prueba", num_citas=1, valor_unitario="100000")
    FormaPagoCotizacion.objects.create(cotizacion=cot, tipo=FormaDePago.objects.filter(clinica=clinica).first(),
                                       valor="100000")
    compromiso = generar_consentimiento(cotizacion=cot, plantilla=None)
    iniciar_firma_compromiso_pago_documenso(compromiso)
    compromiso.refresh_from_db()
    SOBRES.append(compromiso.documenso_documento_id)
    url = f"/api/v1/consentimientos/{compromiso.id}/confirmar_firma_documenso/"
    r = client.post(url, {}, format="json", **cabeceras)
    compromiso.refresh_from_db()
    paso("compromiso: antes de firmar, confirmar responde 409 y no se marca",
         r.status_code == 409 and compromiso.estado == Consentimiento.Estado.PENDIENTE,
         f"status={r.status_code} estado={compromiso.estado}")
    firmar_como_paciente(compromiso.documenso_documento_id, compromiso.documenso_signing_token)
    r = client.post(url, {}, format="json", **cabeceras)
    compromiso.refresh_from_db()
    paso("compromiso: tras firmar, confirmar responde 200 y queda firmado",
         r.status_code == 200 and compromiso.estado == Consentimiento.Estado.FIRMADO,
         f"status={r.status_code} estado={compromiso.estado}")

    # ── 3. Registro de asistencia ─────────────────────────────────────────
    from apps.consentimientos.services import iniciar_registro_asistencia_documenso

    inicio = timezone.now() + timedelta(minutes=30)
    cita = Cita.objects.create(
        paciente=paciente, sede=sede, profesional=admin, servicio_nombre="Prueba firmas", fecha_inicio=inicio,
        fecha_fin=inicio + timedelta(minutes=30), duracion_min=30, estado=Cita.Estado.CONFIRMADA,
        canal_confirmacion=paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
    )
    iniciar_registro_asistencia_documenso(cita)
    cita.refresh_from_db()
    SOBRES.append(cita.firma_asistencia_documento_id)
    url = f"/api/v1/agenda/citas/{cita.id}/confirmar_firma_asistencia/"
    r = client.post(url, {}, format="json", **cabeceras)
    cita.refresh_from_db()
    paso("asistencia: antes de firmar, confirmar responde 409 y no se marca",
         r.status_code == 409 and cita.firma_asistencia_estado != "firmada",
         f"status={r.status_code} estado={cita.firma_asistencia_estado}")
    firmar_como_paciente(cita.firma_asistencia_documento_id, cita.firma_asistencia_signing_token)
    r = client.post(url, {}, format="json", **cabeceras)
    cita.refresh_from_db()
    paso("asistencia: tras firmar, confirmar responde 200 y queda firmada",
         r.status_code == 200 and cita.firma_asistencia_estado == "firmada",
         f"status={r.status_code} estado={cita.firma_asistencia_estado}")


try:
    with transaction.atomic():
        try:
            main()
        except Exception as exc:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            paso("la prueba terminó por un error", False, str(exc)[:200])
        raise Deshacer()
except Deshacer:
    pass
finally:
    for envelope_id in SOBRES:
        if not envelope_id:
            continue
        try:
            _fetch_documenso_json("POST", "/api/v2/envelope/delete", json_payload={"envelopeId": envelope_id})
            print(f"Sobre borrado en Documenso: {envelope_id}")
        except Exception as exc:  # noqa: BLE001
            print(f"No se pudo borrar el sobre {envelope_id}: {exc}")

print(f"\n{len(RESULTADOS)} chequeos, {RESULTADOS.count(False)} fallidos. Base de datos sin cambios (transacción deshecha).")
