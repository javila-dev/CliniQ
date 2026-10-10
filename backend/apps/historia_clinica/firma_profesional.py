"""Firma del profesional en los consentimientos que el paciente ya firmó.

Se firma al iniciar la primera atención de una cita (solo el profesional de la cita)
o desde la venta aprobada (cualquier profesional de la clínica). El profesional firma
con la imagen guardada en su perfil, su nombre y su tarjeta profesional (TP). La
firma se hace dentro del mismo sobre de Documenso que ya firmó el paciente (ver
``documenso_firmantes``).
"""
import logging

from django.utils import timezone

from apps.historia_clinica.documenso_firmantes import firmar_como_profesional, imagen_a_data_url_png
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import DocumensoIntegrationError


logger = logging.getLogger(__name__)

MOTIVO_OTRO_PROFESIONAL = "PROFESIONAL_NO_ASIGNADO"
MOTIVO_SIN_FIRMA = "SIN_FIRMA"
MOTIVO_SIN_TP = "SIN_TP"
MOTIVO_NO_ES_PROFESIONAL = "NO_ES_PROFESIONAL"
MOTIVO_VENTA_NO_APROBADA = "VENTA_NO_APROBADA"


def _pendientes_por_ids(ids) -> list[ConsentimientoInformado]:
    if not ids:
        return []
    return list(
        ConsentimientoInformado.objects.filter(
            id__in=ids,
            firmado=True,
            requiere_firma_profesional=True,
            fecha_firma_profesional__isnull=True,
        ).order_by("documenso_template_nombre")
    )


def consentimientos_pendientes_firma_profesional(cita) -> list[ConsentimientoInformado]:
    """Consentimientos de la cita que el paciente ya firmó y esperan la firma del profesional."""
    from apps.agenda.serializers import build_consentimiento_info

    info = build_consentimiento_info(cita)
    return _pendientes_por_ids(
        [item["consentimiento_id"] for item in info["consentimientos"] if item.get("consentimiento_id")]
    )


def consentimientos_pendientes_firma_profesional_cotizacion(cotizacion) -> list[ConsentimientoInformado]:
    """Consentimientos que exige la cotización, ya firmados por el paciente, que esperan al profesional."""
    from apps.protocolos.services import consentimientos_requeridos_cotizacion

    return _pendientes_por_ids(
        [
            c["consentimiento_id"]
            for c in consentimientos_requeridos_cotizacion(cotizacion)
            if c["pendiente_firma_profesional"] and c["consentimiento_id"]
        ]
    )


def _motivo_firma_y_tp(user, pendientes) -> dict | None:
    if not user.firma_digital:
        return {"code": MOTIVO_SIN_FIRMA, "error": "No has cargado tu firma."}
    if any(c.requiere_tp_profesional for c in pendientes) and not (user.registro_profesional or "").strip():
        return {
            "code": MOTIVO_SIN_TP,
            "error": "Este consentimiento requiere tarjeta profesional y no la has registrado.",
        }
    return None


def motivo_no_puede_firmar(user, cita, pendientes=None) -> dict | None:
    """Por qué ``user`` no puede firmar los consentimientos de ``cita`` (None si puede).

    La firma se exige siempre; la tarjeta profesional solo si algún documento pendiente
    tiene el campo de TP (consentimientos de procedimientos médicos)."""
    if cita.profesional_id != user.id:
        nombre = cita.profesional.nombre_completo if cita.profesional_id else "otro profesional"
        return {
            "code": MOTIVO_OTRO_PROFESIONAL,
            "error": f"Esta cita está asignada a {nombre}. Solo ese profesional puede firmar.",
        }
    if pendientes is None:
        pendientes = consentimientos_pendientes_firma_profesional(cita)
    return _motivo_firma_y_tp(user, pendientes)


def motivo_no_puede_firmar_cotizacion(user, cotizacion, pendientes) -> dict | None:
    """Desde la venta firma cualquier profesional de la clínica (no hay cita que lo asigne),
    pero solo cuando la venta ya está aprobada."""
    from apps.cotizaciones.models import Cotizacion

    if cotizacion.estado != Cotizacion.Estado.ACEPTADA:
        return {
            "code": MOTIVO_VENTA_NO_APROBADA,
            "error": "La venta debe estar aprobada para firmar sus consentimientos.",
        }
    if not user.es_profesional:
        return {
            "code": MOTIVO_NO_ES_PROFESIONAL,
            "error": "Solo un profesional de la clínica puede firmar estos consentimientos.",
        }
    return _motivo_firma_y_tp(user, pendientes)


class FirmaNoDisponibleError(Exception):
    pass


def firma_png_del_usuario(user) -> str:
    """Firma del perfil como data URL PNG. Se guarda en el bucket público (como en las
    órdenes médicas), no en el almacenamiento por defecto."""
    from apps.core.storage import read_public_file

    datos = read_public_file(user.firma_digital.name) if user.firma_digital else None
    if not datos:
        raise FirmaNoDisponibleError("No se pudo leer tu firma. Vuelve a cargarla en tu perfil.")
    try:
        return imagen_a_data_url_png(datos)
    except Exception as exc:
        raise FirmaNoDisponibleError("Tu firma guardada no es una imagen válida. Vuelve a cargarla.") from exc


def serializar_pendiente(consentimiento) -> dict:
    return {
        "id": str(consentimiento.id),
        "nombre": consentimiento.documenso_template_nombre or consentimiento.get_tipo_display(),
        "fecha_firma_paciente": consentimiento.fecha_firma,
        "requiere_tp": consentimiento.requiere_tp_profesional,
    }


def pdf_para_firma_profesional(consentimiento) -> bytes | None:
    """PDF para leer antes de firmar. Mientras falta el profesional Documenso no entrega el
    PDF con la firma del paciente: se muestra el documento de la plantilla (su contenido completo)."""
    from apps.historia_clinica.services import descargar_pdf_documento_original

    if consentimiento.plantilla_id and consentimiento.plantilla.pdf_file:
        consentimiento.plantilla.pdf_file.open("rb")
        try:
            pdf_bytes = consentimiento.plantilla.pdf_file.read()
        finally:
            consentimiento.plantilla.pdf_file.close()
        if pdf_bytes:
            return pdf_bytes
    if consentimiento.documenso_document_id:
        return descargar_pdf_documento_original(consentimiento.documenso_document_id)
    return None


def firmar_consentimientos_profesional(cita, user, *, ip: str | None, user_agent: str | None) -> list[dict]:
    """Firma como ``user`` todos los consentimientos pendientes de la cita."""
    return firmar_pendientes(
        consentimientos_pendientes_firma_profesional(cita), user, ip=ip, user_agent=user_agent,
        contexto=f"cita_id={cita.id}",
    )


def firmar_pendientes(pendientes, user, *, ip: str | None, user_agent: str | None, contexto: str = "") -> list[dict]:
    """Firma como ``user`` los consentimientos ``pendientes``.

    Cada documento se firma por separado: si uno falla, los anteriores quedan firmados y
    el resultado indica cuál falló. Devuelve ``[{id, nombre, ok, error}]``.
    """
    if not pendientes:
        return []

    firma_data_url = firma_png_del_usuario(user)
    resultados = []
    for consentimiento in pendientes:
        resultado = {**serializar_pendiente(consentimiento), "ok": True, "error": None}
        try:
            if not consentimiento.documenso_document_id or not consentimiento.documenso_recipient_profesional_id:
                raise DocumensoIntegrationError("El documento no tiene asignado el firmante profesional.")
            firmar_como_profesional(
                envelope_id=consentimiento.documenso_document_id,
                recipient_id=consentimiento.documenso_recipient_profesional_id,
                nombre=user.nombre_completo,
                email=user.email,
                registro_profesional=(user.registro_profesional or "").strip(),
                firma_data_url=firma_data_url,
                ip=ip,
                user_agent=user_agent,
            )
        except DocumensoIntegrationError as exc:
            logger.exception(
                "Firma del profesional fallida | consentimiento_id=%s | %s", consentimiento.id, contexto,
            )
            resultado.update(ok=False, error=str(exc))
            resultados.append(resultado)
            continue

        consentimiento.firmado_profesional_por = user
        consentimiento.fecha_firma_profesional = timezone.now()
        consentimiento.save(update_fields=["firmado_profesional_por", "fecha_firma_profesional", "updated_at"])
        resultados.append(resultado)
    return resultados
