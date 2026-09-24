"""Firma del profesional en los consentimientos de una cita, al iniciar la primera atención.

El profesional firma con la imagen guardada en su perfil, su nombre y su tarjeta
profesional (TP). La firma se hace dentro del mismo sobre de Documenso que ya firmó
el paciente (ver ``documenso_firmantes``).
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


def consentimientos_pendientes_firma_profesional(cita) -> list[ConsentimientoInformado]:
    """Consentimientos de la cita que el paciente ya firmó y esperan la firma del profesional."""
    from apps.agenda.serializers import build_consentimiento_info

    info = build_consentimiento_info(cita)
    ids = [item["consentimiento_id"] for item in info["consentimientos"] if item.get("consentimiento_id")]
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
    if not user.firma_digital:
        return {"code": MOTIVO_SIN_FIRMA, "error": "No has cargado tu firma."}
    if pendientes is None:
        pendientes = consentimientos_pendientes_firma_profesional(cita)
    if any(c.requiere_tp_profesional for c in pendientes) and not (user.registro_profesional or "").strip():
        return {
            "code": MOTIVO_SIN_TP,
            "error": "Este consentimiento requiere tarjeta profesional y no la has registrado.",
        }
    return None


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


def firmar_consentimientos_profesional(cita, user, *, ip: str | None, user_agent: str | None) -> list[dict]:
    """Firma como ``user`` todos los consentimientos pendientes de la cita.

    Cada documento se firma por separado: si uno falla, los anteriores quedan firmados y
    el resultado indica cuál falló. Devuelve ``[{id, nombre, ok, error}]``.
    """
    pendientes = consentimientos_pendientes_firma_profesional(cita)
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
                "Firma del profesional fallida | consentimiento_id=%s | cita_id=%s", consentimiento.id, cita.id,
            )
            resultado.update(ok=False, error=str(exc))
            resultados.append(resultado)
            continue

        consentimiento.firmado_profesional_por = user
        consentimiento.fecha_firma_profesional = timezone.now()
        consentimiento.save(update_fields=["firmado_profesional_por", "fecha_firma_profesional", "updated_at"])
        resultados.append(resultado)
    return resultados
