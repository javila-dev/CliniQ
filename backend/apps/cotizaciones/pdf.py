from decimal import Decimal

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

    for item in items:
        descuento_str = f"{item.descuento_porcentaje:.0f}%" if item.descuento_porcentaje else ""
        if item.tipo == "tratamiento":
            catalogo_ref = item.tratamiento.nombre if item.tratamiento and item.tratamiento.nombre != item.descripcion else None
            items_tratamientos.append({
                "descripcion": item.descripcion,
                "catalogo_ref": catalogo_ref,
                "num_sesiones": item.num_citas,
                "valor_unitario": format_currency(item.valor_unitario),
                "descuento_porcentaje": descuento_str,
                "subtotal": format_currency(item.subtotal),
            })
        else:
            tipo_label = "Procedimiento" if item.tipo == "procedimiento" else "Libre"
            catalogo_ref = item.procedimiento.nombre if item.tipo == "procedimiento" and item.procedimiento and item.procedimiento.nombre != item.descripcion else None
            items_servicios.append({
                "tipo_label": tipo_label,
                "descripcion": item.descripcion,
                "catalogo_ref": catalogo_ref,
                "num_citas": item.num_citas,
                "valor_unitario": format_currency(item.valor_unitario),
                "descuento_porcentaje": descuento_str,
                "subtotal": format_currency(item.subtotal),
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


def build_cotizacion_pdf_html(cotizacion: Cotizacion) -> str:
    return render_to_string("cotizaciones/pdf_cotizacion.html", build_cotizacion_pdf_context(cotizacion))


def render_cotizacion_pdf(cotizacion: Cotizacion) -> bytes:
    html = build_cotizacion_pdf_html(cotizacion)
    return HTML(string=html, base_url="/").write_pdf()
