"""Asistente de puesta en marcha.

Crea, en una sola transacción, los datos previos de un paciente que llega a
mitad de un tratamiento cuando la clínica adopta CliniQ: cotización aceptada,
cobro con los pagos ya hechos, citas de las sesiones ya realizadas y cartera con
el plan del saldo.

Todo queda marcado con ``es_migracion=True`` + ``lote_migracion`` para poder
excluirlo de caja / reportes y para poder revertir la carga completa.

Efectos colaterales SUPRIMIDOS respecto del flujo normal:
- No se llama a ``aceptar_cotizacion`` → no se generan consentimientos ni
  documentos Documenso.
- La cotización se crea ya en estado ACEPTADA en un solo ``save`` → el signal
  ``crear_tratamientos_al_aceptar`` sale por el guard ``_estado_anterior``.
- Las citas se crean en estado COMPLETADA con ``recordatorio_enviado=True`` → no
  hay recordatorios.
- No se usa ``agregar_item_cobro`` → no se mueve inventario.
- No pasa por el serializer de cotización → no se validan topes de descuento.
"""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.agenda.models import Cita
from apps.cartera.models import Cartera, CuotaCartera
from apps.cobros.models import Cobro, PagoRecibido
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.migracion.models import LoteMigracion


def _dt(fecha):
    """DateField → DateTime aware al mediodía (para citas/pagos históricos)."""
    if fecha is None:
        return timezone.now()
    return timezone.make_aware(datetime.combine(fecha, time(12, 0)))


@transaction.atomic
def cargar_paciente_en_curso(data: dict, *, clinica, sede, paciente, actor) -> LoteMigracion:
    trat = data["tratamiento"]
    pagos = data.get("pagos", [])
    plan = data.get("plan_saldo", [])
    realizadas = data.get("sesiones_realizadas", [])

    total = Decimal(trat["precio_total_pactado"])
    pagado = sum((Decimal(p["valor"]) for p in pagos), Decimal("0"))
    saldo = total - pagado

    lote = LoteMigracion.objects.create(
        clinica=clinica,
        paciente=paciente,
        tipo=LoteMigracion.Tipo.PACIENTE_EN_CURSO,
        nota=data.get("nota", ""),
        creado_por=actor,
    )

    # ── 1. Cotización (ya ACEPTADA) + su ítem ────────────────────────────────
    cotizacion = Cotizacion.objects.create(
        clinica=clinica,
        paciente=paciente,
        sede=sede,
        profesional=None,
        estado=Cotizacion.Estado.ACEPTADA,
        notas="Datos previos — puesta en marcha",
        es_migracion=True,
        lote_migracion=lote.id,
    )

    tratamiento_obj = None
    servicio_obj = None
    if trat["tipo"] == "tratamiento":
        from apps.clinicas.models import TratamientoCatalogo
        tratamiento_obj = TratamientoCatalogo.objects.filter(
            id=trat["tratamiento"], clinica=clinica
        ).first()
        if tratamiento_obj is None:
            raise ValidationError({"tratamiento": "Tratamiento no encontrado en esta clínica."})
    elif trat["tipo"] == "procedimiento":
        from apps.clinicas.models import Servicio
        servicio_obj = Servicio.objects.filter(id=trat["servicio"], clinica=clinica).first()
        if servicio_obj is None:
            raise ValidationError({"servicio": "Procedimiento no encontrado en esta clínica."})

    # sesiones realizadas sin detalle (sin profesional) → solo cuentan
    sin_detalle = sum(1 for s in realizadas if not s.get("profesional"))

    item = ItemCotizacion.objects.create(
        cotizacion=cotizacion,
        tipo=trat["tipo"],
        tratamiento=tratamiento_obj,
        servicio=servicio_obj if trat["tipo"] == "procedimiento" else None,
        procedimiento=servicio_obj if trat["tipo"] == "procedimiento" else None,
        descripcion=trat["descripcion"],
        num_citas=trat["num_sesiones_total"] if trat["tipo"] != "tratamiento" else 1,
        valor_unitario=total if trat["tipo"] != "tratamiento" else total,
        descuento_porcentaje=0,
        precio_bloqueado=False,
        sesiones_previas_consumidas=sin_detalle,
    )

    # ── 1b. Protocolo de seguimiento (TratamientoPaciente + sesiones) ──────
    # El asistente NO pasa por aceptar_cotizacion, así que hay que crear el
    # protocolo a mano; si no, el panel "Seguimiento de sesiones" no muestra
    # los nombres reales ni el conteo.
    tratamientos_paciente_ids = []
    if trat["tipo"] in ("tratamiento", "procedimiento"):
        from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente
        from apps.protocolos.services import crear_tratamiento_desde_cotizacion

        tp = crear_tratamiento_desde_cotizacion(item)
        if tp is not None:
            tratamientos_paciente_ids.append(str(tp.id))
            if sin_detalle > 0:
                previas = list(
                    SesionProcedimiento.objects.filter(tratamiento=tp)
                    .order_by("tipo_sesion__orden", "numero", "paso__orden", "created_at")[:sin_detalle]
                )
                for s in previas:
                    s.estado = SesionProcedimiento.Estado.COMPLETADO
                    s.fecha = trat.get("fecha_inicio") or None
                    s.observaciones = "Sesión previa a CliniQ (puesta en marcha)"
                    s.save(update_fields=["estado", "fecha", "observaciones", "updated_at"])
                if len(previas) >= item.num_sesiones_efectivas():
                    tp.estado = TratamientoPaciente.Estado.COMPLETADO
                    tp.save(update_fields=["estado", "updated_at"])

    # ── 2. Cobro + pagos previos ────────────────────────────────────────────
    cobro = Cobro.objects.create(
        origen=Cobro.Origen.COTIZACION,
        cotizacion=cotizacion,
        paciente=paciente,
        sede=sede,
        subtotal=pagado,
        descuento=0,
        total=pagado,
        estado=(
            Cobro.Estado.PAGADO if saldo <= 0 and pagado > 0
            else Cobro.Estado.PAGADO_PARCIAL if pagado > 0
            else Cobro.Estado.PENDIENTE
        ),
        notas="Datos previos — puesta en marcha",
        created_by=actor,
        es_migracion=True,
        lote_migracion=lote.id,
    )
    pago_ids = []
    for p in pagos:
        pr = PagoRecibido.objects.create(
            cobro=cobro,
            medio_pago=p["medio_pago"],
            valor=Decimal(p["valor"]),
            referencia="Puesta en marcha",
            fecha=_dt(p["fecha"]),
            recibido_por=actor,
            es_migracion=True,
            lote_migracion=lote.id,
        )
        pago_ids.append(str(pr.id))

    # ── 3. Citas de sesiones ya realizadas (solo las que traen profesional) ──
    cita_ids = []
    for s in realizadas:
        prof_id = s.get("profesional")
        if not prof_id:
            continue
        fecha = s.get("fecha")
        dur = 30
        inicio = _dt(fecha)
        cita = Cita.objects.create(
            paciente=paciente,
            sede=sede,
            servicio_id=s.get("servicio"),
            servicio_nombre=s.get("nombre", "") or trat["descripcion"],
            duracion_min=dur,
            profesional_id=prof_id,
            fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=dur),
            fecha_inicio_real=inicio,
            fecha_fin_real=inicio + timedelta(minutes=dur),
            estado=Cita.Estado.COMPLETADA,
            estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO,
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
            recordatorio_enviado=True,
            created_by=actor,
            item_cotizacion=item,
            notas_internas="Sesión previa a CliniQ (puesta en marcha)",
            es_migracion=True,
            lote_migracion=lote.id,
        )
        cita_ids.append(str(cita.id))

    # ── 4. Cartera + cuotas ────────────────────────────────────────────────
    cartera = Cartera.objects.create(
        cotizacion=cotizacion,
        paciente=paciente,
        total=total,
        es_migracion=True,
        lote_migracion=lote.id,
    )
    cuota_ids = []
    if pagado > 0:
        c = CuotaCartera.objects.create(
            cartera=cartera,
            tipo=(pagos[0]["medio_pago"] if pagos and pagos[0]["medio_pago"] in
                  {"efectivo", "transferencia"} else "efectivo"),
            descripcion="Abono previo (puesta en marcha)",
            valor_esperado=pagado,
            fecha_esperada=pagos[0]["fecha"] if pagos else None,
            pagada=True,
            valor_pagado=pagado,
            fecha_pago=pagos[-1]["fecha"] if pagos else None,
            medio_pago=pagos[0]["medio_pago"] if pagos else "",
            observaciones="Cargado por el asistente de puesta en marcha",
            registrado_por=actor,
        )
        cuota_ids.append(str(c.id))
    for cuota in plan:
        c = CuotaCartera.objects.create(
            cartera=cartera,
            tipo=cuota.get("tipo", "efectivo"),
            descripcion=cuota.get("descripcion", "") or "Saldo pendiente",
            valor_esperado=Decimal(cuota["valor_esperado"]),
            fecha_esperada=cuota.get("fecha_esperada"),
            registrado_por=actor,
        )
        cuota_ids.append(str(c.id))

    lote.manifest = {
        "cotizaciones": [str(cotizacion.id)],
        "items_cotizacion": [str(item.id)],
        "cobros": [str(cobro.id)],
        "pagos": pago_ids,
        "citas": cita_ids,
        "carteras": [str(cartera.id)],
        "cuotas": cuota_ids,
        "tratamientos_paciente": tratamientos_paciente_ids,
        "resumen": {
            "total_pactado": str(total),
            "pagado": str(pagado),
            "saldo": str(saldo),
            "sesiones_total": trat["num_sesiones_total"],
            "sesiones_realizadas": len(realizadas),
            "sesiones_pendientes": trat["num_sesiones_total"] - len(realizadas),
        },
    }
    lote.save(update_fields=["manifest"])
    return lote


@transaction.atomic
def revertir_lote(lote: LoteMigracion, *, actor) -> None:
    if lote.revertido:
        raise ValidationError({"error": "El lote ya fue revertido.", "code": "LOTE_YA_REVERTIDO"})

    m = lote.manifest or {}
    # Orden inverso a la creación para respetar los PROTECT.
    from apps.consentimientos.models import Consentimiento
    from apps.protocolos.models import TratamientoPaciente

    cot_ids = m.get("cotizaciones", [])
    Cita.objects.filter(id__in=m.get("citas", [])).delete()
    TratamientoPaciente.objects.filter(id__in=m.get("tratamientos_paciente", [])).delete()
    # Compromiso de pago generado de forma diferida al abrir el detalle.
    Consentimiento.objects.filter(cotizacion_id__in=cot_ids).delete()
    PagoRecibido.objects.filter(id__in=m.get("pagos", [])).delete()
    CuotaCartera.objects.filter(id__in=m.get("cuotas", [])).delete()
    Cartera.objects.filter(id__in=m.get("carteras", [])).delete()
    Cobro.objects.filter(id__in=m.get("cobros", [])).delete()
    ItemCotizacion.objects.filter(id__in=m.get("items_cotizacion", [])).delete()
    Cotizacion.objects.filter(id__in=cot_ids).delete()

    lote.revertido_en = timezone.now()
    lote.revertido_por = actor
    lote.save(update_fields=["revertido_en", "revertido_por"])
