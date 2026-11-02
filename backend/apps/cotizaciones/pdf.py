import base64
from decimal import Decimal

from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from apps.core.storage import get_public_url
from apps.cotizaciones.models import Cotizacion


def format_currency(value: Decimal) -> str:
    """Pesos como en la interfaz y el compromiso de pago: "$1.500.000" (M5-30).

    Antes salía "$1,500,000.00" (formato en inglés, con centavos).
    """
    from apps.consentimientos.services import formatear_moneda

    return formatear_moneda(value)


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
    todos = list(cotizacion.items.filter(activo=True).select_related("insumo"))
    # Los obsequios van en un bloque aparte: no son líneas de venta ni entran a
    # los subtotales.
    items = [item for item in todos if not item.es_obsequio]
    obsequios = [item for item in todos if item.es_obsequio]
    formas_pago = list(cotizacion.formas_pago.filter(activo=True).select_related("tipo"))
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
                "num_sesiones": item.num_sesiones_efectivas(),
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
    obsequios_payload = [
        {
            "descripcion": item.descripcion,
            "etiqueta": item.etiqueta_obsequio(),
            "cantidad": item.cantidad_legible(),
            "valor_referencia": format_currency(item.valor_referencia) if item.valor_referencia else "",
        }
        for item in obsequios
    ]
    formas_pago_payload = [
        {
            "tipo": forma.tipo.nombre,
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
        "obsequios": obsequios_payload,
        "mostrar_periodicidad": mostrar_periodicidad,
        "formas_pago": formas_pago_payload,
        "subtotal_bruto": format_currency(subtotal_bruto),
        "total_descuentos": format_currency(total_descuentos),
        "total": format_currency(cotizacion.total),
        # Renovada: la fecha es la de la renovación, de la que corre la validez.
        # Antes salía la original junto a la validez nueva (CT-17).
        "fecha_emision": format_date(cotizacion.vigente_desde or cotizacion.created_at),
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


def _hora_de_fila(hhmm: str | None) -> str:
    if not hhmm:
        return ""
    h, m = (int(x) for x in hhmm.split(":"))
    return f"{h % 12 or 12}:{m:02d} {'a. m.' if h < 12 else 'p. m.'}"


def build_consolidado_asistencia_context(cotizacion: Cotizacion) -> dict:
    """
    Contexto del PDF consolidado: la hoja de cada ítem como la que la clínica lleva
    en papel (docs/plan-atencion-sencilla.md). Una fila por sesión del paquete, hecha
    o no, con procedimientos, fecha, hora, firma del profesional y firma del paciente.
    Las firmas digitales que ya existen se muestran (la del paciente recortada del
    registro de asistencia firmado en Documenso; la del profesional, la de su
    perfil); donde no hay, queda el recuadro en blanco para firmar a mano. No
    dispara ninguna firma nueva.
    """
    from apps.agenda.models import Cita
    from apps.agenda.pdf_coords import recortar_firma_paciente
    from apps.agenda.tarjeta import filas_de_item
    from django.contrib.auth import get_user_model

    secciones = []
    for item in cotizacion.items.filter(activo=True).order_by("created_at"):
        filas_hoja = filas_de_item(item)
        if not filas_hoja:
            continue

        citas = Cita.objects.in_bulk([f["cita_id"] for f in filas_hoja if f["cita_id"]])
        profesionales = get_user_model().objects.in_bulk(
            [f["profesional"]["id"] for f in filas_hoja if f["profesional"]]
        )
        filas = []
        for f in filas_hoja:
            hecha = f["estado"] == "completado"
            realizados = [p["nombre"] for p in f["procedimientos"] if p["realizado"]]
            procedimiento = " + ".join(realizados if hecha and realizados else [p["nombre"] for p in f["procedimientos"]])

            firma_paciente_b64 = None
            cita = citas.get(f["cita_id"]) if f["cita_id"] else None
            if cita and cita.firma_asistencia_estado == Cita.FirmaAsistenciaEstado.FIRMADA and cita.firma_asistencia_archivo:
                try:
                    recorte = recortar_firma_paciente(cita.firma_asistencia_archivo.read())
                except Exception:
                    recorte = None
                if recorte:
                    firma_paciente_b64 = base64.b64encode(recorte).decode("ascii")

            firma_profesional_url = None
            nombre_profesional = ""
            if hecha and f["profesional"]:
                nombre_profesional = f["profesional"]["nombre"]
                profesional = profesionales.get(f["profesional"]["id"])
                if profesional is not None and profesional.firma_digital:
                    firma_profesional_url = get_public_url(profesional.firma_digital.name, internal=True)

            fecha = ""
            if hecha and f["fecha"]:
                anio, mes, dia = f["fecha"].split("-")
                fecha = f"{dia}/{mes}/{anio}"
            filas.append({
                "numero": f["numero"],
                "procedimiento": procedimiento,
                "zonas": ", ".join(f["zonas"]),
                "obsequio": f["obsequio"],
                "no_asistio": f["estado"] == "inasistencia",
                # Fecha y hora solo de lo ya hecho: en lo pendiente quedan los
                # espacios para llenarlos a mano.
                "fecha": fecha,
                "hora": _hora_de_fila(f["hora"]) if hecha else "",
                "profesional_nombre": nombre_profesional,
                "firma_profesional_url": firma_profesional_url,
                "firma_paciente_b64": firma_paciente_b64,
            })
        secciones.append({
            "descripcion": item.descripcion,
            "total": len(filas),
            "hechas": sum(1 for f in filas_hoja if f["estado"] == "completado"),
            "con_firma": sum(1 for f in filas if f["firma_paciente_b64"]),
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
