import random
from datetime import date, timedelta

import requests
from django.db import transaction
from django.utils import timezone

from apps.notificaciones.services import get_whatsapp_outbound_webhook_url
from apps.protocolos.models import CheckinOTP, ConsentimientoPaciente, SesionProcedimiento, TratamientoPaciente


class ProtocolosError(Exception):
    code = "PROTOCOLO_ERROR"

    def __init__(self, message, *, code=None, extra=None):
        super().__init__(message)
        if code:
            self.code = code
        self.extra = extra or {}


def enviar_otp_whatsapp(paciente, codigo: str):
    from django.conf import settings
    url = get_whatsapp_outbound_webhook_url()
    if not url:
        raise ProtocolosError("Webhook no configurado", code="WEBHOOK_NOT_CONFIGURED")
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
    return payload


def iniciar_checkin_otp(sesion: SesionProcedimiento, request_ip: str):
    otp_existente = getattr(sesion, "otp", None)
    if otp_existente and otp_existente.esta_vigente():
        return otp_existente, False

    CheckinOTP.objects.filter(sesion=sesion).delete()
    otp = CheckinOTP.objects.create(
        sesion=sesion,
        codigo=f"{random.randint(0, 999999):06d}",
        expira_en=timezone.now() + timedelta(minutes=10),
    )
    try:
        enviar_otp_whatsapp(sesion.tratamiento.paciente, otp.codigo)
    except Exception:
        otp.delete()
        raise
    return otp, True


def verificar_otp(sesion: SesionProcedimiento, codigo: str, request_ip: str):
    otp = CheckinOTP.objects.filter(sesion=sesion).first()
    if otp is None:
        raise ProtocolosError("No hay codigo activo", code="OTP_NOT_FOUND")
    if not otp.esta_vigente():
        raise ProtocolosError("Codigo expirado o bloqueado", code="OTP_EXPIRED")
    if codigo != otp.codigo:
        otp.intentos += 1
        otp.save(update_fields=["intentos"])
        raise ProtocolosError(
            "Codigo incorrecto",
            code="OTP_INVALID",
            extra={"intentos_restantes": max(0, 3 - otp.intentos)},
        )

    otp.usado = True
    otp.save(update_fields=["usado"])
    sesion.checkin_metodo = SesionProcedimiento.CheckinMetodo.OTP_WHATSAPP
    sesion.checkin_en = timezone.now()
    sesion.checkin_ip = request_ip or None
    sesion.save(update_fields=["checkin_metodo", "checkin_en", "checkin_ip", "updated_at"])
    otp.delete()
    return sesion


def registrar_checkin_foto(sesion: SesionProcedimiento, archivo, request_ip: str):
    sesion.foto_presencia = archivo
    sesion.checkin_metodo = SesionProcedimiento.CheckinMetodo.FOTO_PRESENCIAL
    sesion.checkin_en = timezone.now()
    sesion.checkin_ip = request_ip or None
    sesion.save(update_fields=["foto_presencia", "checkin_metodo", "checkin_en", "checkin_ip", "updated_at"])
    return sesion


def procedimientos_requeridos_sesion(sesion: SesionProcedimiento):
    if sesion.tipo_sesion_id:
        return [
            item.procedimiento
            for item in sesion.tipo_sesion.procedimientos.filter(activo=True).select_related("procedimiento").order_by("orden")
        ]
    if sesion.procedimiento_id:
        return [sesion.procedimiento]
    return []


def verificar_consentimientos_sesion(sesion: SesionProcedimiento):
    faltantes = []
    procedimientos = procedimientos_requeridos_sesion(sesion)
    paciente = sesion.tratamiento.paciente
    hoy = date.today()

    for procedimiento in procedimientos:
        for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template").order_by("orden"):
            consentimiento = (
                ConsentimientoPaciente.objects.filter(
                    paciente=paciente,
                    template_token=relacion.template.template_token,
                )
                .order_by("-fecha_firma", "-created_at")
                .first()
            )
            if consentimiento is None:
                faltantes.append(
                    {
                        "estado": "faltante",
                        "procedimiento": procedimiento.nombre,
                        "template_token": relacion.template.template_token,
                        "template_nombre": relacion.template.get_tipo_display(),
                        "accion": "firmar",
                    }
                )
                continue
            if consentimiento.vigencia_hasta < hoy:
                faltantes.append(
                    {
                        "estado": "vencido",
                        "procedimiento": procedimiento.nombre,
                        "template_token": relacion.template.template_token,
                        "template_nombre": consentimiento.template_nombre,
                        "fecha_firma": consentimiento.fecha_firma,
                        "vencio": consentimiento.vigencia_hasta,
                        "accion": "renovar",
                    }
                )
    return faltantes


def consentimiento_status_sesion(sesion: SesionProcedimiento):
    procedimientos = procedimientos_requeridos_sesion(sesion)
    paciente = sesion.tratamiento.paciente
    hoy = date.today()
    resultado = []

    for procedimiento in procedimientos:
        for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template").order_by("orden"):
            consentimiento = (
                ConsentimientoPaciente.objects.filter(
                    paciente=paciente,
                    template_token=relacion.template.template_token,
                )
                .order_by("-fecha_firma", "-created_at")
                .first()
            )
            if consentimiento is None:
                resultado.append(
                    {
                        "procedimiento": procedimiento.nombre,
                        "template_nombre": relacion.template.get_tipo_display(),
                        "estado": "faltante",
                        "accion": "firmar",
                    }
                )
            elif consentimiento.vigencia_hasta < hoy:
                resultado.append(
                    {
                        "procedimiento": procedimiento.nombre,
                        "template_nombre": consentimiento.template_nombre,
                        "estado": "vencido",
                        "fecha_firma": consentimiento.fecha_firma,
                        "vencio": consentimiento.vigencia_hasta,
                        "accion": "renovar",
                    }
                )
            else:
                resultado.append(
                    {
                        "procedimiento": procedimiento.nombre,
                        "template_nombre": consentimiento.template_nombre,
                        "estado": "vigente",
                        "fecha_firma": consentimiento.fecha_firma,
                        "vence": consentimiento.vigencia_hasta,
                    }
                )
    return {
        "sesion_id": str(sesion.id),
        "tipo_sesion_nombre": sesion.tipo_sesion.nombre if sesion.tipo_sesion_id else sesion.paso_nombre if hasattr(sesion, "paso_nombre") else "",
        "puede_ejecutar": not any(item["estado"] != "vigente" for item in resultado),
        "consentimientos": resultado,
    }


def consentimientos_pendientes_cotizacion(cotizacion):
    faltantes = []
    hoy = date.today()
    procedimientos_unicos = {}

    for item in cotizacion.items.select_related("tratamiento", "servicio", "procedimiento").prefetch_related(
        "tratamiento__tipos_sesion__procedimientos__procedimiento"
    ).filter(activo=True):
        if item.tratamiento_id:
            for tipo in item.tratamiento.tipos_sesion.filter(activo=True):
                for tp in tipo.procedimientos.filter(activo=True).select_related("procedimiento"):
                    procedimientos_unicos[str(tp.procedimiento_id)] = tp.procedimiento
        elif item.procedimiento_id:
            procedimientos_unicos[str(item.procedimiento_id)] = item.procedimiento
        elif item.servicio_id:
            procedimientos_unicos[str(item.servicio_id)] = item.servicio

    for procedimiento in procedimientos_unicos.values():
        for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template"):
            vigente = ConsentimientoPaciente.objects.filter(
                paciente=cotizacion.paciente,
                template_token=relacion.template.template_token,
                vigencia_hasta__gte=hoy,
            ).exists()
            if not vigente:
                faltantes.append(
                    {
                        "procedimiento": procedimiento.nombre,
                        "template_token": relacion.template.template_token,
                        "template_nombre": relacion.template.get_tipo_display(),
                    }
                )
    return faltantes


def marcar_sesion_completada(
    sesion: SesionProcedimiento,
    *,
    cita=None,
    profesional=None,
    observaciones="",
    fecha=None,
    hora=None,
    procedimientos_ejecutados=None,
    forzar_sin_consentimiento=False,
    motivo="",
):
    faltantes = verificar_consentimientos_sesion(sesion)
    if faltantes and not forzar_sin_consentimiento:
        raise ProtocolosError(
            "Consentimientos requeridos faltantes o vencidos",
            code="CONSENTIMIENTOS_FALTANTES",
            extra={"faltantes": faltantes},
        )

    now = timezone.localtime()
    sesion.estado = SesionProcedimiento.Estado.COMPLETADO
    sesion.cita = cita
    sesion.profesional = profesional
    sesion.observaciones = observaciones or sesion.observaciones
    sesion.fecha = fecha or now.date()
    sesion.hora = hora or now.time().replace(microsecond=0)
    sesion.forzado_sin_consentimiento = bool(faltantes and forzar_sin_consentimiento)
    sesion.motivo_forzado = motivo if sesion.forzado_sin_consentimiento else ""
    sesion.save(
        update_fields=[
            "estado",
            "cita",
            "profesional",
            "observaciones",
            "fecha",
            "hora",
            "forzado_sin_consentimiento",
            "motivo_forzado",
            "updated_at",
        ]
    )

    if procedimientos_ejecutados:
        sesion.procedimientos_ejecutados.set(procedimientos_ejecutados)
    elif sesion.procedimiento_id:
        sesion.procedimientos_ejecutados.set([sesion.procedimiento])

    if not faltantes:
        procedimientos = procedimientos_requeridos_sesion(sesion)
        template_tokens = set()
        for procedimiento in procedimientos:
            template_tokens.update(
                procedimiento.consentimientos_requeridos_set.filter(activo=True)
                .select_related("template")
                .values_list("template__template_token", flat=True)
            )
        consentimientos = ConsentimientoPaciente.objects.filter(
            paciente=sesion.tratamiento.paciente,
            template_token__in=template_tokens,
            vigencia_hasta__gte=date.today(),
        )
        sesion.consentimientos_verificados.set(consentimientos)

    tratamiento = sesion.tratamiento
    if tratamiento.pasos_completados == tratamiento.total_pasos and tratamiento.estado != TratamientoPaciente.Estado.COMPLETADO:
        tratamiento.estado = TratamientoPaciente.Estado.COMPLETADO
        tratamiento.save(update_fields=["estado", "updated_at"])
    return sesion


def crear_tratamiento_desde_cotizacion(cotizacion_item):
    if TratamientoPaciente.objects.filter(cotizacion_item=cotizacion_item).exists():
        return None
    if cotizacion_item.tratamiento_id:
        tratamiento_catalogo = cotizacion_item.tratamiento
        tipos = list(tratamiento_catalogo.tipos_sesion.filter(activo=True, es_compromiso=True).order_by("orden"))
        if not tipos:
            return None

        with transaction.atomic():
            primer_procedimiento = None
            for tipo in tipos:
                primer_tipo_procedimiento = tipo.procedimientos.filter(activo=True).select_related("procedimiento").first()
                if primer_tipo_procedimiento:
                    primer_procedimiento = primer_tipo_procedimiento.procedimiento
                    break
            tratamiento = TratamientoPaciente.objects.create(
                paciente=cotizacion_item.cotizacion.paciente,
                servicio=primer_procedimiento,
                tratamiento_catalogo=tratamiento_catalogo,
                cotizacion_item=cotizacion_item,
                fecha_inicio=date.today(),
            )
            sesiones = []
            for tipo in tipos:
                principal = tipo.procedimientos.filter(activo=True).select_related("procedimiento").first()
                for numero in range(1, tipo.cantidad + 1):
                    sesiones.append(
                        SesionProcedimiento(
                            tratamiento=tratamiento,
                            tipo_sesion=tipo,
                            numero=numero,
                            procedimiento=principal.procedimiento if principal else None,
                        )
                    )
            SesionProcedimiento.objects.bulk_create(sesiones)
            return tratamiento

    procedimiento = cotizacion_item.procedimiento or cotizacion_item.servicio
    if procedimiento is None:
        return None

    pasos = list(procedimiento.pasos_protocolo.filter(activo=True).order_by("orden"))
    if not pasos:
        return None

    with transaction.atomic():
        tratamiento = TratamientoPaciente.objects.create(
            paciente=cotizacion_item.cotizacion.paciente,
            servicio=procedimiento,
            cotizacion_item=cotizacion_item,
            fecha_inicio=date.today(),
        )
        SesionProcedimiento.objects.bulk_create(
            [SesionProcedimiento(tratamiento=tratamiento, paso=paso, procedimiento=procedimiento) for paso in pasos]
        )
        return tratamiento
