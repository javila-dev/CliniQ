"""Reglas del seguimiento: crear interesados, registrar gestiones, cerrar
oportunidades y hacerlas avanzar con lo que ya pasa en la app (cita, envío,
aceptación).

Los ganchos de avance (``al_crear_cita``, ``al_enviar_cotizacion``...) se
llaman desde señales y nunca deben romper el flujo que los dispara: ver
``_sin_romper``.
"""

import functools
import logging
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.seguimiento.models import GestionOportunidad, Oportunidad

logger = logging.getLogger(__name__)

# Días hasta el próximo contacto según cómo terminó la gestión. None = sale de
# "Para hoy" (agendó, número errado, no le interesa: la recepción decide).
DIAS_SEGUN_RESULTADO = {
    GestionOportunidad.Resultado.SIN_RESPUESTA: 1,
    GestionOportunidad.Resultado.ENVIADO: 2,
    GestionOportunidad.Resultado.INTERESADO: 2,
    GestionOportunidad.Resultado.OTRO: 2,
    GestionOportunidad.Resultado.AGENDO: None,
    GestionOportunidad.Resultado.NUMERO_ERRADO: None,
    GestionOportunidad.Resultado.NO_INTERESADO: None,
}
# Tras enviar una cotización, volver a llamar en estos días si no responde.
DIAS_TRAS_COTIZAR = 3


def _sin_romper(funcion):
    """Un error del seguimiento se registra y no impide agendar, enviar ni aceptar."""

    @functools.wraps(funcion)
    def envoltura(*args, **kwargs):
        try:
            return funcion(*args, **kwargs)
        except Exception:
            logger.exception("[seguimiento] error en %s (ignorado)", funcion.__name__)
            return None

    return envoltura


# ── Teléfonos ──────────────────────────────────────────────────────────────

def digitos_telefono(telefono: str) -> str:
    """Últimos 10 dígitos (celular colombiano sin indicativo) para comparar."""
    digitos = re.sub(r"\D", "", telefono or "")
    return digitos[-10:]


def buscar_paciente_por_telefono(clinica, telefono: str):
    clave = digitos_telefono(telefono)
    if len(clave) < 7:
        return None
    from apps.pacientes.models import Paciente

    candidatos = Paciente.objects.filter(clinica=clinica, activo=True, telefono__contains=clave[-7:])
    for paciente in candidatos:
        if digitos_telefono(paciente.telefono) == clave:
            return paciente
    return None


# ── Consultas ──────────────────────────────────────────────────────────────

def abiertas_de_venta(paciente):
    return Oportunidad.objects.filter(
        paciente=paciente, activo=True, estado=Oportunidad.Estado.ABIERTA, tipo__in=Oportunidad.TIPOS_VENTA,
    )


def _tipo_para_paciente(paciente) -> str:
    from apps.cotizaciones.models import Cotizacion

    compro = Cotizacion.objects.filter(
        paciente=paciente, estado=Cotizacion.Estado.ACEPTADA, activo=True,
    ).exists()
    return Oportunidad.Tipo.RECOMPRA if compro else Oportunidad.Tipo.NUEVA


# ── Acciones de la recepción ───────────────────────────────────────────────

@transaction.atomic
def crear_interesado(*, clinica, usuario, nombre: str, telefono: str, interes: str = "", origen: str = "",
                     origen_detalle: str = "", valor_estimado=None, responsable=None, proximo_contacto=None,
                     sede=None, paciente=None) -> Oportunidad:
    """Registra a alguien interesado. Si el teléfono ya es de un paciente, lo vincula.

    Si ese paciente ya tiene una oportunidad de venta abierta, no se duplica:
    se responde con su id para abrirla.
    """
    paciente = paciente or buscar_paciente_por_telefono(clinica, telefono)
    if paciente is not None:
        existente = abiertas_de_venta(paciente).first()
        if existente is not None:
            raise ValidationError({
                "error": f"{paciente.nombre_completo} ya está en seguimiento.",
                "code": "OPORTUNIDAD_ABIERTA",
                "oportunidad_id": str(existente.id),
            })

    oportunidad = Oportunidad.objects.create(
        clinica=clinica,
        sede=sede,
        paciente=paciente,
        contacto_nombre=(nombre or "").strip() or (paciente.nombre_completo if paciente else ""),
        contacto_telefono=(telefono or "").strip(),
        tipo=_tipo_para_paciente(paciente) if paciente else Oportunidad.Tipo.NUEVA,
        motivo=Oportunidad.Motivo.MANUAL,
        etapa=Oportunidad.Etapa.NUEVO,
        proximo_contacto=proximo_contacto or timezone.localdate(),
        origen=origen or "",
        origen_detalle=origen_detalle or "",
        interes=(interes or "").strip(),
        valor_estimado=valor_estimado,
        responsable=responsable or (usuario if getattr(usuario, "is_authenticated", False) else None),
        creada_por=usuario if getattr(usuario, "is_authenticated", False) else None,
    )
    return oportunidad


@transaction.atomic
def registrar_gestion(oportunidad, *, usuario, canal: str, resultado: str, nota: str = "",
                      proximo_contacto=None, sin_fecha: bool = False) -> GestionOportunidad:
    """Guarda el contacto y mueve la fecha del próximo: la sugerida según el
    resultado, o la que elija la recepción (``sin_fecha`` la quita)."""
    gestion = GestionOportunidad.objects.create(
        oportunidad=oportunidad, usuario=usuario, canal=canal, resultado=resultado, nota=nota or "",
    )
    if oportunidad.estado == Oportunidad.Estado.ABIERTA:
        if sin_fecha:
            oportunidad.proximo_contacto = None
        elif proximo_contacto is not None:
            oportunidad.proximo_contacto = proximo_contacto
        else:
            dias = DIAS_SEGUN_RESULTADO.get(resultado, 2)
            oportunidad.proximo_contacto = None if dias is None else timezone.localdate() + timedelta(days=dias)
        oportunidad.save(update_fields=["proximo_contacto", "updated_at"])
    return gestion


def perder(oportunidad, *, usuario, motivo: str = "", nota: str = "") -> Oportunidad:
    if oportunidad.estado != Oportunidad.Estado.ABIERTA:
        raise ValidationError({"error": "La oportunidad ya está cerrada.", "code": "OPORTUNIDAD_CERRADA"})
    oportunidad.estado = Oportunidad.Estado.PERDIDA
    oportunidad.motivo_perdida = motivo or ""
    oportunidad.nota_perdida = nota or ""
    oportunidad.proximo_contacto = None
    oportunidad.cerrada_en = timezone.now()
    oportunidad.cerrada_por = usuario if getattr(usuario, "is_authenticated", False) else None
    oportunidad.save(update_fields=[
        "estado", "motivo_perdida", "nota_perdida", "proximo_contacto", "cerrada_en", "cerrada_por", "updated_at",
    ])
    return oportunidad


def reabrir(oportunidad) -> Oportunidad:
    if oportunidad.estado == Oportunidad.Estado.ABIERTA:
        return oportunidad
    oportunidad.estado = Oportunidad.Estado.ABIERTA
    oportunidad.motivo_perdida = ""
    oportunidad.nota_perdida = ""
    oportunidad.cerrada_en = None
    oportunidad.cerrada_por = None
    oportunidad.proximo_contacto = timezone.localdate()
    oportunidad.save(update_fields=[
        "estado", "motivo_perdida", "nota_perdida", "cerrada_en", "cerrada_por", "proximo_contacto", "updated_at",
    ])
    return oportunidad


def vincular_paciente(oportunidad, paciente) -> Oportunidad:
    """Pasa el interesado a paciente (al completar la ficha para la valoración)."""
    if paciente.clinica_id != oportunidad.clinica_id:
        raise ValidationError({"error": "El paciente no es de esta clínica.", "code": "PACIENTE_INVALIDO"})
    oportunidad.paciente = paciente
    if oportunidad.es_venta:
        oportunidad.tipo = _tipo_para_paciente(paciente)
    oportunidad.save(update_fields=["paciente", "tipo", "updated_at"])
    return oportunidad


# ── Avance automático (ganchos) ────────────────────────────────────────────

@_sin_romper
def al_crear_cita(cita):
    """Una cita para un interesado en etapa Nuevo es su valoración."""
    if getattr(cita, "es_migracion", False) or cita.paciente_id is None:
        return
    fecha_cita = timezone.localdate(cita.fecha_inicio)
    for oportunidad in abiertas_de_venta(cita.paciente).filter(etapa=Oportunidad.Etapa.NUEVO):
        oportunidad.etapa = Oportunidad.Etapa.VALORACION
        oportunidad.cita = cita
        # Volver a llamar el día siguiente a la valoración si no salió con cotización.
        oportunidad.proximo_contacto = fecha_cita + timedelta(days=1)
        if oportunidad.sede_id is None:
            oportunidad.sede_id = cita.sede_id
        oportunidad.save(update_fields=["etapa", "cita", "proximo_contacto", "sede", "updated_at"])


def _oportunidad_de_cotizacion(cotizacion):
    if cotizacion.oportunidad_id:
        return cotizacion.oportunidad
    oportunidad = abiertas_de_venta(cotizacion.paciente).order_by("-created_at").first()
    if oportunidad is not None:
        type(cotizacion).objects.filter(pk=cotizacion.pk).update(oportunidad=oportunidad)
        cotizacion.oportunidad = oportunidad
    return oportunidad


@_sin_romper
def al_crear_cotizacion(cotizacion):
    """Liga la cotización a la oportunidad abierta del paciente, si la hay."""
    if getattr(cotizacion, "es_migracion", False):
        return
    _oportunidad_de_cotizacion(cotizacion)


@_sin_romper
def al_enviar_cotizacion(envio):
    cotizacion = envio.cotizacion
    oportunidad = _oportunidad_de_cotizacion(cotizacion)
    if oportunidad is None or oportunidad.estado != Oportunidad.Estado.ABIERTA:
        return
    campos = ["proximo_contacto", "cotizacion", "updated_at"]
    if oportunidad.etapa in (Oportunidad.Etapa.NUEVO, Oportunidad.Etapa.VALORACION):
        oportunidad.etapa = Oportunidad.Etapa.COTIZADO
        campos.append("etapa")
    oportunidad.cotizacion = cotizacion
    oportunidad.valor_estimado = cotizacion.total
    campos.append("valor_estimado")
    oportunidad.proximo_contacto = timezone.localdate() + timedelta(days=DIAS_TRAS_COTIZAR)
    oportunidad.save(update_fields=campos)


@_sin_romper
def cerrar_por_descarte(cotizacion, *, usuario):
    """Al descartar la cotización, la recepción puede cerrar su oportunidad con el mismo motivo."""
    oportunidad = cotizacion.oportunidad
    if oportunidad is None or oportunidad.estado != Oportunidad.Estado.ABIERTA:
        return
    # Mismos valores en las dos listas de motivos.
    perder(oportunidad, usuario=usuario, motivo=cotizacion.motivo_descarte, nota=cotizacion.nota_descarte)


@_sin_romper
def al_aceptar_cotizacion(cotizacion):
    oportunidad = _oportunidad_de_cotizacion(cotizacion)
    if oportunidad is None or oportunidad.estado != Oportunidad.Estado.ABIERTA:
        return
    oportunidad.estado = Oportunidad.Estado.GANADA
    oportunidad.cotizacion = cotizacion
    oportunidad.valor_estimado = cotizacion.total
    oportunidad.proximo_contacto = None
    oportunidad.cerrada_en = timezone.now()
    oportunidad.cerrada_por = cotizacion.aceptada_por
    oportunidad.save(update_fields=[
        "estado", "cotizacion", "valor_estimado", "proximo_contacto", "cerrada_en", "cerrada_por", "updated_at",
    ])
