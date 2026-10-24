"""Cobro de la suscripción con tarjeta (Wompi): contratar, renovar, reintentar,
cambiar tarjeta o plan y cancelar. Ver §8 del plan.

Reglas:
- Fecha de cobro propia por clínica (D6): el periodo empieza al terminar la
  prueba (o al pagar, si ya venció) y se renueva el mismo día de cada mes o año;
  si el mes no tiene ese día, el último del mes.
- Se cobra el último día del periodo. Si falla: en gracia, reintentos a los 3 y
  5 días y, al tercer fallo, solo lectura.
- Subir de plan se cobra ya, prorrateado; bajar de plan o cambiar de ciclo se
  aplica al renovar.
"""

import calendar
import logging
import secrets
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.logging import registrar_accion

from . import wompi
from .models import CobroSuscripcion, DatosFacturacion, FuentePago, Suscripcion

logger = logging.getLogger(__name__)
E = Suscripcion.Estado
C = CobroSuscripcion.Estado

# Reintentos tras un cobro de renovación rechazado (días desde el intento anterior).
DIAS_ENTRE_REINTENTOS = (3, 2)
INTENTOS_MAXIMOS = 3
# Un cobro pendiente que no se resuelve en este tiempo se consulta a Wompi.
MINUTOS_PARA_CONSULTAR = 10


class CobroNoPermitido(ValueError):
    """Error que se le puede mostrar a la clínica tal cual."""


# --- Cálculos ---------------------------------------------------------------------


def precio_periodo(plan, ciclo: str) -> Decimal:
    """Pesos enteros: el mes, o el año con el descuento anual del plan."""
    if plan.precio is None:
        raise CobroNoPermitido("Este plan se cotiza a la medida: escríbenos para activarlo.")
    mensual = Decimal(plan.precio)
    if ciclo == Suscripcion.Ciclo.ANUAL:
        total = mensual * 12 * (Decimal(100) - Decimal(plan.descuento_anual_pct)) / 100
    else:
        total = mensual
    return total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def sumar_meses(fecha: date, meses: int, ancla: int) -> date:
    total = fecha.month - 1 + meses
    anio, mes = fecha.year + total // 12, total % 12 + 1
    return date(anio, mes, min(ancla, calendar.monthrange(anio, mes)[1]))


def fin_de_periodo(inicio: date, ciclo: str, ancla: int) -> date:
    meses = 12 if ciclo == Suscripcion.Ciclo.ANUAL else 1
    return sumar_meses(inicio, meses, ancla) - timedelta(days=1)


def _referencia(suscripcion: Suscripcion) -> str:
    return f"CQ-{str(suscripcion.clinica_id)[:8]}-{timezone.now():%Y%m%d%H%M%S}-{secrets.token_hex(2)}"


def _centavos(pesos: Decimal) -> int:
    return int(pesos * 100)


def validar_limites(clinica, plan) -> None:
    """No se puede contratar un plan más chico que lo que la clínica ya usa."""
    from apps.clinicas.models import Sede
    from apps.users.services import contar_usuarios_que_ocupan_cupo

    usuarios = contar_usuarios_que_ocupan_cupo(clinica)
    if plan.max_usuarios and usuarios > plan.max_usuarios:
        raise CobroNoPermitido(
            f"Tu clínica tiene {usuarios} usuarios y el plan {plan.nombre} permite {plan.max_usuarios}. "
            "Desactiva usuarios o elige un plan más grande."
        )
    sedes = Sede.objects.filter(clinica=clinica, activo=True).count()
    if plan.max_sedes and sedes > plan.max_sedes:
        raise CobroNoPermitido(
            f"Tu clínica tiene {sedes} sedes y el plan {plan.nombre} permite {plan.max_sedes}. "
            "Desactiva sedes o elige un plan más grande."
        )


# --- Tarjeta ----------------------------------------------------------------------


def guardar_tarjeta(
    clinica, *, token: str, email: str, acceptance_token: str, accept_personal_auth: str,
    tarjeta: dict, aceptacion: dict, usuario=None,
) -> FuentePago:
    data = wompi.crear_fuente_pago(
        token=token, email=email, acceptance_token=acceptance_token, accept_personal_auth=accept_personal_auth,
    )
    if data.get("status") != "AVAILABLE":
        raise CobroNoPermitido("La tarjeta no quedó disponible para cobros. Revisa los datos o usa otra tarjeta.")
    return FuentePago.objects.create(
        clinica=clinica,
        wompi_id=str(data["id"]),
        marca=str(tarjeta.get("marca", ""))[:30],
        ultimos4=str(tarjeta.get("ultimos4", ""))[-4:],
        expira_mes=str(tarjeta.get("expira_mes", ""))[:2],
        expira_anio=str(tarjeta.get("expira_anio", ""))[:4],
        titular=str(tarjeta.get("titular", ""))[:120],
        email=email,
        creada_por=usuario,
        aceptacion=aceptacion,
    )


def _anular(fuente: FuentePago | None) -> None:
    if fuente is None or fuente.estado == FuentePago.Estado.ANULADA:
        return
    # Wompi solo deja anular por API las fuentes de preautorización: las de cobro
    # normal quedan allá, pero CliniQ ya no las usa (se marcan anuladas aquí).
    try:
        wompi.anular_fuente_pago(fuente.wompi_id)
    except wompi.WompiError:
        logger.info("Wompi no anuló la fuente de pago %s; queda anulada solo en CliniQ", fuente.wompi_id)
    fuente.estado = FuentePago.Estado.ANULADA
    fuente.save(update_fields=["estado", "updated_at"])


# --- Ejecutar y resolver un cobro ----------------------------------------------------


def ejecutar(cobro: CobroSuscripcion) -> CobroSuscripcion:
    """Envía el cobro a Wompi y aplica el resultado si ya es final."""
    fuente = cobro.fuente_pago
    try:
        data = wompi.cobrar(
            referencia=cobro.referencia, monto_centavos=cobro.monto_centavos,
            email=fuente.email, fuente_id=fuente.wompi_id,
        )
    except wompi.WompiError as exc:
        resolver(cobro, wompi.ERROR, str(exc))
        return cobro
    cobro.wompi_transaccion_id = str(data.get("id", ""))
    cobro.respuesta = {k: data.get(k) for k in ("id", "status", "status_message", "payment_method_type", "created_at")}
    cobro.save(update_fields=["wompi_transaccion_id", "respuesta", "updated_at"])
    resolver(cobro, data.get("status", wompi.PENDIENTE), data.get("status_message") or "")
    return cobro


def consultar(cobro: CobroSuscripcion) -> CobroSuscripcion:
    """Para cobros pendientes: pregunta a Wompi (respaldo del webhook)."""
    if cobro.estado != C.PENDIENTE or not cobro.wompi_transaccion_id:
        return cobro
    try:
        data = wompi.consultar_transaccion(cobro.wompi_transaccion_id)
    except wompi.WompiError:
        return cobro
    resolver(cobro, data.get("status", wompi.PENDIENTE), data.get("status_message") or "")
    return cobro


def resolver(cobro: CobroSuscripcion, estado_wompi: str, mensaje: str = "") -> None:
    if estado_wompi == wompi.APROBADA:
        aprobar(cobro)
    elif estado_wompi in (wompi.RECHAZADA, wompi.ERROR, wompi.ANULADA):
        rechazar(cobro, estado_wompi, mensaje)


@transaction.atomic
def aprobar(cobro: CobroSuscripcion) -> None:
    cobro = CobroSuscripcion.objects.select_for_update().select_related("suscripcion__clinica", "plan").get(pk=cobro.pk)
    if cobro.estado == C.APROBADO:
        return  # webhook y consulta pueden llegar los dos
    cobro.estado = C.APROBADO
    cobro.resuelto_at = timezone.now()
    cobro.save(update_fields=["estado", "resuelto_at", "updated_at"])

    s = Suscripcion.objects.select_for_update().get(pk=cobro.suscripcion_id)
    clinica = cobro.suscripcion.clinica
    if cobro.concepto == CobroSuscripcion.Concepto.CAMBIO_PLAN:
        s.precio_periodo = precio_periodo(cobro.plan, s.ciclo)
        s.plan_pendiente, s.ciclo_pendiente = None, ""
    else:
        s.estado = E.ACTIVA
        s.estado_desde = timezone.now()
        s.modo_cobro = Suscripcion.ModoCobro.AUTOMATICO
        s.ciclo = cobro.ciclo
        s.periodo_inicio, s.periodo_fin = cobro.periodo_inicio, cobro.periodo_fin
        s.dia_ancla = s.dia_ancla or cobro.periodo_inicio.day
        s.proximo_cobro_el = cobro.periodo_fin
        s.intentos_fallidos = 0
        s.precio_periodo = cobro.monto
        s.plan_pendiente, s.ciclo_pendiente = None, ""
        if cobro.concepto == CobroSuscripcion.Concepto.PRIMER_PAGO:
            s.cancelar_al_terminar_periodo = False
    if cobro.fuente_pago_id:
        s.fuente_pago_id = cobro.fuente_pago_id
    s.save()
    if clinica.plan_id != cobro.plan_id:
        clinica.plan = cobro.plan
        clinica.save(update_fields=["plan", "updated_at"])
    # Factura electrónica (Alegra) cuando el cobro ya quedó guardado; si falla,
    # la tarea periódica la reintenta.
    from .facturacion import emitir_despues_de_aprobar

    transaction.on_commit(lambda: emitir_despues_de_aprobar(cobro.pk))
    registrar_accion(
        None, "suscripcion.pago_aprobado", s,
        {"resumen": f"Pago aprobado: {cobro.get_concepto_display().lower()} de ${cobro.monto:,.0f} ({cobro.plan.nombre})",
         "referencia": cobro.referencia},
        clinica=clinica,
    )


@transaction.atomic
def rechazar(cobro: CobroSuscripcion, estado_wompi: str, mensaje: str) -> None:
    cobro = CobroSuscripcion.objects.select_for_update().select_related("suscripcion__clinica").get(pk=cobro.pk)
    if cobro.estado != C.PENDIENTE:
        return
    cobro.estado = C.ERROR if estado_wompi == wompi.ERROR else C.RECHAZADO
    cobro.mensaje = (mensaje or "")[:255]
    cobro.resuelto_at = timezone.now()
    cobro.save(update_fields=["estado", "mensaje", "resuelto_at", "updated_at"])
    clinica = cobro.suscripcion.clinica
    registrar_accion(
        None, "suscripcion.pago_rechazado", cobro.suscripcion,
        {"resumen": f"Pago rechazado: {cobro.get_concepto_display().lower()} ({mensaje or estado_wompi})",
         "referencia": cobro.referencia},
        clinica=clinica,
    )
    if cobro.concepto == CobroSuscripcion.Concepto.PRIMER_PAGO:
        # La tarjeta no sirvió: no queda guardada para cobros futuros. Wompi
        # puede rechazar al instante o después (pendiente → rechazado).
        _anular(cobro.fuente_pago)
    if cobro.concepto != CobroSuscripcion.Concepto.RENOVACION:
        return  # el primer pago o un cambio de plan rechazado no cambian la cuenta

    s = Suscripcion.objects.select_for_update().get(pk=cobro.suscripcion_id)
    s.intentos_fallidos += 1
    hoy = timezone.localdate()
    if s.intentos_fallidos >= INTENTOS_MAXIMOS:
        s.estado, s.estado_desde = E.SOLO_LECTURA, timezone.now()
        s.proximo_cobro_el = None
    else:
        if s.estado == E.ACTIVA:
            s.estado, s.estado_desde = E.EN_GRACIA, timezone.now()
        s.proximo_cobro_el = hoy + timedelta(days=DIAS_ENTRE_REINTENTOS[s.intentos_fallidos - 1])
    s.save()


# --- Acciones de la clínica ------------------------------------------------------------


def _guardar_datos_facturacion(clinica, datos: dict) -> DatosFacturacion:
    facturacion, _ = DatosFacturacion.objects.update_or_create(clinica=clinica, defaults=datos)
    return facturacion


def contratar(
    s: Suscripcion, *, plan, ciclo: str, token: str, acceptance_token: str, accept_personal_auth: str,
    tarjeta: dict, datos_facturacion: dict, aceptacion: dict, usuario=None,
) -> CobroSuscripcion:
    """Elegir plan desde la prueba, la solo lectura o la suspensión: guarda la
    tarjeta y cobra el primer periodo de inmediato."""
    if s.estado in (E.ACTIVA, E.EN_GRACIA) and s.modo_cobro == Suscripcion.ModoCobro.AUTOMATICO and s.fuente_pago_id:
        raise CobroNoPermitido("Tu clínica ya tiene un plan activo: cámbialo desde Configuración → Plan.")
    if s.cobros.filter(estado=C.PENDIENTE).exists():
        raise CobroNoPermitido("Hay un pago en proceso. Espera unos segundos y vuelve a intentar.")
    monto = precio_periodo(plan, ciclo)
    validar_limites(s.clinica, plan)
    facturacion = _guardar_datos_facturacion(s.clinica, datos_facturacion)
    fuente = guardar_tarjeta(
        s.clinica, token=token, email=facturacion.email_facturacion, acceptance_token=acceptance_token,
        accept_personal_auth=accept_personal_auth, tarjeta=tarjeta, aceptacion=aceptacion, usuario=usuario,
    )
    hoy = timezone.localdate()
    inicio = hoy
    # Pagar durante la prueba no hace perder días: el periodo empieza al terminarla.
    if s.estado == E.PRUEBA and s.prueba_termina_el:
        inicio = max(hoy, timezone.localdate(s.prueba_termina_el) + timedelta(days=1))
    # Cliente con pago manual que pasa a tarjeta: empieza cuando se acabe lo pagado.
    elif s.estado == E.ACTIVA and s.periodo_fin and s.periodo_fin >= hoy:
        inicio = s.periodo_fin + timedelta(days=1)
    cobro = CobroSuscripcion.objects.create(
        suscripcion=s, referencia=_referencia(s), concepto=CobroSuscripcion.Concepto.PRIMER_PAGO,
        plan=plan, ciclo=ciclo, periodo_inicio=inicio, periodo_fin=fin_de_periodo(inicio, ciclo, inicio.day),
        monto_centavos=_centavos(monto), fuente_pago=fuente,
    )
    ejecutar(cobro)
    cobro.refresh_from_db()
    return cobro


def renovar(s: Suscripcion) -> CobroSuscripcion | None:
    """Cobra el siguiente periodo si toca hoy (o el reintento). Idempotente."""
    hoy = timezone.localdate()
    if (
        s.modo_cobro != Suscripcion.ModoCobro.AUTOMATICO
        or s.estado not in (E.ACTIVA, E.EN_GRACIA)
        or s.cancelar_al_terminar_periodo
        or not s.fuente_pago_id
        or s.fuente_pago.estado != FuentePago.Estado.DISPONIBLE
        or not s.proximo_cobro_el
        or s.proximo_cobro_el > hoy
        or not s.periodo_fin
        or s.cobros.filter(estado=C.PENDIENTE).exists()
    ):
        return None
    plan = s.plan_pendiente or s.clinica.plan
    ciclo = s.ciclo_pendiente or s.ciclo
    if plan is None:
        logger.warning("Suscripción %s sin plan para renovar", s.pk)
        return None
    cambia = s.plan_pendiente_id is not None or bool(s.ciclo_pendiente)
    monto = precio_periodo(plan, ciclo) if cambia or s.precio_periodo is None else s.precio_periodo
    inicio = s.periodo_fin + timedelta(days=1)
    ancla = s.dia_ancla or inicio.day
    cobro = CobroSuscripcion.objects.create(
        suscripcion=s, referencia=_referencia(s), concepto=CobroSuscripcion.Concepto.RENOVACION,
        plan=plan, ciclo=ciclo, periodo_inicio=inicio, periodo_fin=fin_de_periodo(inicio, ciclo, ancla),
        monto_centavos=_centavos(monto), fuente_pago=s.fuente_pago,
    )
    return ejecutar(cobro)


def cambiar_tarjeta(
    s: Suscripcion, *, token: str, acceptance_token: str, accept_personal_auth: str,
    tarjeta: dict, aceptacion: dict, usuario=None,
) -> FuentePago:
    """Guarda la tarjeta nueva y anula la anterior. En mora, reintenta el cobro ya."""
    email = getattr(getattr(s.clinica, "datos_facturacion", None), "email_facturacion", "") or (
        s.fuente_pago.email if s.fuente_pago else usuario.email
    )
    nueva = guardar_tarjeta(
        s.clinica, token=token, email=email, acceptance_token=acceptance_token,
        accept_personal_auth=accept_personal_auth, tarjeta=tarjeta, aceptacion=aceptacion, usuario=usuario,
    )
    anterior = s.fuente_pago
    s.fuente_pago = nueva
    if s.estado == E.EN_GRACIA:
        s.proximo_cobro_el = timezone.localdate()
    s.save(update_fields=["fuente_pago", "proximo_cobro_el", "updated_at"])
    _anular(anterior)
    registrar_accion(None, "suscripcion.tarjeta", s, {"resumen": f"Tarjeta actualizada a {nueva}"}, clinica=s.clinica, actor=usuario)
    if s.estado == E.EN_GRACIA:
        renovar(s)
    return nueva


def cambiar_plan(s: Suscripcion, *, plan, ciclo: str, usuario=None) -> CobroSuscripcion | None:
    """Subir de plan (mismo ciclo, más caro): se cobra ya la diferencia por los
    días que quedan. Bajar de plan o cambiar de ciclo: al renovar."""
    if s.estado != E.ACTIVA or s.modo_cobro != Suscripcion.ModoCobro.AUTOMATICO or not s.fuente_pago_id:
        raise CobroNoPermitido("Solo se puede cambiar de plan con la cuenta activa y una tarjeta guardada.")
    validar_limites(s.clinica, plan)
    nuevo = precio_periodo(plan, ciclo)
    actual = s.precio_periodo or Decimal(0)
    hoy = timezone.localdate()
    if plan.pk == s.clinica.plan_id and ciclo == s.ciclo:
        s.plan_pendiente, s.ciclo_pendiente = None, ""
        s.save(update_fields=["plan_pendiente", "ciclo_pendiente", "updated_at"])
        return None
    if ciclo == s.ciclo and nuevo > actual and s.periodo_inicio and s.periodo_fin and s.periodo_inicio <= hoy:
        dias_total = (s.periodo_fin - s.periodo_inicio).days + 1
        dias_restantes = (s.periodo_fin - hoy).days + 1
        diferencia = ((nuevo - actual) * dias_restantes / dias_total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        cobro = CobroSuscripcion.objects.create(
            suscripcion=s, referencia=_referencia(s), concepto=CobroSuscripcion.Concepto.CAMBIO_PLAN,
            plan=plan, ciclo=ciclo, periodo_inicio=hoy, periodo_fin=s.periodo_fin,
            monto_centavos=_centavos(diferencia), fuente_pago=s.fuente_pago,
        )
        return ejecutar(cobro)
    s.plan_pendiente = plan if plan.pk != s.clinica.plan_id else None
    s.ciclo_pendiente = ciclo if ciclo != s.ciclo else ""
    s.save(update_fields=["plan_pendiente", "ciclo_pendiente", "updated_at"])
    registrar_accion(
        None, "suscripcion.cambio_programado", s,
        {"resumen": f"Cambio a {plan.nombre} ({ciclo}) desde la próxima renovación"}, clinica=s.clinica, actor=usuario,
    )
    return None


def cancelar(s: Suscripcion, *, cancelar: bool, usuario=None) -> Suscripcion:
    """No renovar al terminar el periodo (o deshacerlo). Sin reembolsos parciales."""
    if s.modo_cobro != Suscripcion.ModoCobro.AUTOMATICO or s.estado not in (E.ACTIVA, E.EN_GRACIA):
        raise CobroNoPermitido("No hay una renovación automática que cancelar.")
    s.cancelar_al_terminar_periodo = cancelar
    s.save(update_fields=["cancelar_al_terminar_periodo", "updated_at"])
    registrar_accion(
        None, "suscripcion.cancelar" if cancelar else "suscripcion.reanudar", s,
        {"resumen": "Renovación cancelada al terminar el periodo" if cancelar else "Renovación automática reactivada"},
        clinica=s.clinica, actor=usuario,
    )
    return s


def procesar_cobros() -> list[str]:
    """Para la tarea periódica: consulta los pendientes atascados y renueva lo que toque."""
    hechos = []
    limite = timezone.now() - timedelta(minutes=MINUTOS_PARA_CONSULTAR)
    for cobro in CobroSuscripcion.objects.filter(estado=C.PENDIENTE, created_at__lt=limite).exclude(wompi_transaccion_id=""):
        consultar(cobro)
    for s in Suscripcion.objects.select_related("clinica__plan", "fuente_pago", "plan_pendiente").filter(
        modo_cobro=Suscripcion.ModoCobro.AUTOMATICO, proximo_cobro_el__lte=timezone.localdate(),
    ):
        try:
            cobro = renovar(s)
        except CobroNoPermitido as exc:
            logger.warning("No se renovó %s: %s", s.clinica_id, exc)
            continue
        if cobro is not None:
            cobro.refresh_from_db()
            hechos.append(f"{s.clinica.nombre}: renovación {cobro.estado} (${cobro.monto:,.0f})")
    return hechos
