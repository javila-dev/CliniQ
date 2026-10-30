"""Piezas comunes de las correcciones de soporte sobre una atención (console).

Cada herramienta (trasladar, eliminar) tiene su módulo; aquí está lo que
comparten: qué atenciones se pueden corregir, qué cuelga de ellas, cómo se
devuelve la sesión del paquete, qué se hace con el cobro y cómo queda el registro.
"""

from datetime import timedelta

from django.db.models import Q, Sum
from rest_framework.exceptions import ValidationError

from apps.agenda.models import Cita, CorreccionSoporte

ESTADOS_CORREGIBLES = (Cita.Estado.COMPLETADA, Cita.Estado.EN_CURSO)
MAX_ATENCIONES = 50


def error(mensaje, code):
    raise ValidationError({"error": mensaje, "code": code})


def nombre(user):
    return user.nombre_completo if user else None


def atenciones_del_paciente(paciente) -> list[dict]:
    citas = (
        Cita.objects.filter(paciente=paciente, estado__in=ESTADOS_CORREGIBLES, notas_clinicas__activo=True)
        .select_related("profesional", "sede", "item_cotizacion")
        .distinct()
        .order_by("-fecha_inicio")[:MAX_ATENCIONES]
    )
    trasladadas = set(
        CorreccionSoporte.objects.filter(
            tipo=CorreccionSoporte.Tipo.TRASLADAR_ATENCION, cita__in=citas, paciente_destino=paciente,
        ).values_list("cita_id", flat=True)
    )
    return [
        {
            "id": str(c.id),
            "fecha_inicio": c.fecha_inicio,
            "estado": c.estado,
            "servicio_nombre": c.servicio_nombre,
            "profesional_nombre": nombre(c.profesional),
            "sede_nombre": c.sede.nombre,
            "paquete": c.item_cotizacion.descripcion if c.item_cotizacion_id else None,
            "recibida_por_traslado": c.id in trasladadas,
        }
        for c in citas
    ]


def cita_corregible(cita_id, clinica):
    cita = (
        Cita.objects.select_related("paciente", "profesional", "sede", "item_cotizacion", "item_cotizacion__cotizacion")
        .filter(pk=cita_id, sede__clinica=clinica)
        .first()
    )
    if cita is None:
        error("La atención no existe en esta clínica.", "CITA_NO_ENCONTRADA")
    if cita.estado not in ESTADOS_CORREGIBLES:
        error("Solo se corrigen atenciones en curso o completadas.", "CITA_NO_CORREGIBLE")
    if not cita.notas_clinicas.filter(activo=True).exists():
        error("La cita no tiene atención documentada.", "CITA_SIN_NOTA")
    return cita


def cita_payload(cita) -> dict:
    return {
        "id": str(cita.id),
        "fecha_inicio": cita.fecha_inicio,
        "estado": cita.estado,
        "servicio_nombre": cita.servicio_nombre,
        "profesional_nombre": nombre(cita.profesional),
        "sede_nombre": cita.sede.nombre,
    }


def contenido(cita) -> dict:
    from apps.historia_clinica.models import (
        AnotacionZona, ConsumoInsumo, FotoClinica, OrdenMedica, ResultadoExamen,
    )
    from apps.obesidad.models import MedicionAntropometrica

    nota_ids = list(cita.notas_clinicas.values_list("id", flat=True))
    return {
        "notas": len(nota_ids),
        "fotos": FotoClinica.objects.filter(nota_id__in=nota_ids, activo=True).count(),
        "examenes": ResultadoExamen.objects.filter(nota_id__in=nota_ids, activo=True).count(),
        "ordenes": OrdenMedica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita)).count(),
        "zonas": AnotacionZona.objects.filter(nota_id__in=nota_ids, activo=True).count(),
        "insumos": ConsumoInsumo.objects.filter(nota_id__in=nota_ids, activo=True).count(),
        "mediciones": MedicionAntropometrica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita)).count(),
    }


def sesiones_de_la_cita(cita):
    from apps.protocolos.models import SesionProcedimiento

    return list(
        SesionProcedimiento.objects.filter(cita=cita)
        .select_related("tipo_sesion", "procedimiento", "tratamiento", "profesional")
        .prefetch_related("procedimientos_ejecutados")
    )


def sesion_payload(sesion) -> dict:
    if sesion.tipo_sesion_id:
        titulo = sesion.tipo_sesion.nombre
    elif sesion.procedimiento_id:
        titulo = sesion.procedimiento.nombre
    else:
        titulo = "Sesión"
    return {"id": str(sesion.id), "nombre": titulo, "numero": sesion.numero, "estado": sesion.estado}


def revertir_sesiones(cita, sesiones, *, desligar=True) -> list[str]:
    """La sesión vuelve a pendiente y el paquete recupera el cupo. Con
    `desligar=False` sigue ligada a la cita (la cita vuelve a quedar agendada)."""
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    revertidas = []
    for sesion in sesiones:
        sesion.estado = SesionProcedimiento.Estado.PENDIENTE
        if desligar:
            sesion.cita = None
        sesion.fecha = None
        sesion.hora = None
        if sesion.profesional_id == cita.profesional_id:
            sesion.profesional = None
        sesion.observaciones = ""
        sesion.forzado_sin_consentimiento = False
        sesion.motivo_forzado = ""
        sesion.save(update_fields=[
            "estado", "cita", "fecha", "hora", "profesional", "observaciones",
            "forzado_sin_consentimiento", "motivo_forzado", "updated_at",
        ])
        sesion.procedimientos_ejecutados.clear()
        sesion.consentimientos_verificados.clear()
        tratamiento = sesion.tratamiento
        if tratamiento.estado == TratamientoPaciente.Estado.COMPLETADO:
            tratamiento.estado = TratamientoPaciente.Estado.ACTIVO
            tratamiento.save(update_fields=["estado", "updated_at"])
        revertidas.append(str(sesion.id))
    return revertidas


def cobro_de_la_cita(cita):
    from apps.cobros.models import Cobro

    return Cobro.objects.filter(cita=cita).exclude(estado=Cobro.Estado.ANULADO).select_related("cotizacion").first()


def cobro_payload(cobro, item_origen) -> dict | None:
    if cobro is None:
        return None
    pagado = cobro.pagos.aggregate(t=Sum("valor"))["t"] or 0
    return {
        "id": str(cobro.id),
        "estado": cobro.estado,
        "total": str(cobro.total),
        "pagado": str(pagado),
        # Abono al plan del paquete: anularlo o moverlo cambia lo pagado del plan.
        "cuenta_para_el_plan": bool(item_origen and cobro.cotizacion_id == item_origen.cotizacion_id),
    }


def exigir_accion_cobro(cobro, accion, permitidas):
    if cobro is None:
        return CorreccionSoporte.AccionCobro.SIN_COBRO
    if accion not in permitidas:
        error("La cita tiene un cobro: elige qué hacer con él.", "ACCION_COBRO_REQUERIDA")
    return accion


def aplicar_accion_cobro(cobro, accion, *, destino=None, item_origen=None, item_destino=None):
    from apps.cobros.models import Cobro
    from apps.cobros.services import reversar_pago

    Accion = CorreccionSoporte.AccionCobro
    if cobro is None or accion in {Accion.SIN_COBRO, Accion.MANTENER}:
        return
    if accion == Accion.MOVER:
        cobro.paciente = destino
        if cobro.cotizacion_id and item_origen and cobro.cotizacion_id == item_origen.cotizacion_id:
            cobro.cotizacion = item_destino.cotizacion if item_destino else None
        cobro.save(update_fields=["paciente", "cotizacion", "updated_at"])
    elif accion == Accion.DESLIGAR:
        cobro.cita = None
        cobro.save(update_fields=["cita", "updated_at"])
    elif accion == Accion.ANULAR:
        for pago in list(cobro.pagos.all()):
            reversar_pago(cobro=cobro, pago=pago)
        Cobro.objects.filter(pk=cobro.pk).update(estado=Cobro.Estado.ANULADO)


def avisos_comunes(cita) -> list[dict]:
    """Lo que la corrección no cambia y conviene que soporte sepa antes de confirmar."""
    from apps.consentimientos.models import Consentimiento
    from apps.historia_clinica.models import ConsentimientoInformado
    from apps.notificaciones.models import EnvioWhatsApp
    from apps.pacientes.models import CheckIn
    from apps.protocolos.models import ConsentimientoPaciente

    paciente = cita.paciente
    avisos = []
    documentos = [
        *(c.documenso_template_nombre or "Consentimiento informado" for c in ConsentimientoInformado.objects.filter(cita=cita)),
        *(c.template_nombre or "Consentimiento" for c in ConsentimientoPaciente.objects.filter(cita=cita)),
        *("Documento firmado de la cita" for _ in Consentimiento.objects.filter(cita=cita)),
    ]
    if documentos:
        avisos.append({
            "code": "DOCUMENTOS_FIRMADOS",
            "texto": f"Lo que firmó {paciente.nombre_completo} se conserva en su historia: {', '.join(documentos)}.",
        })
    if cita.checkin_metodo or CheckIn.objects.filter(cita=cita).exists():
        avisos.append({
            "code": "CHECKIN",
            "texto": f"El check-in de la cita se hizo con la identidad de {paciente.nombre_completo}.",
        })
    if cita.firma_asistencia_estado == Cita.FirmaAsistenciaEstado.FIRMADA:
        avisos.append({
            "code": "FIRMA_ASISTENCIA",
            "texto": f"La firma de asistencia es un PDF a nombre de {paciente.nombre_completo}; no se cambia.",
        })
    desde = cita.fecha_inicio_real or cita.fecha_inicio
    envios = EnvioWhatsApp.objects.filter(paciente=paciente, created_at__gte=desde, created_at__lte=desde + timedelta(days=2))
    if envios.exists():
        tipos = sorted({e.get_tipo_display() for e in envios})
        avisos.append({
            "code": "WHATSAPP_ENVIADOS",
            "texto": f"Después de la atención se le enviaron WhatsApp a {paciente.nombre_completo}: {', '.join(tipos)}. No se pueden deshacer.",
        })
    return avisos


def registrar(
    request, *, clinica, tipo, cita, paciente, accion_cobro, motivo, usuario, resumen,
    paciente_destino=None, item_origen=None, item_destino=None, detalle=None,
) -> CorreccionSoporte:
    from apps.core.logging import registrar_accion

    correccion = CorreccionSoporte.objects.create(
        clinica=clinica, tipo=tipo, cita=cita, paciente=paciente, paciente_destino=paciente_destino,
        item_origen=item_origen, item_destino=item_destino, accion_cobro=accion_cobro,
        motivo=motivo, resumen=resumen, realizado_por=usuario,
    )
    accion = {
        CorreccionSoporte.Tipo.TRASLADAR_ATENCION: "cita.trasladar",
        CorreccionSoporte.Tipo.ELIMINAR_ATENCION: "cita.eliminar_atencion",
        CorreccionSoporte.Tipo.CORREGIR_SESIONES_PREVIAS: "cotizacion.corregir_sesiones_previas",
    }[tipo]
    registrar_accion(
        request, accion, cita or item_origen,
        {
            "paciente_nombre": paciente.nombre_completo,
            "paciente_id": str(paciente.id),
            "accion_cobro": accion_cobro,
            "motivo": motivo,
            "correccion_id": str(correccion.id),
            **(detalle or {}),
        },
        clinica=clinica, actor=usuario,
    )
    return correccion


def correcciones_de_la_clinica(clinica, tipo=None, limite=20) -> list[dict]:
    qs = CorreccionSoporte.objects.filter(clinica=clinica).select_related(
        "cita", "paciente", "paciente_destino", "realizado_por", "item_origen",
    )
    if tipo:
        qs = qs.filter(tipo=tipo)
    return [
        {
            "id": str(c.id),
            "tipo": c.tipo,
            "cita_id": str(c.cita_id) if c.cita_id else None,
            "fecha_atencion": c.cita.fecha_inicio if c.cita_id else None,
            "paquete": c.item_origen.descripcion if c.item_origen_id else c.resumen.get("paquete"),
            "paciente": c.paciente.nombre_completo,
            "paciente_destino": c.paciente_destino.nombre_completo if c.paciente_destino_id else None,
            "accion_cobro": c.accion_cobro,
            "estado_cita": c.resumen.get("estado_cita"),
            "sesiones_antes": c.resumen.get("sesiones_antes"),
            "sesiones_despues": c.resumen.get("sesiones_despues"),
            "motivo": c.motivo,
            "realizado_por": nombre(c.realizado_por),
            "created_at": c.created_at,
        }
        for c in qs[:limite]
    ]
