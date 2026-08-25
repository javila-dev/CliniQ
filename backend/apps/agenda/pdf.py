from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from apps.core.storage import get_public_url


def _build_logo_url(clinica) -> str | None:
    if not clinica or not clinica.logo:
        return None
    return get_public_url(clinica.logo.name, internal=True)


def _format_datetime(dt) -> str:
    if not dt:
        return ""
    local = timezone.localtime(dt)
    dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    dia_semana = dias[local.weekday()]
    return f"{dia_semana} {local.day} de {meses[local.month - 1]} de {local.year} · {local.strftime('%I:%M %p')}"


def _format_date_only(dt) -> str:
    if not dt:
        return ""
    local = timezone.localtime(dt)
    meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    return f"{local.day} de {meses[local.month - 1]} de {local.year}"


def build_registro_asistencia_context(cita) -> dict:
    clinica = cita.sede.clinica if cita.sede else None
    paciente = cita.paciente

    cotizacion_info = None
    if cita.item_cotizacion_id:
        item = cita.item_cotizacion
        cotizacion = item.cotizacion
        sesion_actual = item.citas_no_canceladas()
        total_sesiones = item.num_citas
        cotizacion_info = {
            "referencia": str(cotizacion.id)[:8].upper(),
            "descripcion": item.descripcion,
            "sesion_actual": sesion_actual,
            "total_sesiones": total_sesiones,
            "fecha_aceptacion": _format_date_only(cotizacion.updated_at),
        }

    now = timezone.localtime(timezone.now())
    return {
        "clinica": clinica,
        "logo_url": _build_logo_url(clinica),
        "cita": cita,
        "cita_referencia": str(cita.id)[:8].upper(),
        "paciente": paciente,
        "documento_paciente": f"{paciente.tipo_documento} {paciente.numero_documento}",
        "profesional_nombre": cita.profesional.get_full_name() if cita.profesional else "",
        "sede_nombre": cita.sede.nombre if cita.sede else "",
        "fecha_cita": _format_datetime(cita.fecha_inicio),
        "procedimiento_nombre": cita.servicio_nombre or (cita.servicio.nombre if cita.servicio else cita.motivo or ""),
        "cotizacion_info": cotizacion_info,
        "generado_en": now.strftime("%d/%m/%Y · %I:%M %p"),
        "fecha_generacion": _format_date_only(now),
    }


def render_registro_asistencia_pdf(cita) -> bytes:
    context = build_registro_asistencia_context(cita)
    html = render_to_string("agenda/pdf_registro_asistencia.html", context)
    return HTML(string=html, base_url="/").write_pdf()
