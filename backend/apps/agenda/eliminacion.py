"""Eliminar una atención que no debió existir (soporte, console).

Para una atención abierta por error: el paciente no vino, se documentó dos veces,
era una prueba. Se borra lo clínico de la atención (nota, fotos, exámenes,
órdenes, zonas, mediciones), los insumos vuelven al stock y el paquete recupera
la sesión. La cita no se borra: queda cancelada, como no asistió o de nuevo
agendada, según lo que pasó. Antes de borrar se guarda una copia de todo en la
corrección, para poder explicarlo después; los archivos no se borran del storage.

Lo que el paciente firmó (consentimientos, asistencia) se conserva: son
documentos suyos aunque la atención no cuente.
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.agenda import soporte
from apps.agenda.models import Cita, CorreccionSoporte
from apps.agenda.soporte import error

ACCIONES_COBRO = {
    CorreccionSoporte.AccionCobro.MANTENER,
    CorreccionSoporte.AccionCobro.DESLIGAR,
    CorreccionSoporte.AccionCobro.ANULAR,
}
ESTADOS_RESULTANTES = (Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO, Cita.Estado.PENDIENTE)


def _cupo(item, *, libera: bool) -> dict | None:
    """Sesiones libres del paquete antes y después de eliminar."""
    if item is None:
        return None
    antes = item.citas_restantes()
    return {
        "descripcion": item.descripcion,
        "restantes_antes": antes,
        # Cancelada o no asistió: la cita deja de ocupar cupo. Pendiente: lo sigue ocupando.
        "restantes_despues": antes + 1 if libera else antes,
    }


def previsualizar(clinica, cita_id) -> dict:
    cita = soporte.cita_corregible(cita_id, clinica)
    item = cita.item_cotizacion
    avisos = soporte.avisos_comunes(cita)
    if cita.estado == Cita.Estado.EN_CURSO:
        avisos.append({
            "code": "ATENCION_EN_CURSO",
            "texto": "La atención sigue en curso: el profesional pierde lo que lleva documentado.",
        })
    return {
        "cita": soporte.cita_payload(cita),
        "paciente": {"id": str(cita.paciente_id), "nombre": cita.paciente.nombre_completo},
        "contenido": soporte.contenido(cita),
        "sesiones": [soporte.sesion_payload(s) for s in soporte.sesiones_de_la_cita(cita)],
        "paquete": {
            "cancelada": _cupo(item, libera=True),
            "pendiente": _cupo(item, libera=False),
        } if item else None,
        "cobro": soporte.cobro_payload(soporte.cobro_de_la_cita(cita), item),
        "avisos": avisos,
    }


def _ruta(archivo):
    return archivo.name if archivo else None


def _copia(cita, notas) -> dict:
    """Todo lo que se va a borrar, en texto: queda guardado en la corrección."""
    from django.forms.models import model_to_dict

    from apps.historia_clinica.models import ConsumoInsumo, FotoClinica, OrdenMedica, ResultadoExamen
    from apps.obesidad.models import MedicionAntropometrica, TratamientoFarmacologico

    nota_ids = [n.id for n in notas]
    # Campos sueltos de una medición o un tratamiento: fechas y decimales como texto.
    plano = lambda obj: {k: (str(v) if v is not None else None) for k, v in model_to_dict(obj).items()}
    return {
        "notas": [
            {
                "id": str(n.id),
                "estado": n.estado,
                "motivo_consulta": n.motivo_consulta,
                "plan_manejo": n.plan_manejo,
                "creada": n.created_at.isoformat(),
                "zonas": [
                    {"diagrama": a.diagrama.nombre, "texto": a.texto, "tipo_aplicacion": a.tipo_aplicacion}
                    for a in n.anotaciones_zona.filter(activo=True).select_related("diagrama")
                ],
            }
            for n in notas
        ],
        "fotos": [
            {"tipo": f.tipo, "zona": f.zona, "descripcion": f.descripcion, "archivo": _ruta(f.archivo)}
            for f in FotoClinica.objects.filter(nota_id__in=nota_ids)
        ],
        "examenes": [
            {
                "titulo": e.titulo,
                "fecha": str(e.fecha),
                "descripcion": e.descripcion,
                "activo": e.activo,
                "cargado_por": e.created_by.nombre_completo if e.created_by_id else None,
                "archivos": [
                    {
                        "nombre": a.nombre,
                        "archivo": _ruta(a.archivo),
                        "subido_por": a.subido_por.nombre_completo if a.subido_por_id else None,
                        "activo": a.activo,
                    }
                    for a in e.archivos.all()
                ],
            }
            for e in ResultadoExamen.objects.filter(nota_id__in=nota_ids)
            .select_related("created_by")
            .prefetch_related("archivos__subido_por")
        ],
        "ordenes": [
            {"titulo": o.titulo, "contenido": o.contenido, "creada": o.created_at.isoformat()}
            for o in OrdenMedica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita))
        ],
        "insumos": [
            {"insumo": c.insumo.nombre, "cantidad": str(c.cantidad), "activo": c.activo}
            for c in ConsumoInsumo.objects.filter(nota_id__in=nota_ids).select_related("insumo")
        ],
        "mediciones": [plano(m) for m in MedicionAntropometrica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita))],
        "tratamientos_farmacologicos": [plano(t) for t in TratamientoFarmacologico.objects.filter(nota_id__in=nota_ids)],
    }


def eliminar(
    clinica, cita_id, *, estado_cita, accion_cobro=None, motivo, usuario, request=None,
) -> CorreccionSoporte:
    from apps.agenda.confirmacion import crear_registro_confirmacion
    from apps.historia_clinica.models import ConsumoInsumo, FotoClinica, NotaClinica, OrdenMedica, ResultadoExamen
    from apps.historia_clinica.services import eliminar_consumo_insumo
    from apps.obesidad.models import MedicionAntropometrica, TratamientoFarmacologico

    motivo = (motivo or "").strip()
    if not motivo:
        error("Escribe el motivo.", "MOTIVO_REQUERIDO")
    if estado_cita not in ESTADOS_RESULTANTES:
        error("Elige cómo queda la cita.", "ESTADO_CITA_REQUERIDO")

    with transaction.atomic():
        Cita.objects.select_for_update().filter(pk=cita_id).first()
        cita = soporte.cita_corregible(cita_id, clinica)
        paciente = cita.paciente
        item = cita.item_cotizacion
        cobro = soporte.cobro_de_la_cita(cita)
        accion_cobro = soporte.exigir_accion_cobro(cobro, accion_cobro, ACCIONES_COBRO)

        notas = list(cita.notas_clinicas.select_for_update())
        nota_ids = [n.id for n in notas]
        contenido = soporte.contenido(cita)
        copia = _copia(cita, notas)

        # Los insumos vuelven al stock (queda el movimiento de ajuste en el kardex).
        for consumo in ConsumoInsumo.objects.filter(nota_id__in=nota_ids, activo=True):
            eliminar_consumo_insumo(consumo, usuario)

        # Lo clínico se borra; los archivos se quedan en el storage (rutas en la copia).
        FotoClinica.objects.filter(nota_id__in=nota_ids).delete()
        ResultadoExamen.objects.filter(nota_id__in=nota_ids).delete()
        OrdenMedica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita)).delete()
        MedicionAntropometrica.objects.filter(Q(nota_id__in=nota_ids) | Q(cita=cita)).delete()
        TratamientoFarmacologico.objects.filter(nota_id__in=nota_ids).delete()
        ConsumoInsumo.objects.filter(nota_id__in=nota_ids).delete()
        NotaClinica.objects.filter(id__in=nota_ids).delete()

        # El paquete recupera la sesión. Si la cita vuelve a quedar agendada, la
        # sesión sigue ligada a ella y se completa cuando sí se atienda.
        sigue_agendada = estado_cita == Cita.Estado.PENDIENTE
        revertidas = soporte.revertir_sesiones(cita, soporte.sesiones_de_la_cita(cita), desligar=not sigue_agendada)

        cita.estado = estado_cita
        cita.fecha_inicio_real = None
        cita.fecha_fin_real = None
        update_fields = ["estado", "fecha_inicio_real", "fecha_fin_real", "updated_at"]
        if estado_cita == Cita.Estado.CANCELADA:
            cita.motivo_cancelacion = f"Atención eliminada por soporte: {motivo}"
            update_fields.append("motivo_cancelacion")
        cita.save(update_fields=update_fields)
        if not sigue_agendada:
            crear_registro_confirmacion(
                cita=cita, estado_resultante=estado_cita, usuario=usuario, medio="",
                nota=f"Atención eliminada por soporte: {motivo}",
            )

        soporte.aplicar_accion_cobro(cobro, accion_cobro)

        resumen = {
            "estado_cita": estado_cita,
            "contenido": contenido,
            "sesiones_revertidas": revertidas,
            "cobro": str(cobro.id) if cobro else None,
            "copia": copia,
            "eliminada_en": timezone.now().isoformat(),
        }
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.ELIMINAR_ATENCION, cita=cita, paciente=paciente,
            item_origen=item, accion_cobro=accion_cobro, motivo=motivo, usuario=usuario, resumen=resumen,
            detalle={
                "estado_cita": estado_cita,
                "paquete": item.descripcion if item else None,
                "contenido": contenido,
                "sesiones_revertidas": revertidas,
            },
        )
