import logging
import random
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.agenda.models import BloqueoAgenda, Cita, CitaCheckinOTP
from apps.clinicas.models import Sede
from apps.colaboradores.models import HorarioColaborador
from apps.notificaciones.models import EnvioWhatsApp
from apps.notificaciones.services import (
    WhatsAppNoDisponibleError,
    enviar_whatsapp,
    resolver_ruta_whatsapp,
)

logger = logging.getLogger(__name__)


class AgendaError(Exception):
    code = "AGENDA_ERROR"

    def __init__(self, message, *, code=None, extra=None):
        super().__init__(message)
        if code:
            self.code = code
        self.extra = extra or {}


DIAS_SEMANA = {
    0: "lunes",
    1: "martes",
    2: "miercoles",
    3: "jueves",
    4: "viernes",
    5: "sabado",
    6: "domingo",
}


def calcular_fecha_fin(fecha_inicio: datetime, duracion_min: int) -> datetime:
    return fecha_inicio + timedelta(minutes=duracion_min)


def obtener_rango_ocupado(cita: Cita) -> tuple[datetime, datetime]:
    if cita.estado == Cita.Estado.EN_CURSO and cita.fecha_inicio_real and cita.duracion_min:
        inicio = cita.fecha_inicio_real
        fin = calcular_fecha_fin(inicio, cita.duracion_min)
        return inicio, fin
    return cita.fecha_inicio, cita.fecha_fin


def _rangos_citas_ocupadas(profesional_id, desde, hasta, excluir_cita_id=None) -> list[tuple[datetime, datetime]]:
    """Rangos que ocupan las citas del profesional entre `desde` y `hasta`.

    Solo trae las citas de esa ventana (antes recorría todo el historial por
    cada horario). Una cita en curso ocupa desde su inicio real, que puede no
    coincidir con la hora agendada.
    """
    citas = (
        Cita.objects.filter(profesional_id=profesional_id)
        # Una cita "no asistió" ya no ocupa el horario: se puede atender a otro (AG-10).
        .exclude(estado__in=[Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO])
        .filter(
            Q(fecha_inicio__lt=hasta, fecha_fin__gt=desde)
            | Q(
                estado=Cita.Estado.EN_CURSO,
                fecha_inicio_real__lt=hasta,
                fecha_inicio_real__gt=desde - timedelta(days=1),
            )
        )
        .only("id", "estado", "fecha_inicio", "fecha_fin", "fecha_inicio_real", "duracion_min")
    )
    if excluir_cita_id:
        citas = citas.exclude(id=excluir_cita_id)
    return [obtener_rango_ocupado(cita) for cita in citas]


def bloqueos_aplicables(profesional_id, sede, desde, hasta):
    """Bloqueos aprobados que se cruzan con [desde, hasta) y afectan a ese
    profesional en esa sede: los suyos, los de toda la sede y los de toda la
    clínica. Un bloqueo de varios días cuenta en todos sus días."""
    alcance = Q(profesional_id=profesional_id)
    if sede is not None:
        alcance |= Q(profesional__isnull=True, sede_id=sede.id)
        alcance |= Q(profesional__isnull=True, sede__isnull=True, clinica_id=sede.clinica_id)
    return BloqueoAgenda.objects.filter(
        alcance,
        estado=BloqueoAgenda.Estado.APROBADO,
        fecha_inicio__lt=hasta,
        fecha_fin__gt=desde,
    )


def rango_bloqueado(profesional_id, sede, fecha_inicio, fecha_fin) -> bool:
    return bloqueos_aplicables(profesional_id, sede, fecha_inicio, fecha_fin).exists()


def _se_cruza(rangos, inicio, fin) -> bool:
    return any(r_ini < fin and r_fin > inicio for r_ini, r_fin in rangos)


def verificar_disponibilidad_profesional(profesional_id, fecha_inicio, fecha_fin, excluir_cita_id=None, sede=None) -> bool:
    """El profesional no tiene otra cita ni un bloqueo en ese rango. Con `sede`
    también cuentan los bloqueos de la sede y de la clínica."""
    if _se_cruza(_rangos_citas_ocupadas(profesional_id, fecha_inicio, fecha_fin, excluir_cita_id), fecha_inicio, fecha_fin):
        return False
    return not rango_bloqueado(profesional_id, sede, fecha_inicio, fecha_fin)


def verificar_horario_sede(sede: Sede, fecha_inicio: datetime, fecha_fin: datetime) -> bool:
    # El horario de la sede está en hora local: una cita de las 19:00 en UTC ya
    # cae al día siguiente y quedaba "fuera del horario".
    fecha_inicio = timezone.localtime(fecha_inicio)
    fecha_fin = timezone.localtime(fecha_fin)
    key_dia = DIAS_SEMANA.get(fecha_inicio.weekday())
    rango = sede.horario.get(key_dia)
    if not rango or len(rango) != 2:
        return False

    hora_inicio = datetime.strptime(rango[0], "%H:%M").time()
    hora_fin = datetime.strptime(rango[1], "%H:%M").time()

    inicio_habil = timezone.make_aware(datetime.combine(fecha_inicio.date(), hora_inicio), timezone.get_current_timezone())
    fin_habil = timezone.make_aware(datetime.combine(fecha_fin.date(), hora_fin), timezone.get_current_timezone())

    return inicio_habil <= fecha_inicio and fecha_fin <= fin_habil


def proximo_dia_habil_sede(sede: Sede, desde):
    """Primer día después de `desde` en que la sede tiene horario definido.

    Si la sede no trabaja mañana (p. ej. no abre los viernes), el próximo día
    hábil puede caer varios días después (de viernes a lunes).
    """
    candidato = desde + timedelta(days=1)
    for _ in range(14):
        key_dia = DIAS_SEMANA.get(candidato.weekday())
        rango = sede.horario.get(key_dia)
        if rango and len(rango) == 2:
            return candidato
        candidato += timedelta(days=1)
    return desde + timedelta(days=1)


def citas_sin_confirmar_proximo_dia_habil(clinica, sede_ids=None, profesional_ids=None) -> dict:
    """Citas sin confirmar del próximo día que cada sede trabaja (normalmente
    mañana; si la sede no abre mañana, del siguiente día hábil de esa sede).

    `sede_ids` / `profesional_ids` (None = sin filtro) acotan el conteo a lo que
    el usuario ve en la agenda; si no, el aviso cuenta citas que no aparecen.
    """
    hoy = timezone.localdate()
    sedes_qs = Sede.objects.filter(clinica=clinica)
    if sede_ids is not None:
        sedes_qs = sedes_qs.filter(id__in=sede_ids)
    sedes = list(sedes_qs)

    condiciones = Q()
    fechas_objetivo = set()
    for sede in sedes:
        fecha = proximo_dia_habil_sede(sede, hoy)
        fechas_objetivo.add(fecha)
        condiciones |= Q(sede=sede, fecha_inicio__date=fecha)

    if not fechas_objetivo:
        return {"total": 0, "fecha_desde": None, "fecha_hasta": None}

    citas = Cita.objects.filter(condiciones, estado__in=[Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA])
    if profesional_ids:
        citas = citas.filter(profesional_id__in=profesional_ids)
    total = citas.exclude(estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO).count()
    return {
        "total": total,
        "fecha_desde": min(fechas_objetivo),
        "fecha_hasta": max(fechas_objetivo),
    }


NO_ATIENDE = "no_atiende"


def obtener_rango_horario_profesional(profesional_id, sede_id, fecha):
    """Horario especial del profesional ese día en la sede.

    None = no tiene horario especial (atiende en el horario de la sede);
    NO_ATIENDE = ese día no atiende en esa sede; si no, (inicio, fin).
    """
    horario = (
        HorarioColaborador.objects.select_related("colaborador")
        .filter(
            colaborador__user_id=profesional_id,
            sede_id=sede_id,
            dia_semana=DIAS_SEMANA.get(fecha.weekday()),
            activo=True,
        )
        .first()
    )
    if not horario:
        return None
    if horario.no_atiende:
        return NO_ATIENDE

    tz = timezone.get_current_timezone()
    return (
        timezone.make_aware(datetime.combine(fecha, horario.hora_inicio), tz),
        timezone.make_aware(datetime.combine(fecha, horario.hora_fin), tz),
    )


def verificar_horario_profesional(profesional_id, sede_id, fecha_inicio: datetime, fecha_fin: datetime) -> bool:
    fecha_inicio = timezone.localtime(fecha_inicio)
    fecha_fin = timezone.localtime(fecha_fin)
    rango_profesional = obtener_rango_horario_profesional(profesional_id, sede_id, fecha_inicio.date())
    if rango_profesional is None:
        return True
    if rango_profesional == NO_ATIENDE:
        return False
    inicio_habil, fin_habil = rango_profesional
    return inicio_habil <= fecha_inicio and fecha_fin <= fin_habil


def get_slots_disponibles(profesional_id, sede_id, fecha, duracion_min: int, excluir_cita_id=None) -> list[datetime]:
    """Horarios libres del profesional en la sede. `excluir_cita_id`: al editar
    una cita, su propio horario no cuenta como ocupado."""
    sede = Sede.objects.select_related("clinica").get(id=sede_id)
    key_dia = DIAS_SEMANA.get(fecha.weekday())
    rango = sede.horario.get(key_dia)
    if not rango or len(rango) != 2:
        return []

    hora_inicio = datetime.strptime(rango[0], "%H:%M").time()
    hora_fin = datetime.strptime(rango[1], "%H:%M").time()
    intervalo_min = sede.clinica.slot_interval_min or duracion_min
    tz = timezone.get_current_timezone()
    actual = timezone.make_aware(datetime.combine(fecha, hora_inicio), tz)
    limite = timezone.make_aware(datetime.combine(fecha, hora_fin), tz)

    rango_profesional = obtener_rango_horario_profesional(profesional_id, sede_id, fecha)
    if rango_profesional == NO_ATIENDE:
        return []
    if rango_profesional:
        actual, limite = rango_profesional

    # Citas y bloqueos del día se leen una sola vez, no por cada horario.
    # Los bloqueos incluyen los de varios días que empezaron antes.
    ocupados = _rangos_citas_ocupadas(profesional_id, actual, limite, excluir_cita_id)
    ocupados += list(bloqueos_aplicables(profesional_id, sede, actual, limite).values_list("fecha_inicio", "fecha_fin"))

    slots = []
    while actual + timedelta(minutes=duracion_min) <= limite:
        fin = calcular_fecha_fin(actual, duracion_min)
        if not _se_cruza(ocupados, actual, fin) and verificar_horario_sede(sede, actual, fin):
            slots.append(actual)
        actual = actual + timedelta(minutes=intervalo_min)

    return slots


def duracion_de_sesion(sesion) -> tuple[int, str]:
    """Duración y nombre de una sesión de tratamiento: la de su tipo de sesión, la
    suma de los procedimientos del tipo o la de su procedimiento. (0, "") si no
    se puede resolver."""
    from django.db.models import Sum

    tipo = sesion.tipo_sesion
    if tipo:
        duracion = tipo.duracion_min or 0
        if not duracion:
            duracion = tipo.procedimientos.filter(activo=True).aggregate(
                total=Sum("procedimiento__duracion_min")
            )["total"] or 0
        if duracion:
            return duracion, tipo.nombre
    if sesion.procedimiento_id:
        return sesion.procedimiento.duracion_min or 0, sesion.procedimiento.nombre
    return 0, ""


def _resolver_duracion(servicio, item_cotizacion, duracion_min_explicito, sesion_ejecutada=None):
    """Resuelve duracion_min y servicio_nombre según la forma de la cita."""
    import logging
    from django.db.models import Max, Sum
    logger = logging.getLogger(__name__)

    if servicio:
        logger.debug("[_resolver_duracion] duracion desde servicio %s: %s", servicio.id, servicio.duracion_min)
        return servicio.duracion_min, servicio.nombre

    if item_cotizacion:
        # Si el item viene de un tratamiento de catalogo, usamos su nombre limpio
        # (sin el sufijo "(N sesiones)" que arma el frontend para la cotizacion)
        # en vez de item_cotizacion.descripcion -- ese texto es para la cotizacion/PDF,
        # no para el recordatorio de una cita individual. .title() normaliza mayusculas/
        # minusculas porque el catalogo se llena a mano y no es consistente.
        nombre = (
            item_cotizacion.tratamiento.nombre.strip().title()
            if item_cotizacion.tratamiento_id
            else item_cotizacion.descripcion
        )
        logger.debug(
            "[_resolver_duracion] item_cotizacion=%s, tratamiento=%s, servicio=%s",
            item_cotizacion.id, item_cotizacion.tratamiento_id, item_cotizacion.servicio_id,
        )
        if item_cotizacion.tratamiento_id and sesion_ejecutada:
            # La sesión elegida manda: antes toda sesión del paquete ocupaba la
            # duración del tipo de sesión más largo (AG-07).
            duracion, _ = duracion_de_sesion(sesion_ejecutada)
            if duracion:
                return duracion, nombre
        if item_cotizacion.tratamiento_id:
            tipos_qs = item_cotizacion.tratamiento.tipos_sesion.filter(es_compromiso=True, activo=True)
            resultado = tipos_qs.aggregate(Max("duracion_min"))
            duracion = resultado["duracion_min__max"] or 0
            logger.debug("[_resolver_duracion] duracion desde tipos_sesion.duracion_min: %s", duracion)
            if not duracion:
                resultado_proc = (
                    tipos_qs
                    .annotate(duracion_procedimientos=Sum("procedimientos__procedimiento__duracion_min"))
                    .aggregate(max_duracion_proc=Max("duracion_procedimientos"))
                )
                duracion = resultado_proc["max_duracion_proc"] or 0
                logger.debug("[_resolver_duracion] duracion desde procedimientos del tipo_sesion: %s", duracion)
            if duracion:
                return duracion, nombre
        if item_cotizacion.procedimiento_efectivo_id:
            procedimiento = item_cotizacion.procedimiento_efectivo
            logger.debug("[_resolver_duracion] duracion desde el procedimiento del item: %s", procedimiento.duracion_min)
            return procedimiento.duracion_min, nombre
        if duracion_min_explicito:
            logger.debug("[_resolver_duracion] duracion desde duracion_min_explicito: %s", duracion_min_explicito)
            return duracion_min_explicito, nombre
        logger.debug("[_resolver_duracion] ERROR: no se pudo resolver duracion")

    if sesion_ejecutada:
        duracion, nombre = duracion_de_sesion(sesion_ejecutada)
        if duracion:
            logger.debug("[_resolver_duracion] duracion desde la sesion: %s", duracion)
            return duracion, nombre
        logger.debug("[_resolver_duracion] ERROR: sesion_ejecutada sin duracion resoluble")

    if duracion_min_explicito:
        return duracion_min_explicito, ""

    return None, ""


def _cuotas_vencidas_bloqueantes(paciente, clinica):
    """Cuotas de cartera del paciente que bloquean agenda/atención: vencidas más
    allá de los días de gracia, con saldo pendiente y sin excepción aprobada.

    No mira el toggle de la clínica: esa decisión es del caller.
    """
    from datetime import date, timedelta
    from apps.cartera.models import CUOTA_PENDIENTE_EXPR, CuotaCartera

    dias_gracia = clinica.dias_gracia_deuda or 0
    fecha_limite = date.today() - timedelta(days=dias_gracia)

    return (
        CuotaCartera.objects.filter(
            cartera__paciente=paciente,
            cartera__paciente__clinica=clinica,
            excepcion_aprobada=False,
            anulada=False,
            fecha_esperada__lt=fecha_limite,
        )
        .annotate(pendiente=CUOTA_PENDIENTE_EXPR)
        .filter(pendiente__gt=0)
    )


def deuda_bloqueante_info(paciente, clinica):
    """Detalle de la deuda que bloquea agendar/atender a este paciente, o ``None``
    si no aplica (clínica sin ``bloquear_agenda_por_deuda`` o sin cuotas vencidas).

    Se usa tanto para levantar el error como para pintar el aviso en la UI.
    """
    from decimal import Decimal
    from django.db.models import Count, Sum

    if not clinica.bloquear_agenda_por_deuda:
        return None

    cuotas = _cuotas_vencidas_bloqueantes(paciente, clinica)
    agg = cuotas.aggregate(n=Count("id"), s=Sum("pendiente"))
    if not agg["n"]:
        return None

    return {
        "cuotas_vencidas": agg["n"],
        "monto_total": f"{agg['s'] or Decimal('0'):.2f}",
        "cuota_ids": [str(cid) for cid in cuotas.values_list("id", flat=True)],
    }


@transaction.atomic
def _validar_deuda_paciente(paciente, clinica, *, accion="iniciar la atención"):
    info = deuda_bloqueante_info(paciente, clinica)
    if info is None:
        return
    raise ValidationError({
        "error": f"El paciente tiene cuotas vencidas. No se puede {accion}.",
        "code": "PACIENTE_CON_DEUDA",
        "detalle": info,
    })


def pasos_recepcion_pendientes(cita) -> list[str]:
    """Pasos encendidos de Preparar paciente que la cita aún no cumple.

    Sin ellos no se inicia la atención (decisión del 21/10/2026): si se pudiera
    iniciar sin completarlos, recepción se los saltaría siempre. La llegada ya
    la exige el flujo (de "confirmada" no se pasa a "en curso") y el
    consentimiento se valida aparte. Los add-ons apagados no cuentan.
    """
    from apps.cobros.models import Cobro
    from apps.configuracion.models import ConfiguracionWizard

    clinica = cita.sede.clinica
    config, _ = ConfiguracionWizard.objects.get_or_create(clinica=clinica)
    pendientes = []
    # Un intento de verificación basta, coincida o no; "Continuar sin verificar"
    # deja un registro omitido.
    if config.paso_verificacion_facial and clinica.facial_verificacion_habilitada and not cita.checkins.exists():
        pendientes.append("Verificación de identidad")
    # Una cita de una cotización la cobra la cartera, no recepción.
    if config.paso_pago and cita.item_cotizacion_id is None and not Cobro.objects.filter(
        cita=cita, estado__in=[Cobro.Estado.PAGADO, Cobro.Estado.PAGADO_PARCIAL],
    ).exists():
        pendientes.append("Pago")
    if config.paso_firma_asistencia and cita.firma_asistencia_estado != Cita.FirmaAsistenciaEstado.FIRMADA:
        pendientes.append("Firma de asistencia")
    return pendientes


def _bloquear_agenda_del_profesional(profesional_id):
    """Serializa las reservas del mismo profesional: dos recepcionistas (o un
    doble clic) ya no pueden tomar el mismo horario a la vez. Se usa dentro de
    una transacción, antes de revisar la disponibilidad."""
    from django.contrib.auth import get_user_model

    get_user_model().objects.select_for_update().filter(pk=profesional_id).values_list("pk", flat=True).first()


def validar_horario_cita(*, sede, profesional, fecha_inicio, fecha_fin, excluir_cita_id=None):
    """Reglas comunes al crear y al editar una cita."""
    from apps.users.authorization import user_sede_ids_acotadas

    # Un profesional asignado a ciertas sedes no se agenda en otra: luego no veía
    # esa cita en su agenda (AT-22). Sin sedes asignadas atiende en todas.
    sedes_del_profesional = user_sede_ids_acotadas(profesional)
    if sedes_del_profesional is not None and sede.id not in sedes_del_profesional:
        raise ValidationError({
            "error": f"{profesional.nombre_completo} no atiende en la sede {sede.nombre}.",
            "code": "PROFESIONAL_FUERA_DE_SEDE",
        })
    if not verificar_horario_sede(sede, fecha_inicio, fecha_fin):
        raise ValidationError({"error": "La cita está fuera del horario de la sede."})
    if not verificar_horario_profesional(profesional.id, sede.id, fecha_inicio, fecha_fin):
        raise ValidationError({"error": "La cita está fuera del horario del colaborador."})
    if rango_bloqueado(profesional.id, sede, fecha_inicio, fecha_fin):
        raise ValidationError({"error": "Ese horario está bloqueado en la agenda.", "code": "HORARIO_BLOQUEADO"})
    if not verificar_disponibilidad_profesional(profesional.id, fecha_inicio, fecha_fin, excluir_cita_id=excluir_cita_id):
        raise ValidationError({"error": "El profesional no está disponible en ese horario.", "code": "HORARIO_OCUPADO"})


def avisar_si_paciente_tiene_otra_cita(paciente, fecha_inicio, fecha_fin, excluir_cita_id=None):
    """Avisa (400 `PACIENTE_CON_OTRA_CITA`) si el paciente ya tiene una cita
    activa que se cruza con ese horario. Es un aviso, no una regla: quien agenda
    puede confirmarlo (dos procedimientos a la vez con personas distintas) (M3-30)."""
    cruces = (
        Cita.objects.filter(paciente=paciente, fecha_inicio__lt=fecha_fin, fecha_fin__gt=fecha_inicio)
        .exclude(estado__in=[Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO])
        .exclude(pk=excluir_cita_id)
        .select_related("profesional")
        .order_by("fecha_inicio")[:5]
    )
    cruces = list(cruces)
    if not cruces:
        return
    raise ValidationError({
        "error": "El paciente ya tiene otra cita en ese horario.",
        "code": "PACIENTE_CON_OTRA_CITA",
        "citas": [
            {
                "id": str(c.id),
                "fecha_inicio": timezone.localtime(c.fecha_inicio).isoformat(),
                "servicio": c.servicio_nombre,
                "profesional": c.profesional.nombre_completo if c.profesional_id else "",
            }
            for c in cruces
        ],
    })


def _reservar_sesion_del_item(item_cotizacion):
    """Vuelve a contar las sesiones del paquete con la fila del ítem bloqueada.

    El serializer ya lo valida, pero fuera de la transacción: dos recepcionistas
    agendando a la vez podían tomar las dos la última sesión (AG-02).
    """
    from apps.cotizaciones.models import ItemCotizacion

    item = ItemCotizacion.objects.select_for_update().get(pk=item_cotizacion.pk)
    if item.citas_no_canceladas() + item.sesiones_previas_consumidas >= item.num_sesiones_efectivas():
        raise ValidationError({"error": "Este item no tiene sesiones disponibles.", "code": "SIN_SESIONES_DISPONIBLES"})


@transaction.atomic
def crear_cita(data: dict, created_by, *, avisar_cruce_paciente: bool = False) -> Cita:
    data = dict(data)
    servicio = data.get("servicio")
    item_cotizacion = data.get("item_cotizacion")
    duracion_min_explicito = data.pop("duracion_min", None)
    sesion_ejecutada = data.pop("sesion_ejecutada", None)
    sede = data["sede"]
    paciente = data["paciente"]
    profesional = data["profesional"]
    fecha_inicio = data["fecha_inicio"]

    if item_cotizacion is not None:
        _reservar_sesion_del_item(item_cotizacion)

    duracion_min, servicio_nombre = _resolver_duracion(
        servicio, item_cotizacion, duracion_min_explicito, sesion_ejecutada
    )
    if not duracion_min:
        raise ValidationError({"error": "Se requiere un procedimiento, un ítem de cotización, una sesión o una duración.", "code": "MISSING_DURATION"})

    fecha_fin = calcular_fecha_fin(fecha_inicio, duracion_min)

    if paciente.clinica_id != sede.clinica_id:
        raise ValidationError({"error": "El paciente no pertenece a la clinica de la sede."})
    if servicio and servicio.clinica_id != sede.clinica_id:
        raise ValidationError({"error": "El procedimiento no pertenece a la clinica de la sede."})
    if profesional.clinica_id != sede.clinica_id:
        raise ValidationError({"error": "El profesional no pertenece a la clinica de la sede."})
    _bloquear_agenda_del_profesional(profesional.id)
    validar_horario_cita(sede=sede, profesional=profesional, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
    if avisar_cruce_paciente:
        avisar_si_paciente_tiene_otra_cita(paciente, fecha_inicio, fecha_fin)

    # La mora no bloquea agendar ni reprogramar: el bloqueo es al iniciar la
    # atención (decisión del 15/10/2026). Ver cambiar_estado → en_curso.

    cita = Cita.objects.create(
        **data,
        fecha_fin=fecha_fin,
        duracion_min=duracion_min,
        servicio_nombre=servicio_nombre,
        canal_confirmacion=paciente.canal_confirmacion,
        created_by=created_by,
    )

    if sesion_ejecutada:
        sesion_ejecutada.cita = cita
        sesion_ejecutada.save(update_fields=["cita", "updated_at"])

    return cita


def iniciar_checkin_otp_cita(cita: Cita, request_ip: str):
    estados_validos = {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}
    logger.debug(
        "[checkin_otp] iniciar | cita_id=%s | estado=%s | paciente_id=%s | telefono=%s",
        cita.id, cita.estado, cita.paciente_id, cita.paciente.telefono,
    )
    try:
        ruta = resolver_ruta_whatsapp(cita.sede.clinica, cita.sede, tipo=EnvioWhatsApp.Tipo.CHECKIN_OTP)
    except WhatsAppNoDisponibleError as exc:
        raise AgendaError(str(exc), code=exc.code) from exc
    if cita.estado not in estados_validos:
        raise AgendaError("La cita no esta en estado valido para iniciar checkin", code="ESTADO_INVALIDO")

    otp_existente = getattr(cita, "otp", None)
    if otp_existente and otp_existente.esta_vigente():
        logger.debug("[checkin_otp] reutilizando OTP vigente | cita_id=%s", cita.id)
        return otp_existente, False

    CitaCheckinOTP.objects.filter(cita=cita).delete()
    otp = CitaCheckinOTP.objects.create(
        cita=cita,
        codigo=f"{random.randint(0, 999999):06d}",
    )
    try:
        enviar_whatsapp(ruta=ruta, tipo=EnvioWhatsApp.Tipo.CHECKIN_OTP, paciente=cita.paciente, codigo=otp.codigo)
    except ValueError as exc:
        otp.delete()
        raise AgendaError("Webhook no configurado", code="WEBHOOK_NOT_CONFIGURED") from exc
    except Exception:
        logger.exception("[checkin_otp] fallo el envio | cita_id=%s", cita.id)
        otp.delete()
        raise
    return otp, True


def verificar_otp_cita(cita: Cita, codigo: str, request_ip: str):
    # Solo valida que el addon siga habilitado, no el cupo: verificar un codigo ya
    # enviado no dispara un envio nuevo, asi que no debe fallar por falta de cupo.
    if not cita.sede.clinica.whatsapp_habilitado:
        raise AgendaError("WhatsApp no está habilitado para esta clínica.", code="WHATSAPP_NO_HABILITADO")
    otp = CitaCheckinOTP.objects.filter(cita=cita).first()
    if otp is None:
        raise AgendaError("No hay codigo activo", code="OTP_NOT_FOUND")
    if not otp.esta_vigente():
        raise AgendaError("Codigo expirado o bloqueado", code="OTP_EXPIRED")
    if codigo != otp.codigo:
        otp.intentos += 1
        otp.save(update_fields=["intentos"])
        raise AgendaError(
            "Codigo incorrecto",
            code="OTP_INVALID",
            extra={"intentos_restantes": max(0, 3 - otp.intentos)},
        )

    otp.usado = True
    otp.save(update_fields=["usado"])
    cita.checkin_metodo = Cita.CheckinMetodo.OTP_WHATSAPP
    cita.checkin_en = timezone.now()
    cita.checkin_ip = request_ip or None
    cita.save(update_fields=["checkin_metodo", "checkin_en", "checkin_ip", "updated_at"])
    otp.delete()
    return cita


def registrar_checkin_foto_cita(cita: Cita, archivo, request_ip: str):
    estados_validos = {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}
    if cita.estado not in estados_validos:
        raise AgendaError("La cita no esta en estado valido para registrar checkin", code="ESTADO_INVALIDO")

    cita.checkin_foto = archivo
    cita.checkin_metodo = Cita.CheckinMetodo.FOTO_PRESENCIAL
    cita.checkin_en = timezone.now()
    cita.checkin_ip = request_ip or None
    cita.save(update_fields=["checkin_foto", "checkin_metodo", "checkin_en", "checkin_ip", "updated_at"])
    return cita
