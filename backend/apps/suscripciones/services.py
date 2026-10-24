"""Ciclo de vida de la suscripción: estados, tiempos y cambios desde la consola.

Los cambios por tiempo (vence la prueba, se agota la gracia, pasan los 30 días
de solo lectura) se calculan desde las fechas cada vez que se consulta el
estado, así que no dependen de que una tarea programada haya corrido: la
tarea solo los adelanta y dispara avisos.
"""

from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.logging import registrar_accion

from .models import Suscripcion

E = Suscripcion.Estado

DIAS_PRUEBA_POR_DEFECTO = 14
# En mora con uso normal; los reintentos de cobro (días 0, 3 y 5) caben dentro.
DIAS_GRACIA = 7
DIAS_SOLO_LECTURA = 30

ACCESO_TOTAL = "total"
ACCESO_LECTURA = "lectura"
ACCESO_NINGUNO = "ninguno"

_NIVEL = {
    E.PRUEBA: ACCESO_TOTAL,
    E.ACTIVA: ACCESO_TOTAL,
    E.EN_GRACIA: ACCESO_TOTAL,
    E.SOLO_LECTURA: ACCESO_LECTURA,
    E.CANCELADA: ACCESO_LECTURA,
    E.SUSPENDIDA: ACCESO_NINGUNO,
}


def nivel_acceso(estado: str) -> str:
    return _NIVEL.get(estado, ACCESO_TOTAL)


def fin_del_dia(fecha: date) -> datetime:
    """23:59:59 del día en la zona de la plataforma (Bogotá)."""
    return timezone.make_aware(datetime.combine(fecha, time.max))


def dias_prueba() -> int:
    from apps.core.models import ConfiguracionGlobal

    dias = ConfiguracionGlobal.objects.filter(pk=1).values_list("dias_prueba", flat=True).first()
    return dias or DIAS_PRUEBA_POR_DEFECTO


def fin_de_prueba(dias: int, desde: datetime | None = None) -> datetime:
    """La prueba termina al final del día, no a la hora exacta del registro."""
    return fin_del_dia(timezone.localdate(desde or timezone.now()) + timedelta(days=dias))


def _siguiente(s: Suscripcion, estado: str, desde: datetime, ahora: datetime):
    """El estado al que pasa por tiempo y desde cuándo, o None si sigue igual."""
    if estado == E.PRUEBA:
        if s.prueba_termina_el and ahora > s.prueba_termina_el:
            return E.SOLO_LECTURA, s.prueba_termina_el
    elif estado == E.ACTIVA:
        if s.periodo_fin:
            vence = fin_del_dia(s.periodo_fin)
            if ahora > vence:
                return (E.CANCELADA if s.cancelar_al_terminar_periodo else E.EN_GRACIA), vence
    elif estado == E.EN_GRACIA:
        limite = desde + timedelta(days=DIAS_GRACIA)
        if ahora > limite:
            return E.SOLO_LECTURA, limite
    elif estado in (E.SOLO_LECTURA, E.CANCELADA):
        limite = desde + timedelta(days=DIAS_SOLO_LECTURA)
        if ahora > limite:
            return E.SUSPENDIDA, limite
    return None


def estado_vigente(s: Suscripcion, ahora: datetime | None = None) -> tuple[str, datetime]:
    """Estado que corresponde hoy según las fechas, aunque no se haya guardado.

    Encadena los cambios: una prueba vencida hace 40 días ya está suspendida.
    """
    ahora = ahora or timezone.now()
    estado, desde = s.estado, s.estado_desde
    while (paso := _siguiente(s, estado, desde, ahora)) is not None:
        estado, desde = paso
    return estado, desde


def actualizar_estado(s: Suscripcion, ahora: datetime | None = None) -> Suscripcion:
    """Guarda el estado vigente si cambió por tiempo (una sola vez, aunque dos
    peticiones lleguen a la par)."""
    anterior = s.estado
    estado, desde = estado_vigente(s, ahora)
    if estado == anterior:
        return s
    cambiadas = Suscripcion.objects.filter(pk=s.pk, estado=anterior).update(
        estado=estado, estado_desde=desde, updated_at=timezone.now()
    )
    s.estado, s.estado_desde = estado, desde
    if cambiadas:
        registrar_accion(
            None, "suscripcion.estado", s,
            {"resumen": f"La cuenta pasó de {E(anterior).label} a {E(estado).label}", "de": anterior, "a": estado},
            clinica=s.clinica,
        )
    return s


def dias_restantes_prueba(s: Suscripcion, ahora: datetime | None = None) -> int | None:
    """Días de calendario que quedan de prueba: 14 el día del registro, 0 el
    último día ("termina hoy"). None si no está en prueba."""
    if s.estado != E.PRUEBA or not s.prueba_termina_el:
        return None
    hoy = timezone.localdate(ahora or timezone.now())
    return max(0, (timezone.localdate(s.prueba_termina_el) - hoy).days)


def suscripcion_vigente(clinica_id) -> Suscripcion | None:
    """La suscripción con su estado al día; None si la clínica no tiene (sin restricción)."""
    s = Suscripcion.objects.filter(clinica_id=clinica_id).first()
    return actualizar_estado(s) if s is not None else None


def clinicas_con_envios_detenidos() -> set:
    """Clínicas sin acceso total (solo lectura, cancelada o suspendida): no les
    salen envíos automáticos a pacientes, que además consumen WhatsApp."""
    detenidas = set()
    for s in Suscripcion.objects.select_related("clinica"):
        if nivel_acceso(actualizar_estado(s).estado) != ACCESO_TOTAL:
            detenidas.add(s.clinica_id)
    return detenidas


# --- Altas -------------------------------------------------------------------


def crear_prueba(clinica, dias: int | None = None) -> Suscripcion:
    return Suscripcion.objects.create(
        clinica=clinica,
        estado=E.PRUEBA,
        modo_cobro=Suscripcion.ModoCobro.AUTOMATICO,
        prueba_termina_el=fin_de_prueba(dias if dias is not None else dias_prueba()),
    )


def crear_manual(clinica, pagado_hasta: date | None = None, ciclo: str = Suscripcion.Ciclo.MENSUAL) -> Suscripcion:
    return Suscripcion.objects.create(
        clinica=clinica,
        estado=E.ACTIVA,
        modo_cobro=Suscripcion.ModoCobro.MANUAL,
        ciclo=ciclo,
        periodo_inicio=timezone.localdate(),
        periodo_fin=pagado_hasta,
    )


# --- Acciones del superadmin ---------------------------------------------------


class AccionNoPermitida(ValueError):
    pass


@transaction.atomic
def extender_prueba(s: Suscripcion, dias: int, motivo: str, request=None) -> Suscripcion:
    """Suma días a la prueba. Si ya venció y nunca pagó, la reabre desde hoy."""
    s = Suscripcion.objects.select_for_update().get(pk=s.pk)
    actualizar_estado(s)
    if dias < 1 or dias > 90:
        raise AccionNoPermitida("Indica entre 1 y 90 días.")
    if s.estado == E.PRUEBA:
        s.prueba_termina_el = fin_del_dia(timezone.localdate(s.prueba_termina_el) + timedelta(days=dias))
    elif s.periodo_inicio is None and s.estado in (E.SOLO_LECTURA, E.SUSPENDIDA):
        s.estado = E.PRUEBA
        s.estado_desde = timezone.now()
        s.prueba_termina_el = fin_de_prueba(dias)
    else:
        raise AccionNoPermitida("Esta clínica ya pagó un periodo: registra un pago manual en vez de extender la prueba.")
    s.save()
    registrar_accion(
        request, "suscripcion.extender_prueba", s,
        {
            "resumen": f"Prueba extendida {dias} días, hasta el {timezone.localdate(s.prueba_termina_el):%d/%m/%Y}",
            "dias": dias,
            "motivo": motivo,
        },
        clinica=s.clinica,
    )
    return s


@transaction.atomic
def registrar_pago_manual(
    s: Suscripcion, *, pagado_hasta: date | None, ciclo: str, nota: str = "", request=None
) -> Suscripcion:
    """Activa la cuenta con cobro manual. Sin `pagado_hasta` no vence."""
    s = Suscripcion.objects.select_for_update().get(pk=s.pk)
    hoy = timezone.localdate()
    if pagado_hasta is not None and pagado_hasta < hoy:
        raise AccionNoPermitida("La fecha de pagado hasta no puede ser anterior a hoy.")
    s.estado = E.ACTIVA
    s.estado_desde = timezone.now()
    s.modo_cobro = Suscripcion.ModoCobro.MANUAL
    s.ciclo = ciclo
    s.periodo_inicio = hoy
    s.periodo_fin = pagado_hasta
    s.intentos_fallidos = 0
    s.cancelar_al_terminar_periodo = False
    if nota:
        s.nota_interna = (s.nota_interna + "\n" if s.nota_interna else "") + f"{hoy:%d/%m/%Y}: {nota}"
    s.save()
    hasta = f"hasta el {pagado_hasta:%d/%m/%Y}" if pagado_hasta else "sin vencimiento"
    registrar_accion(
        request, "suscripcion.pago_manual", s,
        {"resumen": f"Pago manual registrado ({s.get_ciclo_display().lower()}, {hasta})", "nota": nota},
        clinica=s.clinica,
    )
    return s
