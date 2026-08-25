import base64
from decimal import Decimal

from django.db.models import Prefetch
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from apps.core.storage import get_public_url
from apps.cotizaciones.models import Cotizacion


def format_currency(value: Decimal) -> str:
    normalized = Decimal(value or "0.00")
    return f"${normalized:,.2f}"


def format_date(value) -> str:
    if not value:
        return ""
    if hasattr(value, "date"):
        value = timezone.localtime(value).date()
    return value.strftime("%d/%m/%Y")


def build_logo_public_url(clinica) -> str | None:
    if not clinica.logo:
        return None
    return get_public_url(clinica.logo.name, internal=True)


def build_cotizacion_pdf_context(cotizacion: Cotizacion) -> dict:
    items = list(cotizacion.items.filter(activo=True))
    formas_pago = list(cotizacion.formas_pago.filter(activo=True))
    subtotal_bruto = sum((Decimal(item.num_citas) * item.valor_unitario for item in items), Decimal("0.00"))
    total_descuentos = sum(
        (
            (Decimal(item.num_citas) * item.valor_unitario * item.descuento_porcentaje) / Decimal("100.00")
            for item in items
        ),
        Decimal("0.00"),
    )

    items_tratamientos = []
    items_servicios = []
    mostrar_periodicidad = any((item.periodicidad or "").strip() for item in items)

    for item in items:
        descuento_str = f"{item.descuento_porcentaje:.0f}%" if item.descuento_porcentaje else ""
        periodicidad = (item.periodicidad or "").strip()
        item_payload = {
            "periodicidad": periodicidad or "-",
            "valor_unitario": format_currency(item.valor_unitario),
            "descuento_porcentaje": descuento_str,
            "subtotal": format_currency(item.subtotal),
        }
        if item.tipo == "tratamiento":
            catalogo_ref = item.tratamiento.nombre if item.tratamiento and item.tratamiento.nombre != item.descripcion else None
            items_tratamientos.append({
                **item_payload,
                "descripcion": item.descripcion,
                "catalogo_ref": catalogo_ref,
                "num_sesiones": item.num_citas,
            })
        else:
            tipo_label = "Procedimiento" if item.tipo == "procedimiento" else "Libre"
            catalogo_ref = item.procedimiento.nombre if item.tipo == "procedimiento" and item.procedimiento and item.procedimiento.nombre != item.descripcion else None
            items_servicios.append({
                **item_payload,
                "tipo_label": tipo_label,
                "descripcion": item.descripcion,
                "catalogo_ref": catalogo_ref,
                "num_citas": item.num_citas,
            })
    formas_pago_payload = [
        {
            "tipo": forma.get_tipo_display(),
            "descripcion": forma.descripcion or "-",
            "valor": format_currency(forma.valor),
        }
        for forma in formas_pago
    ]

    return {
        "cotizacion": cotizacion,
        "clinica": cotizacion.clinica,
        "logo_url": build_logo_public_url(cotizacion.clinica),
        "paciente": cotizacion.paciente,
        "profesional_nombre": cotizacion.profesional.nombre_completo if cotizacion.profesional else "No asignado",
        "sede": cotizacion.sede,
        "items_tratamientos": items_tratamientos,
        "items_servicios": items_servicios,
        "mostrar_periodicidad": mostrar_periodicidad,
        "formas_pago": formas_pago_payload,
        "subtotal_bruto": format_currency(subtotal_bruto),
        "total_descuentos": format_currency(total_descuentos),
        "total": format_currency(cotizacion.total),
        "fecha_emision": format_date(cotizacion.created_at),
        "fecha_vencimiento": format_date(cotizacion.fecha_vencimiento),
        "documento_paciente": f"{cotizacion.paciente.tipo_documento} {cotizacion.paciente.numero_documento}",
        "telefono_paciente": cotizacion.paciente.telefono or "-",
        "telefono_clinica": cotizacion.clinica.telefono or "-",
        "ciudad_clinica": cotizacion.sede.ciudad if cotizacion.sede else "",
        "direccion_clinica": cotizacion.sede.direccion if cotizacion.sede else "",
        "notas": cotizacion.notas or "",
        "referencia": str(cotizacion.id)[:8].upper(),
        "validez_texto": f"{cotizacion.validez_dias} dias",
    }


def format_time(value) -> str:
    if not value:
        return ""
    return timezone.localtime(value).strftime("%I:%M %p")


def build_consolidado_asistencia_context(cotizacion: Cotizacion) -> dict:
    """
    Arma el contexto del PDF consolidado del ciclo de tratamiento: una tabla
    por item de la cotizacion con todas sus citas (sesion N/M, fecha, hora,
    profesional) y la firma del paciente ya capturada por cita (recortada
    del PDF de registro de asistencia firmado via Documenso). No dispara
    ninguna firma nueva: solo reutiliza lo que ya quedo firmado.
    """
    from apps.agenda.models import Cita
    from apps.agenda.pdf_coords import recortar_firma_paciente

    items = list(
        cotizacion.items.filter(activo=True).prefetch_related(
            Prefetch(
                "citas",
                queryset=Cita.objects.exclude(estado=Cita.Estado.CANCELADA)
                .select_related("profesional")
                .order_by("fecha_inicio"),
            )
        )
    )

    secciones = []
    for item in items:
        citas = list(item.citas.all())
        if not citas:
            continue
        filas = []
        for idx, cita in enumerate(citas, start=1):
            firma_img_b64 = None
            if cita.firma_asistencia_estado == Cita.FirmaAsistenciaEstado.FIRMADA and cita.firma_asistencia_archivo:
                try:
                    recorte = recortar_firma_paciente(cita.firma_asistencia_archivo.read())
                except Exception:
                    recorte = None
                if recorte:
                    firma_img_b64 = base64.b64encode(recorte).decode("ascii")
            filas.append({
                "numero": idx,
                "procedimiento": cita.servicio_nombre or (cita.servicio.nombre if cita.servicio else item.descripcion),
                "fecha": format_date(cita.fecha_inicio),
                "hora": format_time(cita.fecha_inicio),
                "profesional_nombre": cita.profesional.nombre_completo if cita.profesional else "-",
                "estado_cita": cita.get_estado_display(),
                "firma_estado": cita.firma_asistencia_estado,
                "firma_estado_label": cita.get_firma_asistencia_estado_display(),
                "firma_img_b64": firma_img_b64,
            })
        secciones.append({
            "descripcion": item.descripcion,
            "num_citas": item.num_citas,
            "citas_registradas": len(citas),
            "citas_firmadas": sum(1 for f in filas if f["firma_img_b64"]),
            "filas": filas,
        })

    return {
        "cotizacion": cotizacion,
        "clinica": cotizacion.clinica,
        "logo_url": build_logo_public_url(cotizacion.clinica),
        "paciente": cotizacion.paciente,
        "documento_paciente": f"{cotizacion.paciente.tipo_documento} {cotizacion.paciente.numero_documento}",
        "telefono_clinica": cotizacion.clinica.telefono or "-",
        "referencia": str(cotizacion.id)[:8].upper(),
        "fecha_generacion": f"{format_date(timezone.now())} · {format_time(timezone.now())}",
        "secciones": secciones,
    }


def build_consolidado_asistencia_html(cotizacion: Cotizacion) -> str:
    return render_to_string(
        "cotizaciones/pdf_consolidado_asistencia.html",
        build_consolidado_asistencia_context(cotizacion),
    )


def render_consolidado_asistencia_pdf(cotizacion: Cotizacion) -> bytes:
    html = build_consolidado_asistencia_html(cotizacion)
    return HTML(string=html, base_url="/").write_pdf()


def build_cotizacion_pdf_html(cotizacion: Cotizacion) -> str:
    return render_to_string("cotizaciones/pdf_cotizacion.html", build_cotizacion_pdf_context(cotizacion))


def render_cotizacion_pdf(cotizacion: Cotizacion) -> bytes:
    html = build_cotizacion_pdf_html(cotizacion)
    return HTML(string=html, base_url="/").write_pdf()
