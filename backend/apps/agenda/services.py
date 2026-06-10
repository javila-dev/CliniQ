import random
from datetime import datetime, timedelta

import requests
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.agenda.models import BloqueoAgenda, Cita, CitaCheckinOTP
from apps.clinicas.models import Sede
from apps.colaboradores.models import HorarioColaborador
from apps.notificaciones.services import get_whatsapp_outbound_webhook_url


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


def verificar_disponibilidad_profesional(profesional_id, fecha_inicio, fecha_fin, excluir_cita_id=None) -> bool:
    citas = (
        Cita.objects.filter(profesional_id=profesional_id)
        .exclude(estado=Cita.Estado.CANCELADA)
        .select_related("servicio")
    )
    if excluir_cita_id:
        citas = citas.exclude(id=excluir_cita_id)

    citas_ocupadas = False
    for cita in citas:
        cita_inicio, cita_fin = obtener_rango_ocupado(cita)
        if cita_inicio < fecha_fin and cita_fin > fecha_inicio:
            citas_ocupadas = True
            break

    bloqueos = BloqueoAgenda.objects.filter(
        profesional_id=profesional_id,
        fecha_inicio__lt=fecha_fin,
        fecha_fin__gt=fecha_inicio,
    )

    return not citas_ocupadas and not bloqueos.exists()


def verificar_horario_sede(sede: Sede, fecha_inicio: datetime, fecha_fin: datetime) -> bool:
    key_dia = DIAS_SEMANA.get(fecha_inicio.weekday())
    rango = sede.horario.get(key_dia)
    if not rango or len(rango) != 2:
        return False

    hora_inicio = datetime.strptime(rango[0], "%H:%M").time()
    hora_fin = datetime.strptime(rango[1], "%H:%M").time()

    inicio_habil = timezone.make_aware(datetime.combine(fecha_inicio.date(), hora_inicio), timezone.get_current_timezone())
    fin_habil = timezone.make_aware(datetime.combine(fecha_fin.date(), hora_fin), timezone.get_current_timezone())

    return inicio_habil <= fecha_inicio and fecha_fin <= fin_habil


def obtener_rango_horario_profesional(profesional_id, sede_id, fecha):
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

    tz = timezone.get_current_timezone()
    return (
        timezone.make_aware(datetime.combine(fecha, horario.hora_inicio), tz),
        timezone.make_aware(datetime.combine(fecha, horario.hora_fin), tz),
    )


def verificar_horario_profesional(profesional_id, sede_id, fecha_inicio: datetime, fecha_fin: datetime) -> bool:
    rango_profesional = obtener_rango_horario_profesional(profesional_id, sede_id, fecha_inicio.date())
    if not rango_profesional:
        return True
    inicio_habil, fin_habil = rango_profesional
    return inicio_habil <= fecha_inicio and fecha_fin <= fin_habil


def get_slots_disponibles(profesional_id, sede_id, fecha, duracion_min: int) -> list[datetime]:
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
    if rango_profesional:
        actual, limite = rango_profesional

    slots = []
    while actual + timedelta(minutes=duracion_min) <= limite:
        fin = calcular_fecha_fin(actual, duracion_min)
        if verificar_horario_sede(sede, actual, fin) and verificar_disponibilidad_profesional(profesional_id, actual, fin):
            slots.append(actual)
        actual = actual + timedelta(minutes=intervalo_min)

    return slots


def _resolver_duracion(servicio, item_cotizacion, duracion_min_explicito, sesion_ejecutada=None):
    """Resuelve duracion_min y servicio_nombre según la forma de la cita."""
    import logging
    from django.db.models import Max, Sum
    logger = logging.getLogger(__name__)

    if servicio:
        logger.debug("[_resolver_duracion] duracion desde servicio %s: %s", servicio.id, servicio.duracion_min)
        return servicio.duracion_min, servicio.nombre

    if item_cotizacion:
        nombre = item_cotizacion.descripcion
        logger.debug(
            "[_resolver_duracion] item_cotizacion=%s, tratamiento=%s, servicio=%s",
            item_cotizacion.id, item_cotizacion.tratamiento_id, item_cotizacion.servicio_id,
        )
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
        if item_cotizacion.servicio_id:
            logger.debug("[_resolver_duracion] duracion desde item.servicio: %s", item_cotizacion.servicio.duracion_min)
            return item_cotizacion.servicio.duracion_min, nombre
        if duracion_min_explicito:
            logger.debug("[_resolver_duracion] duracion desde duracion_min_explicito: %s", duracion_min_explicito)
            return duracion_min_explicito, nombre
        logger.debug("[_resolver_duracion] ERROR: no se pudo resolver duracion")

    if sesion_ejecutada:
        from django.db.models import Sum
        nombre = ""
        tipo = sesion_ejecutada.tipo_sesion
        if tipo:
            nombre = tipo.nombre
            duracion = tipo.duracion_min or 0
            if not duracion:
                resultado_proc = tipo.procedimientos.filter(activo=True).aggregate(
                    total=Sum("procedimiento__duracion_min")
                )
                duracion = resultado_proc["total"] or 0
            if duracion:
                logger.debug("[_resolver_duracion] duracion desde tipo_sesion de sesion_ejecutada: %s", duracion)
                return duracion, nombre
        if sesion_ejecutada.procedimiento_id:
            nombre = sesion_ejecutada.procedimiento.nombre
            duracion = sesion_ejecutada.procedimiento.duracion_min
            logger.debug("[_resolver_duracion] duracion desde procedimiento de sesion_ejecutada: %s", duracion)
            return duracion, nombre
        logger.debug("[_resolver_duracion] ERROR: sesion_ejecutada sin duracion resoluble")

    if duracion_min_explicito:
        return duracion_min_explicito, ""

    return None, ""


@transaction.atomic
def crear_cita(data: dict, created_by) -> Cita:
    data = dict(data)
    servicio = data.get("servicio")
    item_cotizacion = data.get("item_cotizacion")
    duracion_min_explicito = data.pop("duracion_min", None)
    sesion_ejecutada = data.pop("sesion_ejecutada", None)
    sede = data["sede"]
    paciente = data["paciente"]
    profesional = data["profesional"]
    fecha_inicio = data["fecha_inicio"]

    duracion_min, servicio_nombre = _resolver_duracion(
        servicio, item_cotizacion, duracion_min_explicito, sesion_ejecutada
    )
    if not duracion_min:
        raise ValidationError({"error": "Se requiere servicio, item_cotizacion, sesion_ejecutada o duracion_min.", "code": "MISSING_DURATION"})

    fecha_fin = calcular_fecha_fin(fecha_inicio, duracion_min)

    if paciente.clinica_id != sede.clinica_id:
        raise ValidationError({"error": "El paciente no pertenece a la clinica de la sede."})
    if servicio and servicio.clinica_id != sede.clinica_id:
        raise ValidationError({"error": "El servicio no pertenece a la clinica de la sede."})
    if profesional.clinica_id != sede.clinica_id:
        raise ValidationError({"error": "El profesional no pertenece a la clinica de la sede."})
    if not verificar_horario_sede(sede, fecha_inicio, fecha_fin):
        raise ValidationError({"error": "La cita esta fuera del horario de la sede."})
    if not verificar_horario_profesional(profesional.id, sede.id, fecha_inicio, fecha_fin):
        raise ValidationError({"error": "La cita esta fuera del horario del colaborador."})
    if not verificar_disponibilidad_profesional(profesional.id, fecha_inicio, fecha_fin):
        raise ValidationError({"error": "El profesional no esta disponible en ese horario."})

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


def _enviar_otp_whatsapp_cita(paciente, codigo: str):
    from django.conf import settings
    url = get_whatsapp_outbound_webhook_url()
    if not url:
        raise AgendaError("Webhook no configurado", code="WEBHOOK_NOT_CONFIGURED")
    payload = {
        "nombre": paciente.nombres,
        "apellido": paciente.apellidos,
        "telefono": paciente.telefono,
        "tipo_notificacion": "checkin_otp",
        "codigo": codigo,
    }
    headers = {}
    secret = getattr(settings, "N8N_WEBHOOK_SECRET", "")
    if secret:
        headers["X-Webhook-Secret"] = secret
    response = requests.post(url, json=payload, headers=headers, timeout=15)
    response.raise_for_status()


def iniciar_checkin_otp_cita(cita: Cita, request_ip: str):
    estados_validos = {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}
    if cita.estado not in estados_validos:
        raise AgendaError("La cita no esta en estado valido para iniciar checkin", code="ESTADO_INVALIDO")

    otp_existente = getattr(cita, "otp", None)
    if otp_existente and otp_existente.esta_vigente():
        return otp_existente, False

    CitaCheckinOTP.objects.filter(cita=cita).delete()
    otp = CitaCheckinOTP.objects.create(
        cita=cita,
        codigo=f"{random.randint(0, 999999):06d}",
    )
    try:
        _enviar_otp_whatsapp_cita(cita.paciente, otp.codigo)
    except Exception:
        otp.delete()
        raise
    return otp, True


def verificar_otp_cita(cita: Cita, codigo: str, request_ip: str):
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
