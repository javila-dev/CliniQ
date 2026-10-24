"""Factura electrónica (Alegra) de cada cobro aprobado de la suscripción. Ver §9 del plan.

- Se emite al aprobarse el cobro y, si falla, la tarea periódica reintenta (hasta
  INTENTOS_MAXIMOS; después queda en error para revisarla desde la consola).
- El total facturado es exactamente lo cobrado en Wompi: con IVA, el precio del
  ítem es el cobro sin IVA (Alegra recibe precios antes de impuestos).
- Con ALEGRA_EMITIR_DIAN apagado la factura se crea sin enviarla a la DIAN (pruebas).
"""

import logging
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import alegra
from .models import CobroSuscripcion, DatosFacturacion, FacturaSaaS
from .validacion_facturacion import problemas_de

logger = logging.getLogger(__name__)
F = FacturaSaaS.Estado

INTENTOS_MAXIMOS = 5
CICLO = {"mensual": "mensual", "anual": "anual"}


def precio_sin_iva(monto: Decimal) -> Decimal:
    if not settings.ALEGRA_TAX_ID:
        return monto
    factor = 1 + Decimal(settings.ALEGRA_IVA_PCT) / 100
    return (monto / factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def datos_contacto(d: DatosFacturacion) -> dict:
    juridica = d.tipo_persona == DatosFacturacion.TipoPersona.JURIDICA
    identificacion = {"type": d.tipo_documento, "number": d.numero_documento}
    if d.tipo_documento == DatosFacturacion.TipoDocumento.NIT and d.dv:
        identificacion["dv"] = d.dv
    datos = {
        "name": d.razon_social if juridica else f"{d.nombres} {d.apellidos}".strip(),
        "identificationObject": identificacion,
        "kindOfPerson": "LEGAL_ENTITY" if juridica else "PERSON_ENTITY",
        "regime": "COMMON_REGIME" if d.responsable_iva else "SIMPLIFIED_REGIME",
        "fiscalResponsabilities": [str(r) for r in d.responsabilidades_fiscales or []],
        "email": d.email_facturacion,
        "phonePrimary": d.telefono,
        "address": {"address": d.direccion, "city": d.ciudad, "department": d.departamento, "country": "Colombia"},
        "type": ["client"],
    }
    if not juridica:
        datos["nameObject"] = {"firstName": d.nombres, "lastName": d.apellidos}
    return datos


def asegurar_contacto(d: DatosFacturacion) -> str:
    """El cliente en Alegra: se reutiliza el guardado, se busca por documento o se crea."""
    datos = datos_contacto(d)
    if d.alegra_contact_id:
        alegra.actualizar_contacto(d.alegra_contact_id, datos)
        return d.alegra_contact_id
    existente = alegra.buscar_contacto(d.numero_documento)
    contacto_id = str(existente["id"]) if existente else str(alegra.crear_contacto(datos)["id"])
    if existente:
        alegra.actualizar_contacto(contacto_id, datos)
    d.alegra_contact_id = contacto_id
    d.save(update_fields=["alegra_contact_id", "updated_at"])
    return contacto_id


def _descripcion(cobro: CobroSuscripcion) -> str:
    inicio, fin = cobro.periodo_inicio.strftime("%d/%m/%Y"), cobro.periodo_fin.strftime("%d/%m/%Y")
    if cobro.concepto == CobroSuscripcion.Concepto.CAMBIO_PLAN:
        return f"Cambio al plan {cobro.plan.nombre} - proporcional del {inicio} al {fin}"
    return f"Suscripción CliniQ - plan {cobro.plan.nombre} {CICLO.get(cobro.ciclo, cobro.ciclo)} - del {inicio} al {fin}"


def datos_factura(cobro: CobroSuscripcion, contacto_id: str) -> dict:
    hoy = timezone.localdate().isoformat()
    item = {
        "id": settings.ALEGRA_ITEM_ID,
        "price": float(precio_sin_iva(cobro.monto)),
        "quantity": 1,
        "description": _descripcion(cobro),
    }
    if settings.ALEGRA_TAX_ID:
        item["tax"] = [{"id": settings.ALEGRA_TAX_ID}]
    if not settings.ALEGRA_EMITIR_DIAN:
        # Modo pruebas: borrador y sin pago, para no gastar un consecutivo de la
        # numeración DIAN ni registrar un ingreso en la contabilidad real.
        return {
            "date": hoy,
            "dueDate": hoy,
            "status": "draft",
            "client": {"id": contacto_id},
            "items": [item],
            "numberTemplate": {"id": settings.ALEGRA_NUMBER_TEMPLATE_ID},
            "paymentForm": "CASH",
            "paymentMethod": settings.ALEGRA_MEDIO_PAGO,
            "anotation": f"PRUEBA - pago con tarjeta por Wompi, referencia {cobro.referencia}.",
        }
    return {
        "date": hoy,
        "dueDate": hoy,
        "client": {"id": contacto_id},
        "items": [item],
        "numberTemplate": {"id": settings.ALEGRA_NUMBER_TEMPLATE_ID},
        "paymentForm": "CASH",
        "paymentMethod": settings.ALEGRA_MEDIO_PAGO,
        # Ya está pagada (Wompi): el pago va en la misma factura.
        "payments": [{
            "date": hoy,
            "account": {"id": settings.ALEGRA_BANK_ACCOUNT_ID},
            "amount": float(cobro.monto),
            "paymentMethod": "credit-card",
        }],
        "anotation": f"Pago con tarjeta por Wompi, referencia {cobro.referencia}.",
        "stamp": {"generateStamp": bool(settings.ALEGRA_EMITIR_DIAN)},
    }


def _numero(data: dict) -> str:
    plantilla = data.get("numberTemplate") or {}
    if isinstance(plantilla, list):
        plantilla = plantilla[0] if plantilla else {}
    if plantilla.get("fullNumber"):
        return str(plantilla["fullNumber"])
    return f"{plantilla.get('prefix') or ''}{plantilla.get('number') or data.get('id', '')}"


def _leer_estampa(factura: FacturaSaaS, data: dict) -> None:
    estampa = data.get("stamp") or {}
    factura.cufe = str(estampa.get("cufe") or factura.cufe)[:120]
    factura.estado_dian = str(estampa.get("legalStatus") or estampa.get("status") or factura.estado_dian)[:60]


def emitir(cobro: CobroSuscripcion) -> FacturaSaaS | None:
    """Crea (o reintenta) la factura del cobro. No lanza: los errores quedan en la factura."""
    if not alegra.configurado() or cobro.estado != CobroSuscripcion.Estado.APROBADO:
        return None
    with transaction.atomic():
        factura, _ = FacturaSaaS.objects.select_for_update().get_or_create(cobro=cobro)
        if factura.estado == F.EMITIDA:
            return factura
        factura.intentos += 1
        factura.save(update_fields=["intentos", "updated_at"])

    datos = getattr(cobro.suscripcion.clinica, "datos_facturacion", None)
    try:
        if datos is None:
            raise alegra.AlegraError("La clínica no tiene datos de facturación.")
        faltan = problemas_de(datos)
        if faltan:
            # Datos guardados antes de las reglas actuales: no se manda nada a
            # Alegra hasta que la clínica los complete en Configuración → Plan.
            raise alegra.AlegraError("Datos de facturación incompletos: " + " ".join(faltan.values()))
        if factura.alegra_invoice_id:
            # Quedó en borrador porque la DIAN la rechazó: solo se reintenta el envío.
            alegra.timbrar([factura.alegra_invoice_id])
            data = alegra.obtener_factura(factura.alegra_invoice_id)
        else:
            try:
                data = alegra.crear_factura(datos_factura(cobro, asegurar_contacto(datos)))
            except alegra.AlegraError as exc:
                # Alegra crea la factura en borrador aunque la DIAN la rechace: se guarda
                # el id para no duplicarla al reintentar.
                borrador = exc.cuerpo.get("invoice") or (exc.cuerpo if exc.cuerpo.get("id") else None)
                if borrador and borrador.get("id"):
                    factura.alegra_invoice_id = str(borrador["id"])
                    factura.save(update_fields=["alegra_invoice_id", "updated_at"])
                raise
        factura.alegra_invoice_id = str(data.get("id", factura.alegra_invoice_id))
        # El borrador ya trae el número que tendría, pero no es una factura emitida.
        factura.numero = (_numero(data) if settings.ALEGRA_EMITIR_DIAN else f"Borrador {factura.alegra_invoice_id}")[:40]
        _leer_estampa(factura, data)
        factura.estado = F.EMITIDA
        factura.ultimo_error = ""
        factura.save()
    except alegra.AlegraError as exc:
        factura.ultimo_error = str(exc)[:2000]
        factura.estado = F.ERROR if factura.intentos >= INTENTOS_MAXIMOS else F.PENDIENTE
        factura.save(update_fields=["ultimo_error", "estado", "updated_at"])
        logger.warning("No se emitió la factura del cobro %s (intento %s): %s", cobro.referencia, factura.intentos, exc)
        return factura

    try:
        alegra.enviar_factura(factura.alegra_invoice_id, [datos.email_facturacion])
        factura.enviada_at = timezone.now()
        factura.save(update_fields=["enviada_at", "updated_at"])
    except alegra.AlegraError as exc:
        logger.warning("Factura %s emitida pero no enviada por correo: %s", factura.numero, exc)
    return factura


def emitir_despues_de_aprobar(cobro_id) -> None:
    """Para transaction.on_commit al aprobar un cobro: nunca rompe el cobro."""
    try:
        emitir(CobroSuscripcion.objects.select_related("suscripcion__clinica", "plan").get(pk=cobro_id))
    except Exception:
        logger.exception("Error inesperado al facturar el cobro %s", cobro_id)


def procesar_facturas() -> list[str]:
    """Tarea periódica: cobros aprobados sin factura o con la factura pendiente."""
    if not alegra.configurado():
        return []
    hechos = []
    pendientes = (
        CobroSuscripcion.objects.filter(estado=CobroSuscripcion.Estado.APROBADO)
        .exclude(factura__estado__in=[F.EMITIDA, F.ERROR])
        .select_related("suscripcion__clinica", "plan")
    )
    for cobro in pendientes[:50]:
        factura = emitir(cobro)
        if factura is not None:
            hechos.append(f"{cobro.suscripcion.clinica.nombre}: factura {factura.numero or '-'} {factura.estado}")
    return hechos
