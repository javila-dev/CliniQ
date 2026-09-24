import logging
import random
from datetime import date, timedelta

import requests
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.notificaciones.models import EnvioWhatsApp
from apps.notificaciones.services import (
    WhatsAppNoDisponibleError,
    get_whatsapp_outbound_webhook_url,
    registrar_envio_whatsapp,
    verificar_disponibilidad_whatsapp,
)
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import consentimiento_informado_vigente, consentimiento_satisfecho
from apps.protocolos.models import CheckinOTP, ConsentimientoPaciente, SesionProcedimiento, TratamientoPaciente

logger = logging.getLogger(__name__)


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

    paciente = sesion.tratamiento.paciente
    try:
        verificar_disponibilidad_whatsapp(paciente.clinica)
    except WhatsAppNoDisponibleError as exc:
        raise ProtocolosError(str(exc), code=exc.code) from exc

    CheckinOTP.objects.filter(sesion=sesion).delete()
    otp = CheckinOTP.objects.create(
        sesion=sesion,
        codigo=f"{random.randint(0, 999999):06d}",
        expira_en=timezone.now() + timedelta(minutes=10),
    )
    try:
        enviar_otp_whatsapp(paciente, otp.codigo)
    except Exception:
        otp.delete()
        raise
    registrar_envio_whatsapp(paciente.clinica, EnvioWhatsApp.Tipo.CHECKIN_OTP, paciente=paciente)
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


def _sesion_vinculada_o_pendiente(cita):
    """SesionProcedimiento asociada a una cita.

    Prioriza la que está enganchada por FK (``cita.sesiones_protocolo``); si la
    cita se agendó solo con ``item_cotizacion`` (sin ``sesion_ejecutada``), cae a
    la primera sesión pendiente del tratamiento de ese ítem. Entre varias
    enganchadas prefiere la que sigue pendiente.
    """
    # ``.all()`` para aprovechar el prefetch de ``sesiones_protocolo`` que hace
    # el viewset de agenda y no disparar una consulta por cita en los listados.
    vinculadas = list(cita.sesiones_protocolo.all())
    if vinculadas:
        return next(
            (s for s in vinculadas if s.estado == SesionProcedimiento.Estado.PENDIENTE),
            vinculadas[0],
        )

    item_id = getattr(cita, "item_cotizacion_id", None)
    if not item_id:
        return None
    return (
        SesionProcedimiento.objects.select_related(
            "tipo_sesion",
            "procedimiento",
            "tratamiento",
            "tratamiento__servicio",
            "tratamiento__tratamiento_catalogo",
        )
        .filter(
            tratamiento__cotizacion_item_id=item_id,
            estado=SesionProcedimiento.Estado.PENDIENTE,
        )
        .order_by("tipo_sesion__orden", "numero")
        .first()
    )


def contexto_sesion_para_cita(cita):
    """Contexto de "sesión X/Y del tratamiento" para la pantalla de atención.

    Devuelve ``None`` si la cita no corresponde a una sesión de tratamiento con
    tipo de sesión. Incluye TODOS los procedimientos del tipo de sesión (no solo
    el principal) y si alguno tiene zonas/diagramas configurados.
    """
    sesion = _sesion_vinculada_o_pendiente(cita)
    if sesion is None or sesion.tipo_sesion_id is None:
        return None

    tipo = sesion.tipo_sesion
    tratamiento = sesion.tratamiento

    # Índice corrido dentro del tratamiento (ordenado por tipo.orden, numero).
    sesiones_trat = list(tratamiento.sesiones.select_related("tipo_sesion").all())
    sesiones_trat.sort(key=lambda s: (s.tipo_sesion.orden if s.tipo_sesion_id else 0, s.numero))
    total = len(sesiones_trat)
    numero = next((i for i, s in enumerate(sesiones_trat, start=1) if s.id == sesion.id), sesion.numero)

    procedimientos = [
        {
            "id": str(tp.procedimiento_id),
            "nombre": tp.procedimiento.nombre,
            "duracion_min": tp.procedimiento.duracion_min,
        }
        for tp in tipo.procedimientos.filter(activo=True)
        .select_related("procedimiento")
        .order_by("orden")
    ]
    if not procedimientos and sesion.procedimiento_id:
        procedimientos = [
            {
                "id": str(sesion.procedimiento_id),
                "nombre": sesion.procedimiento.nombre,
                "duracion_min": sesion.procedimiento.duracion_min,
            }
        ]

    from apps.clinicas.models import ServicioGrupoZonas

    proc_ids = [p["id"] for p in procedimientos]
    tiene_zonas = bool(proc_ids) and ServicioGrupoZonas.objects.filter(
        servicio_id__in=proc_ids, activo=True
    ).exists()

    if tratamiento.tratamiento_catalogo_id:
        nombre_trat = tratamiento.tratamiento_catalogo.nombre
    elif tratamiento.servicio_id:
        nombre_trat = tratamiento.servicio.nombre
    else:
        nombre_trat = ""

    return {
        "sesion_id": str(sesion.id),
        "tratamiento_id": str(tratamiento.id),
        "tratamiento_nombre": nombre_trat,
        "tipo_sesion_id": str(tipo.id),
        "tipo_sesion_nombre": tipo.nombre,
        "numero": numero,
        "total": total,
        "estado": sesion.estado,
        "procedimientos": procedimientos,
        "tiene_zonas": tiene_zonas,
    }


def verificar_consentimientos_sesion(sesion: SesionProcedimiento, *, cita_id=None):
    faltantes = []
    procedimientos = procedimientos_requeridos_sesion(sesion)
    paciente = sesion.tratamiento.paciente
    hoy = date.today()

    for procedimiento in procedimientos:
        for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template").order_by("orden"):
            token = relacion.template.template_token or str(relacion.template.id)
            cada_vez = relacion.requiere_firma_cada_vez
            if consentimiento_satisfecho(paciente.id, token, cita_id=cita_id, requiere_cada_vez=cada_vez):
                continue
            if cada_vez:
                faltantes.append(
                    {
                        "estado": "faltante",
                        "procedimiento": procedimiento.nombre,
                        "template_token": token,
                        "template_nombre": relacion.template.get_tipo_display(),
                        "accion": "firmar",
                    }
                )
                continue
            consentimiento = (
                ConsentimientoPaciente.objects.filter(paciente=paciente, template_token=token)
                .order_by("-fecha_firma", "-created_at")
                .first()
            )
            if consentimiento is None:
                faltantes.append(
                    {
                        "estado": "faltante",
                        "procedimiento": procedimiento.nombre,
                        "template_token": token,
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
                        "template_token": token,
                        "template_nombre": consentimiento.template_nombre,
                        "fecha_firma": consentimiento.fecha_firma,
                        "vencio": consentimiento.vigencia_hasta,
                        "accion": "renovar",
                    }
                )
    return faltantes


def consentimiento_status_sesion(sesion: SesionProcedimiento, *, cita_id=None):
    procedimientos = procedimientos_requeridos_sesion(sesion)
    paciente = sesion.tratamiento.paciente
    hoy = date.today()
    resultado = []

    for procedimiento in procedimientos:
        for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template").order_by("orden"):
            token = relacion.template.template_token or str(relacion.template.id)
            cada_vez = relacion.requiere_firma_cada_vez
            informado = consentimiento_informado_vigente(paciente.id, token, cita_id=cita_id, requiere_cada_vez=cada_vez)

            if cada_vez:
                legado = (
                    ConsentimientoPaciente.objects.filter(paciente=paciente, template_token=token, cita_id=cita_id)
                    .order_by("-fecha_firma", "-created_at")
                    .first()
                    if cita_id
                    else None
                )
                consentimiento_encontrado = informado or legado
                if consentimiento_encontrado is not None:
                    resultado.append(
                        {
                            "procedimiento": procedimiento.nombre,
                            "template_nombre": getattr(consentimiento_encontrado, "documenso_template_nombre", None)
                            or getattr(consentimiento_encontrado, "template_nombre", None)
                            or relacion.template.get_tipo_display(),
                            "estado": "vigente",
                            "fecha_firma": consentimiento_encontrado.fecha_firma,
                            "vence": None,
                        }
                    )
                else:
                    resultado.append(
                        {
                            "procedimiento": procedimiento.nombre,
                            "template_nombre": relacion.template.get_tipo_display(),
                            "estado": "faltante",
                            "accion": "firmar",
                        }
                    )
                continue

            consentimiento = (
                ConsentimientoPaciente.objects.filter(paciente=paciente, template_token=token)
                .order_by("-fecha_firma", "-created_at")
                .first()
            )
            legado_vigente = consentimiento is not None and consentimiento.vigencia_hasta >= hoy
            if informado is not None and not legado_vigente:
                resultado.append(
                    {
                        "procedimiento": procedimiento.nombre,
                        "template_nombre": informado.documenso_template_nombre or relacion.template.get_tipo_display(),
                        "estado": "vigente",
                        "fecha_firma": informado.fecha_firma,
                        "vence": informado.fecha_vencimiento,
                    }
                )
            elif consentimiento is None:
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


def consentimientos_requeridos_cotizacion(cotizacion, *, incluir_archivos=False):
    """Consentimientos que exigen los procedimientos de la cotizacion (directos o
    via los tipos de sesion de un tratamiento), sin repetir plantillas, cada uno
    con su estado para el paciente: ``firmado`` (vigente en cualquiera de los dos
    modelos) o ``pendiente``. ``incluir_archivos`` resuelve la URL del PDF firmado
    (puede consultar Documenso), asi que se pide solo donde se muestra."""
    from apps.agenda.serializers import _archivo_url
    from apps.core.storage import get_signed_url

    procedimientos_unicos = {}
    for item in cotizacion.items.select_related("tratamiento", "servicio", "procedimiento").prefetch_related(
        "tratamiento__tipos_sesion__procedimientos__procedimiento"
    ).filter(activo=True):
        # Un obsequio solo informativo no se va a realizar: no pide consentimientos.
        if item.es_obsequio and not item.agendable:
            continue
        if item.tratamiento_id:
            for tipo in item.tratamiento.tipos_sesion.filter(activo=True):
                for tp in tipo.procedimientos.filter(activo=True).select_related("procedimiento"):
                    procedimientos_unicos[str(tp.procedimiento_id)] = tp.procedimiento
        elif item.procedimiento_id:
            procedimientos_unicos[str(item.procedimiento_id)] = item.procedimiento
        elif item.servicio_id:
            procedimientos_unicos[str(item.servicio_id)] = item.servicio

    hoy = date.today()
    por_token = {}
    for procedimiento in procedimientos_unicos.values():
        for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template").order_by("orden"):
            token = (relacion.template.template_token or str(relacion.template.id))
            if token in por_token:
                por_token[token]["procedimientos"].append(procedimiento.nombre)
                continue

            cada_vez = relacion.requiere_firma_cada_vez
            datos = {
                "procedimientos": [procedimiento.nombre],
                "template_token": token,
                "template_nombre": relacion.template.nombre or relacion.template.get_tipo_display(),
                "estado": "pendiente",
                "consentimiento_id": None,
                "fecha_firma": None,
                "fecha_vencimiento": None,
                "archivo_url": None,
                "origen": None,
                "requiere_firma_cada_vez": cada_vez,
            }
            # Sin una cita concreta todavia (estamos a nivel cotizacion), un procedimiento
            # "cada vez" nunca puede mostrarse como ya satisfecho: se firma en cada sesion.
            informado = None if cada_vez else consentimiento_informado_vigente(cotizacion.paciente_id, token)
            legado = None
            if informado is None and not cada_vez:
                legado = (
                    ConsentimientoPaciente.objects.filter(
                        paciente_id=cotizacion.paciente_id, template_token=token, vigencia_hasta__gte=hoy,
                    )
                    .order_by("-fecha_firma", "-created_at")
                    .first()
                )

            if informado is not None:
                datos.update(
                    estado="firmado",
                    consentimiento_id=str(informado.id),
                    fecha_firma=informado.fecha_firma,
                    fecha_vencimiento=informado.fecha_vencimiento,
                    origen="documenso",
                    archivo_url=_archivo_url(informado) if incluir_archivos else None,
                )
            elif legado is not None:
                datos.update(
                    estado="firmado",
                    consentimiento_id=str(legado.id),
                    fecha_firma=legado.fecha_firma,
                    fecha_vencimiento=legado.vigencia_hasta,
                    origen="manual",
                    archivo_url=(
                        get_signed_url(legado.archivo.name, expires_in=3600)
                        if incluir_archivos and legado.archivo
                        else None
                    ),
                )
            else:
                borrador = (
                    ConsentimientoInformado.objects.filter(
                        paciente_id=cotizacion.paciente_id, documenso_template_token=token, firmado=False,
                    )
                    .order_by("-created_at")
                    .first()
                )
                datos["consentimiento_id"] = str(borrador.id) if borrador else None
            por_token[token] = datos

    return [{**datos, "procedimiento": ", ".join(datos["procedimientos"])} for datos in por_token.values()]


def consentimientos_pendientes_cotizacion(cotizacion):
    return [
        {
            "procedimiento": c["procedimiento"],
            "template_token": c["template_token"],
            "template_nombre": c["template_nombre"],
            "consentimiento_id": c["consentimiento_id"],
        }
        for c in consentimientos_requeridos_cotizacion(cotizacion)
        if c["estado"] == "pendiente"
    ]


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
    faltantes = verificar_consentimientos_sesion(sesion, cita_id=cita.id if cita else None)
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
    else:
        requeridos = procedimientos_requeridos_sesion(sesion)
        if requeridos:
            sesion.procedimientos_ejecutados.set(requeridos)
        elif sesion.procedimiento_id:
            sesion.procedimientos_ejecutados.set([sesion.procedimiento])

    if not faltantes:
        from django.db.models import Q

        procedimientos = procedimientos_requeridos_sesion(sesion)
        template_tokens = set()
        for procedimiento in procedimientos:
            template_tokens.update(
                procedimiento.consentimientos_requeridos_set.filter(activo=True)
                .select_related("template")
                .values_list("template__template_token", flat=True)
            )
        vigencia_q = Q(vigencia_hasta__gte=date.today())
        if cita is not None:
            vigencia_q |= Q(cita_id=cita.id)
        consentimientos = ConsentimientoPaciente.objects.filter(
            paciente=sesion.tratamiento.paciente,
            template_token__in=template_tokens,
        ).filter(vigencia_q)
        sesion.consentimientos_verificados.set(consentimientos)

    tratamiento = sesion.tratamiento
    if tratamiento.pasos_completados == tratamiento.total_pasos and tratamiento.estado != TratamientoPaciente.Estado.COMPLETADO:
        tratamiento.estado = TratamientoPaciente.Estado.COMPLETADO
        tratamiento.save(update_fields=["estado", "updated_at"])
    return sesion


def agregar_sesiones_obsequio(item_obsequio):
    """Agrega al seguimiento del tratamiento de origen las sesiones clonadas que se regalaron.

    Cada unidad de ``num_citas`` del obsequio se convierte en una fila más del
    mismo tipo de sesión, con la numeración continuando la del seguimiento, para
    que se atienda igual que las demás (presencia, consentimientos, procedimientos
    ejecutados). Es idempotente: si el obsequio ya generó filas no repite nada.
    Devuelve las filas creadas.
    """
    if not (
        item_obsequio.es_obsequio
        and item_obsequio.agendable
        and item_obsequio.item_origen_id
        and item_obsequio.tipo_sesion_origen_id
    ):
        return []
    if SesionProcedimiento.objects.filter(item_obsequio=item_obsequio).exists():
        return []
    tratamiento = TratamientoPaciente.objects.filter(cotizacion_item_id=item_obsequio.item_origen_id).first()
    if tratamiento is None:
        # El tratamiento no generó seguimiento (sin tipos de sesión de compromiso):
        # el obsequio igual suma al cupo agendable, pero no hay dónde agregar filas.
        logger.warning(
            "[agregar_sesiones_obsequio] el tratamiento de origen no tiene seguimiento | item_obsequio_id=%s",
            item_obsequio.id,
        )
        return []

    tipo = item_obsequio.tipo_sesion_origen
    ultimo_numero = tratamiento.sesiones.filter(tipo_sesion=tipo).aggregate(ultimo=Max("numero"))["ultimo"] or 0
    principal = tipo.procedimientos.filter(activo=True).select_related("procedimiento").order_by("orden").first()
    sesiones = [
        SesionProcedimiento(
            tratamiento=tratamiento,
            tipo_sesion=tipo,
            numero=ultimo_numero + posicion,
            procedimiento=principal.procedimiento if principal else None,
            item_obsequio=item_obsequio,
        )
        for posicion in range(1, item_obsequio.num_citas + 1)
    ]
    return SesionProcedimiento.objects.bulk_create(sesiones)


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
