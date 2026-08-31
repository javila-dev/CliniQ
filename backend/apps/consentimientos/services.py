import hashlib
import json
import logging
from datetime import timedelta

import requests as _requests
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.files.base import ContentFile
from django.template import Context, Template
from django.utils import timezone
from weasyprint import HTML

from apps.core.storage import _s3_client, get_public_url
from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento


def _build_logo_url(clinica) -> str | None:
    if not clinica or not clinica.logo:
        return None
    return get_public_url(clinica.logo.name, internal=True)


def renderizar_template_con_datos(cita, plantilla: PlantillaConsentimiento) -> str:
    template = Template(plantilla.contenido_html)
    context = Context(
        {
            "paciente": cita.paciente,
            "cita": cita,
            "servicio": cita.servicio,
            "profesional": cita.profesional,
            "clinica": cita.sede.clinica,
            "sede": cita.sede,
        }
    )
    return template.render(context)


def _contexto_merge_cotizacion(cotizacion) -> dict:
    """
    Contexto de merge fields compartido por las plantillas con ambito=COTIZACION
    y por el documento estandar de compromiso de pago. La cartera puede no
    existir aun si se genera antes de aceptar la cotizacion.
    """
    cartera = getattr(cotizacion, "cartera", None)
    cuotas = list(cartera.cuotas.order_by("fecha_esperada")) if cartera else []
    costo_total = cotizacion.total
    abono_inicial = cuotas[0].valor_esperado if cuotas else None
    # Saldo del COMPROMISO (total - abono acordado), no el saldo ya pagado en
    # tiempo real: este documento se genera al aceptar la cotizacion, antes de
    # que se registre ningun cobro, asi que cartera.saldo_pendiente siempre
    # seria igual al total.
    saldo_compromiso = (costo_total - abono_inicial) if abono_inicial is not None else costo_total

    return {
        "paciente": cotizacion.paciente,
        "cotizacion": cotizacion,
        "clinica": cotizacion.clinica,
        "sede": cotizacion.sede,
        "cartera": cartera,
        "cuotas": cuotas,
        "costo_total": costo_total,
        "abono_inicial": abono_inicial,
        "saldo_pendiente": saldo_compromiso,
        "fecha_generacion": timezone.localdate(),
    }


def renderizar_template_cotizacion_con_datos(cotizacion, plantilla: PlantillaConsentimiento) -> str:
    """
    Renderiza una plantilla con ambito=COTIZACION redactada por la clinica
    (ej. consentimiento de compra promocional por servicio) con los datos de
    la cotizacion.
    """
    template = Template(plantilla.contenido_html)
    return template.render(Context(_contexto_merge_cotizacion(cotizacion)))


COMPROMISO_PAGO_ESTANDAR_TEMPLATE = "consentimientos/compromiso_pago_estandar.html"


def renderizar_compromiso_pago_estandar(cotizacion) -> str:
    """
    Cuerpo estandar (no configurable) del compromiso de pago. La clinica solo
    activa o desactiva el requisito en ConfiguracionCartera; el texto es fijo,
    igual que el registro de asistencia.
    """
    from django.template.loader import render_to_string

    return render_to_string(COMPROMISO_PAGO_ESTANDAR_TEMPLATE, _contexto_merge_cotizacion(cotizacion))


def generar_pdf_consentimiento(consentimiento: Consentimiento) -> bytes:
    pie = (
        f"<hr><small>Paciente: {consentimiento.paciente.nombre_completo} | "
        f"Documento: {consentimiento.paciente.tipo_documento} {consentimiento.paciente.numero_documento} | "
        f"Fecha firma: {consentimiento.firmado_en or ''} | IP: {consentimiento.firma_ip or ''} | "
        f"Hash: {consentimiento.hash_contenido}</small>"
    )
    html = f"{consentimiento.contenido_snapshot}{pie}"
    return HTML(string=html).write_pdf()


def generar_pdf_para_firma_documenso(consentimiento: Consentimiento) -> bytes:
    """
    Renderiza el PDF de firma reutilizando el mismo sistema visual que el
    registro de asistencia (header con logo de la clinica, secciones, area de
    firma con marcadores invisibles) — el contenido_snapshot que redacto la
    clinica en su plantilla se inserta dentro de una seccion propia.
    """
    from django.template.loader import render_to_string

    if consentimiento.cotizacion_id:
        clinica = consentimiento.cotizacion.clinica
        doc_ref = f"#COMP-{str(consentimiento.cotizacion_id)[:8].upper()}"
    else:
        clinica = consentimiento.cita.sede.clinica
        doc_ref = f"#CONS-{str(consentimiento.id)[:8].upper()}"

    now = timezone.localtime(timezone.now())
    context = {
        "clinica": clinica,
        "logo_url": _build_logo_url(clinica),
        "doc_title": (
            consentimiento.plantilla.nombre
            if consentimiento.plantilla_id and consentimiento.plantilla.nombre
            else ("Compromiso de pago" if consentimiento.cotizacion_id else "Consentimiento")
        ),
        "doc_ref": doc_ref,
        "paciente": consentimiento.paciente,
        "documento_paciente": f"{consentimiento.paciente.tipo_documento} {consentimiento.paciente.numero_documento}",
        "contenido_snapshot": consentimiento.contenido_snapshot,
        "fecha_generacion": now.strftime("%d/%m/%Y"),
        "generado_en": now.strftime("%d/%m/%Y · %I:%M %p"),
    }
    html = render_to_string("consentimientos/pdf_firma_documenso.html", context)
    return HTML(string=html, base_url="/").write_pdf()


def iniciar_firma_compromiso_pago_documenso(consentimiento: Consentimiento) -> dict:
    """
    Crea (o recupera, de forma idempotente) el envelope de Documenso para que
    el paciente firme el compromiso de pago. Mismo patron que
    agenda.services.iniciar_registro_asistencia_documenso.
    """
    from apps.agenda.pdf_coords import extraer_coordenadas_firma
    from apps.historia_clinica.services import (
        DocumensoIntegrationError,
        _buscar_signatario,
        _extraer_signing_token,
        _fetch_documenso_json,
        _obtener_email_destinatario,
        obtener_signing_token_documento,
    )

    if consentimiento.estado != Consentimiento.Estado.PENDIENTE:
        raise ValueError("El consentimiento ya no esta pendiente de firma.")

    # Ya existe envelope y token — idempotente.
    if consentimiento.documenso_documento_id and consentimiento.documenso_signing_token:
        return {
            "signing_token": consentimiento.documenso_signing_token,
            "document_id": consentimiento.documenso_documento_id,
        }

    recipient_email = _obtener_email_destinatario(consentimiento)

    # Envelope existe pero falta el token — recuperarlo de Documenso.
    if consentimiento.documenso_documento_id and not consentimiento.documenso_signing_token:
        signing_token = obtener_signing_token_documento(
            consentimiento.documenso_documento_id,
            recipient_email=recipient_email,
        )
        if not signing_token:
            raise DocumensoIntegrationError("Error al recuperar el token de firma en Documenso.")
        consentimiento.documenso_signing_token = signing_token
        consentimiento.save(update_fields=["documenso_signing_token", "updated_at"])
        return {"signing_token": signing_token, "document_id": consentimiento.documenso_documento_id}

    # Crear nuevo envelope.
    pdf_bytes = generar_pdf_para_firma_documenso(consentimiento)
    coords = extraer_coordenadas_firma(pdf_bytes)
    nombre_archivo = f"compromiso_pago_{str(consentimiento.id)[:8].upper()}.pdf"

    envelope_id = _crear_envelope_documenso(
        pdf_bytes, nombre_archivo, consentimiento.paciente.nombre_completo, recipient_email, coords,
        external_id=f"compromiso_pago:{consentimiento.id}",
    )

    distribute_payload = _fetch_documenso_json(
        "POST", "/api/v2/envelope/distribute", json_payload={"envelopeId": envelope_id},
    )
    recipients = distribute_payload.get("recipients") or []
    recipient = _buscar_signatario(recipients, email=recipient_email)
    signing_token = _extraer_signing_token(recipient or {})

    consentimiento.documenso_documento_id = str(envelope_id)
    consentimiento.documenso_signing_token = signing_token or ""
    consentimiento.save(update_fields=["documenso_documento_id", "documenso_signing_token", "updated_at"])

    return {"signing_token": signing_token or "", "document_id": str(envelope_id)}


def _documento_tipo_consentimiento(consentimiento: Consentimiento) -> str:
    if consentimiento.plantilla_id:
        return consentimiento.plantilla.nombre
    if consentimiento.cotizacion_id:
        return "compromiso de pago"
    return "consentimiento"


def enviar_link_firma_consentimiento(consentimiento: Consentimiento) -> dict:
    """Genera (o recupera) el envelope de Documenso y envia el enlace de firma
    al paciente por WhatsApp via n8n (rama generica `firma_documento`). Si el
    paciente no tiene telefono, no envia nada y solo devuelve el link para copiar.
    Sirve para compromiso de pago y para cualquier consentimiento con flujo
    Documenso."""
    from apps.historia_clinica.services import DocumensoIntegrationError, url_firma_documenso
    from apps.notificaciones.services import enviar_link_firma_whatsapp

    result = iniciar_firma_compromiso_pago_documenso(consentimiento)
    signing_token = result.get("signing_token") or ""
    signing_url = url_firma_documenso(signing_token)
    if not signing_url:
        raise DocumensoIntegrationError("No se pudo obtener el enlace de firma de Documenso.")

    paciente = consentimiento.paciente
    telefono = (paciente.telefono or "").strip()
    enviado = False

    if telefono:
        try:
            enviar_link_firma_whatsapp(
                paciente=paciente,
                documento_tipo=_documento_tipo_consentimiento(consentimiento),
                link=signing_url,
                metadata={
                    "consentimiento_id": str(consentimiento.id),
                    "cotizacion_id": str(consentimiento.cotizacion_id) if consentimiento.cotizacion_id else "",
                    "cita_id": str(consentimiento.cita_id) if consentimiento.cita_id else "",
                },
            )
            enviado = True
        except ValueError:
            # Webhook no configurado: devolvemos el link igual para copiar.
            logger.warning("[enviar_link_firma_consentimiento] webhook no configurado | consentimiento_id=%s", consentimiento.id)

    return {"enviado": enviado, "signing_url": signing_url, "telefono": telefono}


def confirmar_firma_compromiso_pago(consentimiento: Consentimiento) -> Consentimiento:
    """Confirmacion eager disparada por el frontend al completar el embed de firma."""
    if consentimiento.estado != Consentimiento.Estado.FIRMADO:
        consentimiento.estado = Consentimiento.Estado.FIRMADO
        consentimiento.firmado_en = timezone.now()
        consentimiento.save(update_fields=["estado", "firmado_en", "updated_at"])
    if not consentimiento.pdf_archivo:
        try:
            recuperar_pdf_compromiso_pago(consentimiento)
        except Exception:
            logger.exception(
                "[confirmar_firma_compromiso_pago] fallo al recuperar PDF | consentimiento_id=%s",
                consentimiento.id,
            )
    _auto_aceptar_cotizacion(consentimiento)
    return consentimiento


def _auto_aceptar_cotizacion(consentimiento: Consentimiento) -> None:
    """Si el compromiso de pago quedo firmado, deja que cotizaciones decida si
    su cotizacion debe pasar a aceptada automaticamente."""
    try:
        from apps.cotizaciones.services import aceptar_cotizacion_por_firma_compromiso

        aceptar_cotizacion_por_firma_compromiso(consentimiento)
    except Exception:
        logger.exception(
            "[_auto_aceptar_cotizacion] fallo al aceptar cotizacion por firma | consentimiento_id=%s",
            consentimiento.id,
        )


def asegurar_bucket_consentimientos():
    if not settings.MINIO_PRIVATE_BUCKET or not settings.MINIO_ENDPOINT:
        return
    client = _s3_client()
    try:
        client.head_bucket(Bucket=settings.MINIO_PRIVATE_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.MINIO_PRIVATE_BUCKET)


def generar_consentimiento(cita=None, plantilla: PlantillaConsentimiento = None, *, cotizacion=None) -> Consentimiento:
    if bool(cita) == bool(cotizacion):
        raise ValueError("Debes indicar exactamente uno: cita o cotizacion.")

    if cotizacion is not None:
        if plantilla is not None:
            contenido_snapshot = renderizar_template_cotizacion_con_datos(cotizacion, plantilla)
        else:
            contenido_snapshot = renderizar_compromiso_pago_estandar(cotizacion)
        paciente = cotizacion.paciente
    else:
        contenido_snapshot = renderizar_template_con_datos(cita, plantilla)
        paciente = cita.paciente

    hash_contenido = hashlib.sha256(contenido_snapshot.encode("utf-8")).hexdigest()
    return Consentimiento.objects.create(
        cita=cita,
        cotizacion=cotizacion,
        paciente=paciente,
        plantilla=plantilla,
        contenido_snapshot=contenido_snapshot,
        hash_contenido=hash_contenido,
        token_expira=timezone.now() + timedelta(hours=48),
    )


def firmar_consentimiento(token, ip, user_agent) -> Consentimiento:
    consentimiento = Consentimiento.objects.select_related("paciente", "cita", "plantilla").get(token=token)
    if consentimiento.estado != Consentimiento.Estado.PENDIENTE:
        raise ValueError("El consentimiento ya no está pendiente de firma.")
    if not consentimiento.token_vigente:
        raise ValueError("El token de firma ya expiró.")

    consentimiento.estado = Consentimiento.Estado.FIRMADO
    consentimiento.firmado_en = timezone.now()
    consentimiento.firma_ip = ip
    consentimiento.firma_user_agent = user_agent or ""
    pdf_bytes = generar_pdf_consentimiento(consentimiento)
    asegurar_bucket_consentimientos()
    filename = f"consentimiento-{consentimiento.id}.pdf"
    consentimiento.pdf_archivo.save(filename, ContentFile(pdf_bytes), save=False)
    consentimiento.save()
    return consentimiento


logger = logging.getLogger(__name__)


def enviar_firma_asistencia_cita(cita, plantilla) -> dict:
    from apps.historia_clinica.services import (
        DocumensoIntegrationError,
        _buscar_signatario,
        _fetch_documenso_json,
        _obtener_email_destinatario,
        _resolver_template_documenso,
    )
    from django.conf import settings

    template_token = (plantilla.documenso_template_token or "").strip()
    if not template_token:
        raise DocumensoIntegrationError("La plantilla de asistencia no tiene un token de Documenso configurado.")

    class _FakeConsentimiento:
        paciente = cita.paciente

    fake = _FakeConsentimiento()
    recipient_email = _obtener_email_destinatario(fake)

    template, signer = _resolver_template_documenso(template_token)
    payload = _fetch_documenso_json(
        "POST",
        "/api/v2/template/use",
        json_payload={
            "templateId": template["id"],
            "recipients": [
                {
                    "id": signer["id"],
                    "email": recipient_email,
                    "name": cita.paciente.nombre_completo,
                }
            ],
            "distributeDocument": True,
            "externalId": f"asistencia:{cita.id}",
        },
    )

    document_id = payload.get("id")
    recipient = _buscar_signatario(
        payload.get("recipients") or [],
        template_recipient_id=signer["id"],
        email=recipient_email,
    )
    signing_url = (
        (recipient or {}).get("signingUrl")
        or (recipient or {}).get("signing_url")
    )
    if not signing_url and document_id and getattr(settings, "DOCUMENSO_API_URL", None):
        from apps.historia_clinica.services import _extraer_signing_token
        token = _extraer_signing_token(recipient or {})
        if token:
            signing_url = f"{settings.DOCUMENSO_API_URL.rstrip('/')}/sign/{token}"

    if not document_id:
        logger.error(
            "enviar_firma_asistencia | Documenso no devolvio document_id | cita_id=%s | response_keys=%s",
            cita.id,
            sorted(payload.keys()),
        )
        raise DocumensoIntegrationError("Error al crear el documento de firma de asistencia en Documenso.")

    cita.firma_asistencia_documento_id = str(document_id)
    cita.firma_asistencia_estado = "enviada"
    cita.save(update_fields=["firma_asistencia_documento_id", "firma_asistencia_estado", "updated_at"])

    logger.info(
        "enviar_firma_asistencia | ok | cita_id=%s | document_id=%s",
        cita.id,
        document_id,
    )
    return {"documento_id": str(document_id), "documento_url": signing_url or ""}


def _crear_envelope_documenso(
    pdf_bytes: bytes, nombre: str, recipient_name: str, recipient_email: str, coords: dict,
    *, external_id: str | None = None,
) -> str:
    """Crea un envelope v2 con el PDF embebido en el propio request (sin S3)."""
    from apps.historia_clinica.services import DocumensoIntegrationError, _documenso_api_key

    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY:
        raise DocumensoIntegrationError("La integracion con Documenso no esta configurada.")

    base = settings.DOCUMENSO_API_URL.rstrip("/")
    url = f"{base}/api/v2/envelope/create"
    payload = {
        "type": "DOCUMENT",
        "title": nombre,
        "recipients": [
            {
                "email": recipient_email,
                "name": recipient_name,
                "role": "SIGNER",
                "fields": [
                    {
                        "identifier": 0,
                        "type": "SIGNATURE",
                        "page": coords["pageNumber"],
                        "positionX": coords["pageX"],
                        "positionY": coords["pageY"],
                        "width": coords["pageWidth"],
                        "height": coords["pageHeight"],
                    }
                ],
            }
        ],
    }
    if external_id:
        payload["externalId"] = external_id
    logger.debug("[crear_envelope_documenso] POST %s | filename=%s | size=%d bytes | payload=%s", url, nombre, len(pdf_bytes), payload)
    try:
        resp = _requests.post(
            url,
            headers={"Authorization": _documenso_api_key()},
            data={"payload": json.dumps(payload)},
            files={"files": (nombre, pdf_bytes, "application/pdf")},
            timeout=30,
        )
        logger.debug("[crear_envelope_documenso] response | status=%s | body=%s", resp.status_code, resp.text[:1000])
        resp.raise_for_status()
    except _requests.RequestException as exc:
        body = getattr(getattr(exc, "response", None), "text", "")[:1000]
        logger.error("[crear_envelope_documenso] error | url=%s | exc=%s | body=%s", url, exc, body)
        raise

    data = resp.json()
    envelope_id = data.get("id")
    logger.debug("[crear_envelope_documenso] envelope_id=%s", envelope_id)
    if not envelope_id:
        raise DocumensoIntegrationError("Documenso no devolvio id de envelope al crear el documento.")
    return envelope_id


def iniciar_registro_asistencia_documenso(cita) -> dict:
    from apps.agenda.pdf import render_registro_asistencia_pdf
    from apps.agenda.pdf_coords import extraer_coordenadas_firma
    from apps.historia_clinica.services import (
        DocumensoIntegrationError,
        _buscar_signatario,
        _extraer_signing_token,
        _fetch_documenso_json,
        _obtener_email_destinatario,
        obtener_signing_token_documento,
    )

    class _FakePaciente:
        paciente = cita.paciente

    logger.debug(
        "[iniciar_registro_asistencia] cita_id=%s | paciente_id=%s | doc_id=%s | token_guardado=%s",
        cita.id, cita.paciente_id, cita.firma_asistencia_documento_id,
        bool(cita.firma_asistencia_signing_token),
    )

    # Rama 1: ya existe envelope y token — idempotente, devolver directamente
    if cita.firma_asistencia_documento_id and cita.firma_asistencia_signing_token:
        logger.info(
            "[iniciar_registro_asistencia] rama=ya_completo | cita_id=%s | doc_id=%s",
            cita.id, cita.firma_asistencia_documento_id,
        )
        return {
            "signing_token": cita.firma_asistencia_signing_token,
            "document_id": cita.firma_asistencia_documento_id,
        }

    recipient_email = _obtener_email_destinatario(_FakePaciente())

    # Rama 2: envelope existe pero falta el token — recuperarlo de Documenso
    if cita.firma_asistencia_documento_id and not cita.firma_asistencia_signing_token:
        logger.info(
            "[iniciar_registro_asistencia] rama=recuperar_token | cita_id=%s | doc_id=%s",
            cita.id, cita.firma_asistencia_documento_id,
        )
        signing_token = obtener_signing_token_documento(
            cita.firma_asistencia_documento_id,
            recipient_email=recipient_email,
        )
        if not signing_token:
            logger.error(
                "[iniciar_registro_asistencia] rama=recuperar_token | token_no_encontrado | doc_id=%s",
                cita.firma_asistencia_documento_id,
            )
            raise DocumensoIntegrationError("Error al crear el documento en Documenso.")
        cita.firma_asistencia_signing_token = signing_token
        cita.save(update_fields=["firma_asistencia_signing_token", "updated_at"])
        logger.info(
            "[iniciar_registro_asistencia] rama=recuperar_token | ok | cita_id=%s",
            cita.id,
        )
        return {"signing_token": signing_token, "document_id": cita.firma_asistencia_documento_id}

    # Rama 3: crear nuevo envelope en Documenso
    pdf_bytes = render_registro_asistencia_pdf(cita)
    logger.debug("[iniciar_registro_asistencia] pdf generado | size=%d bytes", len(pdf_bytes))

    coords = extraer_coordenadas_firma(pdf_bytes)
    logger.debug("[iniciar_registro_asistencia] coords=%s", coords)

    logger.debug("[iniciar_registro_asistencia] recipient_email=%s", recipient_email)

    nombre_archivo = f"registro_asistencia_{str(cita.id)[:8].upper()}.pdf"
    try:
        envelope_id = _crear_envelope_documenso(
            pdf_bytes, nombre_archivo, cita.paciente.nombre_completo, recipient_email, coords,
            external_id=f"asistencia:{cita.id}",
        )
    except _requests.RequestException as exc:
        logger.error("[iniciar_registro_asistencia] fallo crear envelope | exc=%s", exc)
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.") from exc
    logger.debug("[iniciar_registro_asistencia] envelope creado | envelope_id=%s", envelope_id)

    distribute_payload = _fetch_documenso_json(
        "POST",
        "/api/v2/envelope/distribute",
        json_payload={"envelopeId": envelope_id},
    )
    recipients = distribute_payload.get("recipients") or []
    logger.debug(
        "[iniciar_registro_asistencia] distribute | recipients_count=%d | recipient_keys=%s",
        len(recipients), [list(r.keys()) for r in recipients[:2]],
    )

    recipient = _buscar_signatario(recipients, email=recipient_email)
    signing_token = _extraer_signing_token(recipient or {})
    logger.debug("[iniciar_registro_asistencia] signing_token_found=%s", bool(signing_token))

    cita.firma_asistencia_documento_id = str(envelope_id)
    cita.firma_asistencia_signing_token = signing_token or ""
    cita.firma_asistencia_estado = "enviada"
    cita.save(update_fields=[
        "firma_asistencia_documento_id",
        "firma_asistencia_signing_token",
        "firma_asistencia_estado",
        "updated_at",
    ])

    logger.info(
        "iniciar_registro_asistencia | ok | cita_id=%s | document_id=%s",
        cita.id,
        envelope_id,
    )
    return {"signing_token": signing_token or "", "document_id": str(envelope_id)}


def iniciar_firma_consentimiento_desde_plantilla(consentimiento) -> tuple[str, str]:
    """Crea envelope en Documenso usando el PDF y campos mapeados en la plantilla self-service.

    Flujo:
    1. POST /envelope/create (multipart, sin campos) → envelopeId
    2. POST /envelope/recipient/create-many → recipientId
    3. GET /envelope/{id} → envelopeItemId (PDF procesado)
    4. POST /envelope/field/create-many → campos con posición
    5. POST /envelope/distribute → signing token
    """
    import json as _json

    from apps.historia_clinica.services import (
        DocumensoIntegrationError,
        _buscar_signatario,
        _documenso_api_key,
        _extraer_signing_token,
        _fetch_documenso_json,
        _obtener_email_destinatario,
    )

    plantilla = consentimiento.plantilla
    if not plantilla or not plantilla.pdf_file:
        raise DocumensoIntegrationError("La plantilla no tiene un PDF configurado.")

    campos = plantilla.campos or []
    if not campos:
        raise DocumensoIntegrationError("La plantilla no tiene campos configurados. Abre el mapeador y define al menos un campo de firma.")

    pdf_bytes = plantilla.pdf_file.read()
    logger.info("[firma_desde_plantilla] pdf_size=%d | plantilla_id=%s", len(pdf_bytes), plantilla.id)
    if not pdf_bytes:
        raise DocumensoIntegrationError("El archivo PDF de la plantilla está vacío o no se pudo leer.")

    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY:
        raise DocumensoIntegrationError("La integración con Documenso no está configurada.")

    recipient_email = _obtener_email_destinatario(consentimiento)
    nombre_paciente = consentimiento.paciente.nombre_completo
    base = settings.DOCUMENSO_API_URL.rstrip("/")
    auth = _documenso_api_key()

    # ── Paso 1: crear envelope con PDF + recipient, sin campos ────────────
    # Incluir el recipient inline en create (como asistencia) para evitar endpoint separado.
    nombre_archivo = f"consentimiento_{str(consentimiento.id)[:8]}.pdf"
    create_payload = {
        "type": "DOCUMENT",
        "title": plantilla.nombre or "Consentimiento Informado",
        "recipients": [
            {"email": recipient_email, "name": nombre_paciente, "role": "SIGNER", "fields": []}
        ],
    }
    try:
        resp = _requests.post(
            f"{base}/api/v2/envelope/create",
            headers={"Authorization": auth},
            data={"payload": _json.dumps(create_payload)},
            files={"files": (nombre_archivo, pdf_bytes, "application/pdf")},
            timeout=30,
        )
        logger.info("[firma_desde_plantilla] create | status=%s | body=%s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
    except _requests.RequestException as exc:
        body = getattr(getattr(exc, "response", None), "text", "")[:500]
        logger.error("[firma_desde_plantilla] error crear envelope | exc=%s | body=%s", exc, body)
        raise DocumensoIntegrationError("Error al crear el documento en Documenso.") from exc

    create_data = resp.json()
    envelope_id = create_data.get("id")
    if not envelope_id:
        raise DocumensoIntegrationError("Documenso no devolvió id de envelope.")

    # Extraer recipient_id del response del create
    recipients_in_create = create_data.get("recipients") or []
    recipient_id = recipients_in_create[0].get("id") if recipients_in_create else None
    logger.info("[firma_desde_plantilla] envelope_id=%s | recipient_id=%s", envelope_id, recipient_id)

    # ── Paso 2: GET envelope → envelopeItemId + recipient_id si faltó ────
    envelope_detail = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    logger.info("[firma_desde_plantilla] envelope_detail keys=%s", list(envelope_detail.keys()))
    items = envelope_detail.get("envelopeItems") or envelope_detail.get("items") or []
    envelope_item_id = items[0].get("id") if items else None
    if not recipient_id:
        detail_recipients = envelope_detail.get("recipients") or []
        recipient_id = detail_recipients[0].get("id") if detail_recipients else None
    logger.info("[firma_desde_plantilla] envelope_item_id=%s | recipient_id=%s", envelope_item_id, recipient_id)

    # ── Paso 4: crear campos ───────────────────────────────────────────────
    fields_data = []
    for campo in campos:
        raw_type = (campo.get("type") or "SIGNATURE").upper()
        field_entry = {
            "type": raw_type,
            "recipientId": recipient_id,
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
    logger.info("[firma_desde_plantilla] campos creados | count=%d", len(fields_data))

    # ── Paso 5: distribuir ─────────────────────────────────────────────────
    distribute = _fetch_documenso_json(
        "POST", "/api/v2/envelope/distribute", json_payload={"envelopeId": envelope_id}
    )
    recipients_dist = distribute.get("recipients") or []
    recipient = _buscar_signatario(recipients_dist, email=recipient_email)
    signing_token = _extraer_signing_token(recipient or {})

    if not signing_token:
        raise DocumensoIntegrationError("Documenso no devolvió signing token.")

    return signing_token, str(envelope_id)


def recuperar_pdf_asistencia(cita) -> bool:
    """Download and save the signed asistencia PDF from Documenso.

    Useful when the webhook updated firma_asistencia_estado to 'firmada' but
    the PDF save failed (e.g. the original webhook lacked externalId so
    document_id was not available at that time).

    Returns True if the PDF was saved, False otherwise.
    """
    from django.core.files.base import ContentFile

    from apps.historia_clinica.services import (
        DocumensoIntegrationError,
        _fetch_documenso_json,
        descargar_pdf_documenso,
    )

    envelope_id = (cita.firma_asistencia_documento_id or "").strip()
    if not envelope_id:
        logger.warning("[recuperar_pdf_asistencia] sin documento_id | cita_id=%s", cita.id)
        return False

    # The stored id is the string slug (e.g. "envelope_abc123").
    # descargar_pdf_documenso needs the numeric document id, which Documenso v2
    # exposes as secondaryId: "document_323". Extract it from the envelope.
    numeric_id = None
    envelope = {}
    try:
        envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
        secondary = (envelope.get("secondaryId") or "").removeprefix("document_")
        if secondary.isdigit():
            numeric_id = secondary
    except DocumensoIntegrationError:
        logger.warning(
            "[recuperar_pdf_asistencia] no se pudo obtener el envelope | cita_id=%s | envelope_id=%s",
            cita.id, envelope_id,
        )

    pdf_bytes = descargar_pdf_documenso(numeric_id) if numeric_id else None

    # Fallback: envelopeItems[0].id via /api/v2/envelope/item/{id}/download.
    if not pdf_bytes:
        try:
            items = envelope.get("envelopeItems") or []
            item_id = items[0].get("id") if items else None
            if item_id:
                from apps.historia_clinica.services import _documenso_api_key
                import requests as _req
                from django.conf import settings as _settings
                base = _settings.DOCUMENSO_API_URL.rstrip("/")
                resp = _req.get(
                    f"{base}/api/v2/envelope/item/{item_id}/download",
                    headers={"Authorization": _documenso_api_key()},
                    timeout=30,
                )
                if resp.ok:
                    pdf_bytes = resp.content
        except Exception:
            logger.exception("[recuperar_pdf_asistencia] fallo fallback item download | cita_id=%s", cita.id)

    if not pdf_bytes:
        logger.error(
            "[recuperar_pdf_asistencia] PDF no disponible en Documenso | cita_id=%s | envelope_id=%s | numeric_id=%s",
            cita.id, envelope_id, numeric_id,
        )
        return False

    filename = f"asistencia-{cita.id}.pdf"
    cita.firma_asistencia_archivo.save(filename, ContentFile(pdf_bytes), save=False)
    cita.save(update_fields=["firma_asistencia_archivo", "updated_at"])
    logger.info(
        "[recuperar_pdf_asistencia] PDF guardado | cita_id=%s | envelope_id=%s",
        cita.id, envelope_id,
    )
    return True


def _estado_firma_desde_envelope(payload: dict) -> str:
    """Traduce la respuesta de ``GET /api/v2/envelope/{id}`` de Documenso a
    uno de: ``"firmada"`` | ``"rechazada"`` | ``"pendiente"``.

    Se consulta de forma defensiva porque las claves varian entre versiones de
    Documenso: estado global, ``completedAt``, y el estado por firmante.
    """
    status = str(
        payload.get("status")
        or payload.get("documentStatus")
        or payload.get("envelopeStatus")
        or ""
    ).upper()
    recipients = payload.get("recipients") or []

    # Rechazo explicito de algun firmante.
    for r in recipients:
        rechazo = (r.get("rejectionReason") or r.get("declineReason") or "").strip()
        estado_r = str(r.get("signingStatus") or r.get("status") or "").upper()
        if rechazo or estado_r in {"REJECTED", "DECLINED"}:
            return "rechazada"
    if status in {"REJECTED", "DECLINED"}:
        return "rechazada"

    if status in {"COMPLETED", "COMPLETE"} or payload.get("completedAt"):
        return "firmada"

    firmantes = [
        r for r in recipients
        if str(r.get("role") or "SIGNER").upper() in {"SIGNER", "APPROVER"}
    ]
    if firmantes:
        estados = [
            str(r.get("signingStatus") or r.get("status") or "").upper() for r in firmantes
        ]
        if all(e in {"SIGNED", "COMPLETED"} for e in estados) and any(estados):
            return "firmada"
        if all(r.get("signedAt") for r in firmantes):
            return "firmada"

    return "pendiente"


def verificar_firma_asistencia_en_documenso(cita) -> str:
    """Consulta el documento directamente en Documenso (sin esperar el webhook)
    y reconcilia ``cita.firma_asistencia_estado``. Devuelve el estado resultante.

    Pensado como respaldo manual: el flujo normal sigue siendo el webhook.
    """
    from apps.historia_clinica.services import DocumensoIntegrationError, _fetch_documenso_json

    estado_actual = cita.firma_asistencia_estado
    if estado_actual == "firmada":
        return estado_actual

    envelope_id = (cita.firma_asistencia_documento_id or "").strip()
    if not envelope_id:
        logger.warning("[verificar_firma_asistencia] sin documento_id | cita_id=%s", cita.id)
        return estado_actual

    try:
        payload = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    except DocumensoIntegrationError:
        logger.warning(
            "[verificar_firma_asistencia] no se pudo consultar el envelope | cita_id=%s | envelope_id=%s",
            cita.id, envelope_id,
        )
        return estado_actual

    nuevo = _estado_firma_desde_envelope(payload)
    logger.info(
        "[verificar_firma_asistencia] cita_id=%s | envelope_id=%s | estado_documenso=%s | estado_local=%s",
        cita.id, envelope_id, nuevo, estado_actual,
    )

    if nuevo == "firmada":
        cita.firma_asistencia_estado = "firmada"
        cita.save(update_fields=["firma_asistencia_estado", "updated_at"])
        if not cita.firma_asistencia_archivo:
            try:
                recuperar_pdf_asistencia(cita)
            except Exception:
                logger.exception(
                    "[verificar_firma_asistencia] fallo al recuperar PDF | cita_id=%s", cita.id
                )
    elif nuevo == "rechazada" and estado_actual != "rechazada":
        cita.firma_asistencia_estado = "rechazada"
        cita.save(update_fields=["firma_asistencia_estado", "updated_at"])

    return cita.firma_asistencia_estado


def verificar_firma_compromiso_pago_en_documenso(consentimiento: Consentimiento) -> str:
    """Analogo de :func:`verificar_firma_asistencia_en_documenso` para el
    ``Consentimiento`` (compromiso de pago / consentimientos con flujo Documenso).
    Devuelve ``"firmado"`` | ``"pendiente"`` (mismo vocabulario que el modelo).
    """
    from apps.historia_clinica.services import DocumensoIntegrationError, _fetch_documenso_json

    if consentimiento.estado == Consentimiento.Estado.FIRMADO:
        return consentimiento.estado

    envelope_id = (consentimiento.documenso_documento_id or "").strip()
    if not envelope_id:
        logger.warning(
            "[verificar_firma_compromiso_pago] sin documento_id | consentimiento_id=%s",
            consentimiento.id,
        )
        return consentimiento.estado

    try:
        payload = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
    except DocumensoIntegrationError:
        logger.warning(
            "[verificar_firma_compromiso_pago] no se pudo consultar el envelope | consentimiento_id=%s | envelope_id=%s",
            consentimiento.id, envelope_id,
        )
        return consentimiento.estado

    nuevo = _estado_firma_desde_envelope(payload)
    logger.info(
        "[verificar_firma_compromiso_pago] consentimiento_id=%s | envelope_id=%s | estado_documenso=%s",
        consentimiento.id, envelope_id, nuevo,
    )

    if nuevo == "firmada":
        consentimiento.estado = Consentimiento.Estado.FIRMADO
        consentimiento.firmado_en = timezone.now()
        consentimiento.save(update_fields=["estado", "firmado_en", "updated_at"])
        if not consentimiento.pdf_archivo:
            try:
                recuperar_pdf_compromiso_pago(consentimiento)
            except Exception:
                logger.exception(
                    "[verificar_firma_compromiso_pago] fallo al recuperar PDF | consentimiento_id=%s",
                    consentimiento.id,
                )
        _auto_aceptar_cotizacion(consentimiento)

    return consentimiento.estado


def recuperar_pdf_compromiso_pago(consentimiento: Consentimiento) -> bool:
    """
    Igual que recuperar_pdf_asistencia pero para Consentimiento.pdf_archivo.
    Se usa como respaldo cuando el webhook de Documenso no llega (ej. entorno
    local sin URL publica) — se llama de forma eager al confirmar la firma
    desde el frontend, ademas de quedar disponible para el webhook.
    """
    from django.core.files.base import ContentFile

    from apps.historia_clinica.services import (
        DocumensoIntegrationError,
        _documenso_api_key,
        _fetch_documenso_json,
        descargar_pdf_documenso,
    )

    envelope_id = (consentimiento.documenso_documento_id or "").strip()
    if not envelope_id:
        logger.warning("[recuperar_pdf_compromiso_pago] sin documento_id | consentimiento_id=%s", consentimiento.id)
        return False

    numeric_id = None
    envelope = {}
    try:
        envelope = _fetch_documenso_json("GET", f"/api/v2/envelope/{envelope_id}")
        secondary = (envelope.get("secondaryId") or "").removeprefix("document_")
        if secondary.isdigit():
            numeric_id = secondary
    except DocumensoIntegrationError:
        logger.warning(
            "[recuperar_pdf_compromiso_pago] no se pudo obtener el envelope | consentimiento_id=%s | envelope_id=%s",
            consentimiento.id, envelope_id,
        )

    pdf_bytes = descargar_pdf_documenso(numeric_id) if numeric_id else None

    if not pdf_bytes:
        try:
            items = envelope.get("envelopeItems") or []
            item_id = items[0].get("id") if items else None
            if item_id:
                import requests as _req
                base = settings.DOCUMENSO_API_URL.rstrip("/")
                resp = _req.get(
                    f"{base}/api/v2/envelope/item/{item_id}/download",
                    headers={"Authorization": _documenso_api_key()},
                    timeout=30,
                )
                if resp.ok:
                    pdf_bytes = resp.content
        except Exception:
            logger.exception("[recuperar_pdf_compromiso_pago] fallo fallback item download | consentimiento_id=%s", consentimiento.id)

    if not pdf_bytes:
        logger.error(
            "[recuperar_pdf_compromiso_pago] PDF no disponible en Documenso | consentimiento_id=%s | envelope_id=%s | numeric_id=%s",
            consentimiento.id, envelope_id, numeric_id,
        )
        return False

    filename = f"compromiso_pago-{consentimiento.id}.pdf"
    consentimiento.pdf_archivo.save(filename, ContentFile(pdf_bytes), save=False)
    consentimiento.save(update_fields=["pdf_archivo", "updated_at"])
    logger.info(
        "[recuperar_pdf_compromiso_pago] PDF guardado | consentimiento_id=%s | envelope_id=%s",
        consentimiento.id, envelope_id,
    )
    return True
