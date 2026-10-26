"""Trasladar una atención documentada en el paciente equivocado (soporte, console).

El profesional abrió la cita del paciente A cuando atendía al paciente B. La cita
conserva su id (sus notas, cobro y documentos siguen colgando de ella) y pasa a B
con todo su contenido clínico. A recupera la sesión que se le descontó. Lo que A
firmó o verificó con su identidad (consentimientos, check-in, firma de asistencia)
se queda en A: es un documento de A, no de esta atención.

Dos pasos, como en la pantalla: `previsualizar` dice qué va a pasar y qué opciones
hay; `trasladar` lo hace todo en una transacción.
"""

from django.db import transaction
from django.db.models import Q

from apps.agenda import soporte
from apps.agenda.models import Cita, CorreccionSoporte
from apps.agenda.soporte import error

ACCIONES_COBRO = {
    CorreccionSoporte.AccionCobro.MOVER,
    CorreccionSoporte.AccionCobro.DESLIGAR,
    CorreccionSoporte.AccionCobro.ANULAR,
}


def _destino(paciente_id, clinica, cita):
    from apps.pacientes.models import Paciente

    destino = Paciente.objects.filter(pk=paciente_id, clinica=clinica).first()
    if destino is None:
        error("El paciente destino no existe en esta clínica.", "PACIENTE_NO_ENCONTRADO")
    if destino.id == cita.paciente_id:
        error("El paciente destino es el mismo de la atención.", "MISMO_PACIENTE")
    return destino


def _items_compatibles(cita, destino) -> list[dict]:
    """Paquetes de B donde puede contar esta atención: mismo tratamiento (o mismo
    procedimiento) que el de A y con sesiones libres."""
    from apps.cotizaciones.models import Cotizacion, ItemCotizacion
    from apps.protocolos.models import SesionProcedimiento
    from apps.protocolos.services import verificar_consentimientos_sesion

    item_a = cita.item_cotizacion
    tratamiento_id = item_a.tratamiento_id if item_a else None
    procedimiento_id = (item_a.procedimiento_id if item_a else None) or cita.servicio_id
    if not tratamiento_id and not procedimiento_id:
        return []

    tipo_sesion_a = next((s.tipo_sesion_id for s in soporte.sesiones_de_la_cita(cita) if s.tipo_sesion_id), None)
    items = ItemCotizacion.objects.filter(
        cotizacion__paciente=destino, cotizacion__estado=Cotizacion.Estado.ACEPTADA, activo=True,
    ).select_related("cotizacion")
    if tratamiento_id:
        items = items.filter(tratamiento_id=tratamiento_id)
    else:
        items = items.filter(procedimiento_id=procedimiento_id)

    resultado = []
    for item in items:
        if not item.tiene_cupo_propio or item.citas_restantes() <= 0:
            continue
        sesiones = []
        if item.tratamiento_id:
            pendientes = SesionProcedimiento.objects.filter(
                tratamiento__cotizacion_item=item, estado=SesionProcedimiento.Estado.PENDIENTE, cita__isnull=True,
            ).select_related("tipo_sesion", "procedimiento", "tratamiento__paciente")
            for s in pendientes:
                datos = soporte.sesion_payload(s)
                # Solo la primera pendiente del mismo tipo: es la que se sugiere.
                datos["misma_sesion"] = bool(
                    tipo_sesion_a and s.tipo_sesion_id == tipo_sesion_a
                    and not any(x["misma_sesion"] for x in sesiones)
                )
                datos["consentimientos_faltantes"] = [
                    f"{f['template_nombre'] or 'Consentimiento'} de {f['procedimiento']}"
                    for f in verificar_consentimientos_sesion(s)
                ]
                sesiones.append(datos)
            if not sesiones:
                continue
        resultado.append({
            "id": str(item.id),
            "descripcion": item.descripcion,
            "cotizacion_id": str(item.cotizacion_id),
            "aceptada_en": item.cotizacion.aceptada_en,
            "sesiones_restantes": item.citas_restantes(),
            "sesiones": sesiones,
        })
    return resultado


def _avisos(cita) -> list[dict]:
    from apps.pacientes.models import AntecedentePaciente

    avisos = soporte.avisos_comunes(cita)
    origen = cita.paciente
    dia = (cita.fecha_inicio_real or cita.fecha_inicio).date()
    sin_vinculo = []
    if AntecedentePaciente.objects.filter(paciente=origen, updated_at__date=dia).exists():
        sin_vinculo.append("antecedentes")
    if sin_vinculo:
        avisos.append({
            "code": "REGISTROS_SIN_VINCULO",
            "texto": (
                f"Ese día también cambiaron {' y '.join(sin_vinculo)} de {origen.nombre_completo}. No están ligados "
                "a la atención y no se trasladan: revísalos a mano."
            ),
        })
    if cita.estado == Cita.Estado.EN_CURSO:
        avisos.append({
            "code": "ATENCION_EN_CURSO",
            "texto": "La atención sigue en curso: la sesión de destino queda ligada y se completa al cerrarla.",
        })
    return avisos


def previsualizar(clinica, cita_id, paciente_destino_id) -> dict:
    cita = soporte.cita_corregible(cita_id, clinica)
    destino = _destino(paciente_destino_id, clinica, cita)
    item_a = cita.item_cotizacion
    return {
        "cita": soporte.cita_payload(cita),
        "origen": {"id": str(cita.paciente_id), "nombre": cita.paciente.nombre_completo},
        "destino": {"id": str(destino.id), "nombre": destino.nombre_completo},
        "contenido": soporte.contenido(cita),
        "paquete_origen": item_a.descripcion if item_a else None,
        "sesiones_origen": [soporte.sesion_payload(s) for s in soporte.sesiones_de_la_cita(cita)],
        "paquetes_destino": _items_compatibles(cita, destino),
        "cobro": soporte.cobro_payload(soporte.cobro_de_la_cita(cita), item_a),
        "avisos": _avisos(cita),
    }


def trasladar(
    clinica, cita_id, paciente_destino_id, *, item_destino_id=None, sesion_destino_id=None,
    accion_cobro=None, motivo, usuario, request=None,
) -> CorreccionSoporte:
    from apps.consentimientos.models import Consentimiento
    from apps.cotizaciones.models import ItemCotizacion
    from apps.historia_clinica.models import (
        ConsentimientoInformado, HistoriaClinica, OrdenMedica, OrdenMedicaAuditoria, ResultadoExamen,
    )
    from apps.obesidad.models import MedicionAntropometrica
    from apps.pacientes.models import CheckIn
    from apps.protocolos.models import ConsentimientoPaciente, SesionProcedimiento
    from apps.protocolos.services import marcar_sesion_completada, procedimientos_requeridos_sesion
    from apps.seguimiento.models import Oportunidad

    motivo = (motivo or "").strip()
    if not motivo:
        error("Escribe el motivo del traslado.", "MOTIVO_REQUERIDO")

    with transaction.atomic():
        Cita.objects.select_for_update().filter(pk=cita_id).first()
        cita = soporte.cita_corregible(cita_id, clinica)
        destino = _destino(paciente_destino_id, clinica, cita)
        origen = cita.paciente
        item_origen = cita.item_cotizacion

        # Paquete y sesión de B: solo entre los que ofrece la vista previa.
        compatibles = {i["id"]: i for i in _items_compatibles(cita, destino)}
        item_destino = sesion_destino = None
        if item_destino_id:
            opcion = compatibles.get(str(item_destino_id))
            if opcion is None:
                error("Ese paquete del paciente destino no está disponible.", "PAQUETE_NO_DISPONIBLE")
            item_destino = ItemCotizacion.objects.select_for_update().select_related("cotizacion").get(pk=item_destino_id)
            if opcion["sesiones"]:
                if str(sesion_destino_id or "") not in {s["id"] for s in opcion["sesiones"]}:
                    error("Elige la sesión del paquete donde cuenta la atención.", "SESION_REQUERIDA")
                sesion_destino = SesionProcedimiento.objects.select_for_update().get(pk=sesion_destino_id)
        elif sesion_destino_id:
            error("La sesión debe ser de un paquete del paciente destino.", "PAQUETE_REQUERIDO")

        cobro = soporte.cobro_de_la_cita(cita)
        accion_cobro = soporte.exigir_accion_cobro(cobro, accion_cobro, ACCIONES_COBRO)

        historia_destino = HistoriaClinica.del_paciente(destino)
        notas = list(cita.notas_clinicas.select_for_update())
        nota_ids = [n.id for n in notas]
        contenido = soporte.contenido(cita)

        # Contenido clínico: pasa a la historia de B.
        for nota in notas:
            nota.historia = historia_destino
            if nota.cotizacion_id and item_origen and nota.cotizacion_id == item_origen.cotizacion_id:
                nota.cotizacion = item_destino.cotizacion if item_destino else None
            nota.save(update_fields=["historia", "cotizacion", "updated_at"])
        ResultadoExamen.objects.filter(nota_id__in=nota_ids).update(historia=historia_destino)
        ordenes = list(OrdenMedica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita)))
        OrdenMedica.objects.filter(id__in=[o.id for o in ordenes]).update(historia=historia_destino)
        OrdenMedicaAuditoria.objects.bulk_create([
            OrdenMedicaAuditoria(
                orden=o, accion="traslado", usuario=usuario,
                descripcion=f"Trasladada de {origen.nombre_completo} a {destino.nombre_completo}: {motivo}",
            )
            for o in ordenes
        ])
        MedicionAntropometrica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita)).update(paciente=destino)

        # Lo que A firmó o verificó con su identidad se queda en A, sin la cita.
        ConsentimientoInformado.objects.filter(cita=cita).update(cita=None)
        ConsentimientoPaciente.objects.filter(cita=cita).update(cita=None)
        # Uno sin cotización no puede quedar sin cita (constraint): sigue ligado.
        Consentimiento.objects.filter(cita=cita, cotizacion__isnull=False).update(cita=None)
        CheckIn.objects.filter(cita=cita).update(cita=None)
        Oportunidad.objects.filter(cita=cita, paciente=origen).update(cita=None)

        # A recupera la sesión.
        sesiones_origen = soporte.sesiones_de_la_cita(cita)
        datos_sesion = sesiones_origen[0] if sesiones_origen else None
        procedimientos = list(datos_sesion.procedimientos_ejecutados.all()) if datos_sesion else []
        fecha = datos_sesion.fecha if datos_sesion else None
        hora = datos_sesion.hora if datos_sesion else None
        observaciones = datos_sesion.observaciones if datos_sesion else ""
        revertidas = soporte.revertir_sesiones(cita, sesiones_origen)

        cita.paciente = destino
        cita.canal_confirmacion = destino.canal_confirmacion
        cita.item_cotizacion = item_destino
        cita.save(update_fields=["paciente", "canal_confirmacion", "item_cotizacion", "updated_at"])

        # B: la sesión de su paquete.
        if sesion_destino is not None:
            if cita.estado == Cita.Estado.COMPLETADA:
                permitidos = {p.id for p in procedimientos_requeridos_sesion(sesion_destino)}
                marcar_sesion_completada(
                    sesion_destino,
                    cita=cita,
                    profesional=cita.profesional,
                    observaciones=observaciones,
                    fecha=fecha or (cita.fecha_inicio_real or cita.fecha_inicio).date(),
                    hora=hora,
                    procedimientos_ejecutados=[p for p in procedimientos if p.id in permitidos] or None,
                    forzar_sin_consentimiento=True,
                    motivo=f"Traslado de atención: {motivo}",
                )
            else:
                sesion_destino.cita = cita
                sesion_destino.save(update_fields=["cita", "updated_at"])

        soporte.aplicar_accion_cobro(
            cobro, accion_cobro, destino=destino, item_origen=item_origen, item_destino=item_destino,
        )

        resumen = {
            "contenido": contenido,
            "sesiones_revertidas": revertidas,
            "sesion_destino": str(sesion_destino.id) if sesion_destino else None,
            "cobro": str(cobro.id) if cobro else None,
            "ordenes": [str(o.id) for o in ordenes],
        }
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.TRASLADAR_ATENCION, cita=cita, paciente=origen,
            paciente_destino=destino, item_origen=item_origen, item_destino=item_destino,
            accion_cobro=accion_cobro, motivo=motivo, usuario=usuario, resumen=resumen,
            detalle={
                "paciente_destino": destino.nombre_completo,
                "paciente_destino_id": str(destino.id),
                "paquete_origen": item_origen.descripcion if item_origen else None,
                "paquete_destino": item_destino.descripcion if item_destino else None,
                **resumen,
            },
        )
