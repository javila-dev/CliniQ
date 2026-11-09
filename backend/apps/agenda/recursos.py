"""Salas y equipos en la agenda (docs/plan-salas-y-equipos.md).

Un procedimiento puede necesitar una sala (cualquiera o solo algunas) y uno o
varios equipos (de cada lista sirve cualquiera libre). Una cita ocupa lo que
piden sus procedimientos más lo que se le eligió a mano al agendar. Una sede sin
salas ni equipos, o un procedimiento que no necesita nada, funcionan como antes.

Piezas:
- `procedimientos_de` / `procedimientos_de_cita`: qué procedimientos hace la cita.
- `exigencias_de`: qué salas y equipos necesita, en esa sede.
- `Ocupacion`: qué está ocupado, bloqueado o fuera de horario en una ventana.
- `asignar`: elige una unidad libre por exigencia.
- `resolver_recursos`: crear y editar citas (bloquea filas y levanta el error).
- `reasignar_citas_futuras`: al cambiar la configuración, reacomoda lo agendado.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q, Sum, prefetch_related_objects
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.agenda.models import BloqueoAgenda, Cita, CitaRecurso
from apps.clinicas.models import HorarioRecurso, Recurso, Servicio

SALA = Recurso.Tipo.SALA
EQUIPO = Recurso.Tipo.EQUIPO

DIAS_SEMANA = {
    0: "lunes", 1: "martes", 2: "miercoles", 3: "jueves", 4: "viernes", 5: "sabado", 6: "domingo",
}

# Causas por las que una unidad no sirve a esa hora.
OCUPADO = "ocupado"
FUERA_DE_HORARIO = "fuera_de_horario"
BLOQUEADO = "bloqueado"
SIN_COMPATIBLE = "sin_compatible"

CODIGOS = {
    OCUPADO: "RECURSO_OCUPADO",
    FUERA_DE_HORARIO: "RECURSO_FUERA_DE_HORARIO",
    BLOQUEADO: "RECURSO_BLOQUEADO",
    SIN_COMPATIBLE: "RECURSO_SIN_SALA_COMPATIBLE",
}

ESTADOS_QUE_LIBERAN = (Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO)
# Citas futuras que se reacomodan al cambiar la configuración.
ESTADOS_REASIGNABLES = (Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA, Cita.Estado.EN_ESPERA)

NO_ENVIADO = object()


@dataclass(frozen=True)
class Exigencia:
    """Una sala o un equipo que la cita necesita: sirve cualquiera de `candidatos`
    (ids de Recurso en orden de preferencia)."""

    tipo: str
    candidatos: tuple
    a_mano: bool = False


@dataclass
class Resultado:
    asignados: list = field(default_factory=list)  # [(Exigencia, recurso_id)]
    faltas: list = field(default_factory=list)  # [(Exigencia, causa)]


# ── Qué procedimientos hace la cita ─────────────────────────────────────────


def tipo_sesion_por_defecto(tratamiento):
    """El tipo de sesión con el que se calcula la duración de una cita de
    tratamiento sin sesión elegida (`_resolver_duracion`): el de compromiso más
    largo. Así horario y salas/equipos salen del mismo tipo."""
    tipos = tratamiento.tipos_sesion.filter(es_compromiso=True, activo=True)
    tipo = tipos.filter(duracion_min__gt=0).order_by("-duracion_min", "orden").first()
    if tipo is not None:
        return tipo
    return (
        tipos.annotate(total=Sum("procedimientos__procedimiento__duracion_min"))
        .filter(total__gt=0)
        .order_by("-total", "orden")
        .first()
    )


def _procedimientos_del_tipo(tipo_sesion):
    return [
        tp.procedimiento
        for tp in tipo_sesion.procedimientos.filter(activo=True).select_related("procedimiento").order_by("orden")
    ]


def procedimientos_de(*, servicio=None, item_cotizacion=None, sesion=None) -> list:
    """Procedimientos que se realizan en la cita (sin repetir)."""
    encontrados = {}

    def agregar(procedimientos):
        for p in procedimientos:
            if p is not None:
                encontrados.setdefault(p.id, p)

    if servicio is not None:
        agregar([servicio])
    if sesion is not None:
        if sesion.tipo_sesion_id:
            agregar(_procedimientos_del_tipo(sesion.tipo_sesion))
        elif sesion.procedimiento_id:
            agregar([sesion.procedimiento])
    elif item_cotizacion is not None:
        if item_cotizacion.tratamiento_id:
            tipo = tipo_sesion_por_defecto(item_cotizacion.tratamiento)
            if tipo is not None:
                agregar(_procedimientos_del_tipo(tipo))
        if not encontrados and item_cotizacion.procedimiento_efectivo_id:
            agregar([item_cotizacion.procedimiento_efectivo])
    return list(encontrados.values())


def sesion_de_cita(cita):
    """Sesión de tratamiento enganchada a la cita (prefiere la pendiente)."""
    from apps.protocolos.models import SesionProcedimiento

    vinculadas = list(cita.sesiones_protocolo.all())
    if not vinculadas:
        return None
    return next((s for s in vinculadas if s.estado == SesionProcedimiento.Estado.PENDIENTE), vinculadas[0])


def clave_de_forma(cita):
    """Lo que decide qué procedimientos hace la cita: dos citas con la misma
    clave necesitan las mismas salas y equipos (para calcularlo una vez)."""
    sesion = sesion_de_cita(cita)
    if sesion is not None:
        origen = ("tipo", sesion.tipo_sesion_id, sesion.procedimiento_id)
    elif cita.item_cotizacion_id:
        item = cita.item_cotizacion
        origen = ("item", item.tratamiento_id, item.procedimiento_efectivo_id)
    else:
        origen = None
    return (cita.servicio_id, origen)


def procedimientos_de_cita(cita, *, servicio=NO_ENVIADO) -> list:
    """Procedimientos de una cita ya guardada. `servicio`: el nuevo, al editar."""
    return procedimientos_de(
        servicio=cita.servicio if servicio is NO_ENVIADO else servicio,
        item_cotizacion=cita.item_cotizacion,
        sesion=sesion_de_cita(cita),
    )


# ── Qué necesita ────────────────────────────────────────────────────────────


def recursos_activos(sede) -> dict:
    """Salas y equipos activos de la sede, en orden de preferencia."""
    return {r.id: r for r in Recurso.objects.filter(sede=sede, activo=True).order_by("orden", "nombre")}


def exigencias_de(procedimientos, recursos: dict) -> list:
    """Salas y equipos que necesitan los procedimientos, con los recursos de la
    sede (`recursos_activos`). Solo cuentan los de esa sede: una sede que no
    configuró salas sigue igual aunque el procedimiento las pida en otra."""
    if not recursos or not procedimientos:
        return []
    prefetch_related_objects(procedimientos, "salas", "equipos")
    salas = [rid for rid, r in recursos.items() if r.tipo == SALA]
    equipos = [rid for rid, r in recursos.items() if r.tipo == EQUIPO]
    sede_id = next(iter(recursos.values())).sede_id
    exigencias = []

    if salas and any(p.necesita_sala != Servicio.NecesitaSala.NO for p in procedimientos):
        candidatos = list(salas)
        for p in procedimientos:
            if p.necesita_sala != Servicio.NecesitaSala.ALGUNAS:
                continue
            # Sin ninguna sala de esta sede en su lista, aquí sirve cualquiera.
            # Si las tiene pero están inactivas, no sirve ninguna: falta sala.
            de_la_sede = {s.id for s in p.salas.all() if s.sede_id == sede_id}
            if de_la_sede:
                candidatos = [s for s in candidatos if s in de_la_sede]
        exigencias.append(Exigencia(SALA, tuple(candidatos)))

    vistos = set()
    for p in procedimientos:
        suyos = {e.id for e in p.equipos.all()}
        candidatos = tuple(e for e in equipos if e in suyos)
        if candidatos and frozenset(candidatos) not in vistos:
            vistos.add(frozenset(candidatos))
            exigencias.append(Exigencia(EQUIPO, candidatos))
    return exigencias


# ── Qué está libre ──────────────────────────────────────────────────────────


def _rango(cita):
    # Igual que services.obtener_rango_ocupado: en curso ocupa desde el inicio real.
    if cita.estado == Cita.Estado.EN_CURSO and cita.fecha_inicio_real and cita.duracion_min:
        return cita.fecha_inicio_real, cita.fecha_inicio_real + timedelta(minutes=cita.duracion_min)
    return cita.fecha_inicio, cita.fecha_fin


class Ocupacion:
    """Ocupación de las salas y equipos de una sede en una ventana de tiempo.
    Se lee una vez y se consulta en memoria (horarios del día, reacomodar)."""

    def __init__(self, sede, recursos: dict | None = None):
        self.sede = sede
        self.recursos = recursos if recursos is not None else recursos_activos(sede)
        self._ocupado = defaultdict(list)  # recurso_id -> [(ini, fin, cita_id)]
        self._bloqueado = defaultdict(list)  # recurso_id -> [(ini, fin, motivo)]
        self._horario = {}

    def cargar(self, desde, hasta, *, excluir_cita_ids=()):
        ids = list(self.recursos)
        if not ids:
            return self
        self._horario = {
            (h.recurso_id, h.dia_semana): h
            for h in HorarioRecurso.objects.filter(recurso_id__in=ids, activo=True)
        }
        asignaciones = (
            CitaRecurso.objects.filter(recurso_id__in=ids)
            .exclude(cita__estado__in=ESTADOS_QUE_LIBERAN)
            .filter(
                Q(cita__fecha_inicio__lt=hasta, cita__fecha_fin__gt=desde)
                | Q(
                    cita__estado=Cita.Estado.EN_CURSO,
                    cita__fecha_inicio_real__lt=hasta,
                    cita__fecha_inicio_real__gt=desde - timedelta(days=1),
                )
            )
            .exclude(cita_id__in=[c for c in excluir_cita_ids if c])
            .select_related("cita")
            .only(
                "recurso_id", "cita_id", "cita__estado", "cita__fecha_inicio", "cita__fecha_fin",
                "cita__fecha_inicio_real", "cita__duracion_min",
            )
        )
        for a in asignaciones:
            ini, fin = _rango(a.cita)
            self._ocupado[a.recurso_id].append((ini, fin, a.cita_id))
        bloqueos = BloqueoAgenda.objects.filter(
            recurso_id__in=ids,
            estado=BloqueoAgenda.Estado.APROBADO,
            fecha_inicio__lt=hasta,
            fecha_fin__gt=desde,
        ).values_list("recurso_id", "fecha_inicio", "fecha_fin", "motivo")
        for rid, ini, fin, motivo in bloqueos:
            self._bloqueado[rid].append((ini, fin, motivo))
        return self

    def fuera_de_horario(self, recurso_id, ini, fin) -> bool:
        local_ini = timezone.localtime(ini)
        horario = self._horario.get((recurso_id, DIAS_SEMANA[local_ini.weekday()]))
        if horario is None:
            return False
        if horario.no_disponible:
            return True
        if horario.hora_inicio and horario.hora_fin:
            tz = timezone.get_current_timezone()
            desde = timezone.make_aware(datetime.combine(local_ini.date(), horario.hora_inicio), tz)
            hasta = timezone.make_aware(datetime.combine(local_ini.date(), horario.hora_fin), tz)
            return not (desde <= ini and fin <= hasta)
        return False

    def causa(self, recurso_id, ini, fin):
        """None si la unidad está libre en [ini, fin); si no, por qué no."""
        if recurso_id not in self.recursos or self.fuera_de_horario(recurso_id, ini, fin):
            return FUERA_DE_HORARIO
        if any(b_ini < fin and b_fin > ini for b_ini, b_fin, _ in self._bloqueado[recurso_id]):
            return BLOQUEADO
        if any(o_ini < fin and o_fin > ini for o_ini, o_fin, _ in self._ocupado[recurso_id]):
            return OCUPADO
        return None

    def reservar(self, recurso_id, ini, fin, cita_id=None):
        self._ocupado[recurso_id].append((ini, fin, cita_id))


def _causa_principal(causas):
    if not causas:
        return SIN_COMPATIBLE
    if OCUPADO in causas:
        return OCUPADO
    if BLOQUEADO in causas:
        return BLOQUEADO
    return FUERA_DE_HORARIO


def asignar(ocupacion: Ocupacion, exigencias, ini, fin, *, preferidos=()) -> Resultado:
    """Una unidad libre por exigencia, sin repetir. Primero las más estrictas
    (menos candidatos); dentro de cada una, primero las `preferidas` (lo que ya
    tenía la cita) y después el orden de la sede."""
    resultado = Resultado()
    usados = set()
    preferidos = list(preferidos)
    for exigencia in sorted(exigencias, key=lambda e: len(e.candidatos)):
        orden = [c for c in preferidos if c in exigencia.candidatos]
        orden += [c for c in exigencia.candidatos if c not in orden]
        causas = []
        elegido = None
        for rid in orden:
            causa = OCUPADO if rid in usados else ocupacion.causa(rid, ini, fin)
            if causa is None:
                elegido = rid
                break
            causas.append(causa)
        if elegido is None:
            resultado.faltas.append((exigencia, _causa_principal(causas)))
        else:
            usados.add(elegido)
            resultado.asignados.append((exigencia, elegido))
    return resultado


# ── Mensajes ────────────────────────────────────────────────────────────────


def _nombres(exigencia, recursos):
    return [recursos[r].nombre for r in exigencia.candidatos if r in recursos]


def mensaje_falta(exigencia, causa, recursos) -> str:
    nombres = _nombres(exigencia, recursos)
    es_sala = exigencia.tipo == SALA
    uno = len(nombres) == 1
    if causa == SIN_COMPATIBLE:
        return (
            "Ninguna sala sirve para todos los procedimientos de esta cita. "
            "Revisa las salas de cada procedimiento."
        )
    if causa == OCUPADO:
        if uno:
            texto = f"{nombres[0]} está {'ocupada' if es_sala else 'ocupado'} a esa hora."
            if exigencia.a_mano:
                texto += f" Elige otra hora o {'quítala' if es_sala else 'quítalo'} de la cita."
            return texto
        if es_sala:
            return "No hay una sala libre a esa hora."
        return f"No hay un equipo libre a esa hora ({', '.join(nombres)})."
    if causa == BLOQUEADO:
        if uno:
            return f"{nombres[0]} está marcado como no disponible a esa hora."
        return f"{'Las salas' if es_sala else 'Los equipos'} que sirven están marcados como no disponibles a esa hora."
    if uno:
        return f"{nombres[0]} no está disponible ese día o a esa hora."
    return f"{'Ninguna de las salas' if es_sala else 'Ninguno de los equipos'} que sirven está disponible ese día o a esa hora."


def detalle_falta(exigencia, causa, recursos) -> dict:
    return {
        "tipo": exigencia.tipo,
        "causa": causa,
        "recursos": _nombres(exigencia, recursos),
        "a_mano": exigencia.a_mano,
    }


def error_de_falta(exigencia, causa, recursos) -> ValidationError:
    # DRF convierte todo a texto en los errores: `recurso_a_mano` solo va cuando
    # es verdadero (un "False" en texto se leería como verdadero en el front).
    detalle = detalle_falta(exigencia, causa, recursos)
    a_mano = detalle.pop("a_mano")
    return ValidationError({
        "error": mensaje_falta(exigencia, causa, recursos),
        "code": CODIGOS[causa],
        **{f"recurso_{k}": v for k, v in detalle.items()},
        **({"recurso_a_mano": True} if a_mano else {}),
    })


# ── Crear y editar citas ────────────────────────────────────────────────────


def _bloquear_filas(ids):
    """Serializa las reservas del mismo recurso (como con el profesional): dos
    recepcionistas ya no pueden tomar el mismo láser a la vez. Orden fijo para
    no cruzar bloqueos."""
    if ids:
        list(Recurso.objects.select_for_update().filter(id__in=ids).order_by("id").values_list("id", flat=True))


def _elegido(recursos, recurso_id, tipo):
    recurso = recursos.get(recurso_id)
    if recurso is None or recurso.tipo != tipo:
        etiqueta = "La sala elegida" if tipo == SALA else "El equipo elegido"
        raise ValidationError({
            "error": f"{etiqueta} no está disponible en esta sede.",
            "code": "RECURSO_INVALIDO",
        })
    return recurso


def resolver_recursos(
    *, sede, procedimientos, fecha_inicio, fecha_fin, excluir_cita_id=None,
    sala=NO_ENVIADO, equipos=NO_ENVIADO, actuales=(),
) -> list:
    """Salas y equipos para la cita: [(recurso_id, elegido_a_mano)]. Levanta
    ValidationError si falta alguno. Se llama dentro de la transacción.

    - `sala` / `equipos`: lo que eligió quien agenda. Si es parte de lo que pide
      el procedimiento, manda esa unidad; si no, queda como elegido a mano.
      `sala=None` o `equipos=[]` quitan lo elegido a mano.
    - `actuales`: lo que ya tenía la cita al editar [(recurso_id, elegido_a_mano)].
      Se conserva si sigue libre; lo pedido por el procedimiento se reasigna.
    """
    recursos = recursos_activos(sede)
    if not recursos:
        if (sala not in (NO_ENVIADO, None)) or (equipos not in (NO_ENVIADO, None) and equipos):
            raise ValidationError({"error": "Esta sede no tiene salas ni equipos.", "code": "RECURSO_INVALIDO"})
        return []

    exigencias, manuales = aplicar_eleccion(
        exigencias_de(procedimientos, recursos), recursos, sala=sala, equipos=equipos,
    )

    # Lo que ya tenía elegido a mano sigue, salvo que ahora se mande otra cosa.
    a_mano_antes = [
        rid for rid, a_mano in actuales
        if a_mano and rid in recursos
        and (sala is NO_ENVIADO if recursos[rid].tipo == SALA else equipos is NO_ENVIADO)
    ]
    extra, preferir = manuales_que_siguen(a_mano_antes, exigencias, recursos)
    manuales += extra

    todas = exigencias + manuales
    if not todas:
        return []

    _bloquear_filas({rid for ex in todas for rid in ex.candidatos})
    ocupacion = Ocupacion(sede, recursos).cargar(fecha_inicio, fecha_fin, excluir_cita_ids=[excluir_cita_id])
    resultado = asignar(
        ocupacion, todas, fecha_inicio, fecha_fin,
        preferidos=preferir + [rid for rid, a_mano in actuales if not a_mano],
    )
    if resultado.faltas:
        exigencia, causa = resultado.faltas[0]
        raise error_de_falta(exigencia, causa, recursos)
    return [(rid, ex.a_mano) for ex, rid in resultado.asignados]


def aplicar_eleccion(exigencias, recursos, *, sala=NO_ENVIADO, equipos=NO_ENVIADO):
    """Lo que eligió quien agenda sobre lo que pide el procedimiento. Una sala o
    un equipo que entra en lo que pide fija esa exigencia ("Cabina 2" en vez de
    "la que esté libre"); uno que no, se reserva aparte (elegido a mano). Una
    sala que no sirve cuando el procedimiento pide sala es un error.
    Devuelve (exigencias, exigencias a mano). Lo usan crear/editar y los
    horarios (que muestran solo cuándo está libre lo elegido)."""
    exigencias = list(exigencias)
    manuales = []
    fijadas = set()

    def fijar(recurso_id, tipo):
        _elegido(recursos, recurso_id, tipo)
        for i, ex in enumerate(exigencias):
            if i not in fijadas and ex.tipo == tipo and recurso_id in ex.candidatos:
                exigencias[i] = Exigencia(tipo, (recurso_id,))
                fijadas.add(i)
                return
        if tipo == SALA and any(ex.tipo == SALA for ex in exigencias):
            raise _no_sirve(recursos[recurso_id])
        manuales.append(Exigencia(tipo, (recurso_id,), True))

    if sala not in (NO_ENVIADO, None):
        fijar(sala, SALA)
    if equipos not in (NO_ENVIADO, None):
        for equipo_id in dict.fromkeys(equipos):
            fijar(equipo_id, EQUIPO)
    return exigencias, manuales


def manuales_que_siguen(ids, exigencias, recursos):
    """Salas y equipos elegidos a mano antes, frente a lo que pide ahora el
    procedimiento: si ya entra en lo que pide, no se suma (sería una segunda
    sala o un equipo de más) y solo se prefiere; una sala que no le sirve se
    suelta. Devuelve (exigencias a mano que siguen, ids preferidos)."""
    extra, preferir = [], []
    for rid in ids:
        tipo = recursos[rid].tipo
        if any(ex.tipo == tipo and rid in ex.candidatos for ex in exigencias):
            preferir.append(rid)
        elif tipo == SALA and any(ex.tipo == SALA for ex in exigencias):
            continue
        else:
            extra.append(Exigencia(tipo, (rid,), True))
    return extra, preferir


def _no_sirve(recurso):
    return ValidationError({
        "error": f"{recurso.nombre} no sirve para este procedimiento.",
        "code": "RECURSO_INVALIDO",
    })


def guardar_asignacion(cita, asignacion):
    """Reemplaza las salas y equipos de la cita."""
    actuales = {(a.recurso_id, a.elegido_a_mano) for a in cita.recursos_asignados.all()}
    if actuales == set(asignacion):
        return
    CitaRecurso.objects.filter(cita=cita).delete()
    CitaRecurso.objects.bulk_create([
        CitaRecurso(cita=cita, recurso_id=rid, elegido_a_mano=a_mano) for rid, a_mano in asignacion
    ])
    if hasattr(cita, "_prefetched_objects_cache"):
        cita._prefetched_objects_cache.pop("recursos_asignados", None)


def asignacion_actual(cita) -> list:
    return [(a.recurso_id, a.elegido_a_mano) for a in cita.recursos_asignados.all()]


# ── Horarios disponibles ────────────────────────────────────────────────────


def filtrar_horarios(sede, slots, duracion_min, exigencias, *, excluir_cita_id=None):
    """Deja los horarios en que hay sala y equipos libres. Devuelve
    (horarios, motivo): `motivo` explica por qué se descartaron (la falta más
    frecuente), o None si no se descartó ninguno."""
    if not slots or not exigencias:
        return list(slots), None
    recursos = recursos_activos(sede)
    duracion = timedelta(minutes=duracion_min)
    ocupacion = Ocupacion(sede, recursos).cargar(
        min(slots), max(slots) + duracion, excluir_cita_ids=[excluir_cita_id],
    )
    libres = []
    faltas = Counter()
    for inicio in slots:
        resultado = asignar(ocupacion, exigencias, inicio, inicio + duracion)
        if resultado.faltas:
            faltas[resultado.faltas[0]] += 1
        else:
            libres.append(inicio)
    if not faltas:
        return libres, None
    (exigencia, causa), _ = faltas.most_common(1)[0]
    return libres, {**detalle_falta(exigencia, causa, recursos), "mensaje": mensaje_falta(exigencia, causa, recursos)}


def faltantes(cita, *, cache=None) -> list:
    """Lo que la cita necesita y no tiene asignado (citas de antes de configurar
    salas y equipos, o que no cupieron al reacomodar). Para la agenda: "Falta
    sala". Sin salas ni equipos en la sede no consulta nada más."""
    if cita.estado not in ESTADOS_REASIGNABLES or cita.es_migracion:
        return []
    cache = cache if cache is not None else {}
    recursos = cache.get(("sede", cita.sede_id))
    if recursos is None:
        recursos = cache[("sede", cita.sede_id)] = recursos_activos(cita.sede_id)
    if not recursos:
        return []
    # Las citas del mismo procedimiento o tipo de sesión necesitan lo mismo: se
    # calcula una vez por listado.
    clave = ("exigencias", cita.sede_id, clave_de_forma(cita))
    if clave not in cache:
        cache[clave] = exigencias_de(procedimientos_de_cita(cita), recursos)
    asignados = [a.recurso_id for a in cita.recursos_asignados.all()]
    faltan = []
    for exigencia in sorted(cache[clave], key=lambda e: len(e.candidatos)):
        tiene = next((r for r in asignados if r in exigencia.candidatos), None)
        if tiene is None:
            faltan.append({"tipo": exigencia.tipo, "recursos": _nombres(exigencia, recursos)})
        else:
            asignados.remove(tiene)
    return faltan


# ── Reacomodar lo agendado al cambiar la configuración ──────────────────────


@transaction.atomic
def reasignar_citas_futuras(sedes) -> dict:
    """Asigna salas y equipos a las citas futuras de esas sedes según la
    configuración actual. No cancela ni mueve citas (D4).

    1. Primero se conserva lo de cada cita que sigue sirviendo y libre: un
       cambio no le quita la sala a una cita que estaba bien.
    2. Después, por orden de agenda (quien agendó primero), las que perdieron
       algo toman lo libre. La que no cabe completa queda sin nada asignado
       ("sin lugar"): una asignación a medias ocuparía una sala que no puede usar.

    Para previsualizar un cambio, llamar dentro de una transacción que después
    se revierte.
    """
    ahora = timezone.now()
    revisadas = 0
    sin_lugar = []
    for sede in sedes:
        recursos = recursos_activos(sede)
        # Antes de leer las citas: nadie agenda ni mueve en esta sede mientras tanto.
        _bloquear_filas(list(recursos))
        citas = list(
            Cita.objects.filter(
                sede=sede, fecha_inicio__gte=ahora, estado__in=ESTADOS_REASIGNABLES, es_migracion=False,
            )
            .select_related("paciente", "servicio", "item_cotizacion", "item_cotizacion__tratamiento")
            .prefetch_related("recursos_asignados", "sesiones_protocolo__tipo_sesion", "sesiones_protocolo__procedimiento")
            .order_by("created_at")
        )
        if not citas:
            continue
        ocupacion = Ocupacion(sede, recursos).cargar(
            min(c.fecha_inicio for c in citas), max(c.fecha_fin for c in citas),
            excluir_cita_ids=[c.id for c in citas],
        )
        cache = {}
        pendientes = []
        for cita in citas:
            revisadas += 1
            clave = clave_de_forma(cita)
            if clave not in cache:
                cache[clave] = exigencias_de(procedimientos_de_cita(cita), recursos)
            actuales = asignacion_actual(cita)
            extra, preferir = manuales_que_siguen(
                [rid for rid, a_mano in actuales if a_mano and rid in recursos], cache[clave], recursos,
            )
            exigencias = cache[clave] + extra
            if not exigencias:
                guardar_asignacion(cita, [])
                continue
            # 1. ¿Le alcanza con lo que ya tiene?
            tiene = {rid for rid, _ in actuales}
            restringidas = [
                Exigencia(ex.tipo, tuple(c for c in ex.candidatos if c in tiene), ex.a_mano) for ex in exigencias
            ]
            resultado = asignar(ocupacion, restringidas, cita.fecha_inicio, cita.fecha_fin)
            if resultado.faltas:
                pendientes.append((cita, exigencias, preferir + [rid for rid, a_mano in actuales if not a_mano]))
                continue
            _guardar_y_reservar(ocupacion, cita, resultado)

        # 2. Las que perdieron algo toman lo que quedó libre.
        for cita, exigencias, preferidos in pendientes:
            resultado = asignar(ocupacion, exigencias, cita.fecha_inicio, cita.fecha_fin, preferidos=preferidos)
            if not resultado.faltas:
                _guardar_y_reservar(ocupacion, cita, resultado)
                continue
            guardar_asignacion(cita, [])
            sin_lugar.append({
                "cita_id": str(cita.id),
                "paciente": cita.paciente.nombre_completo,
                "fecha_inicio": timezone.localtime(cita.fecha_inicio).isoformat(),
                "servicio": cita.servicio_nombre,
                "faltan": [
                    {**detalle_falta(ex, causa, recursos), "mensaje": mensaje_falta(ex, causa, recursos)}
                    for ex, causa in resultado.faltas
                ],
            })
    return {"citas_revisadas": revisadas, "total_sin_lugar": len(sin_lugar), "sin_lugar": sin_lugar}


def _guardar_y_reservar(ocupacion, cita, resultado):
    nueva = [(rid, ex.a_mano) for ex, rid in resultado.asignados]
    for rid, _ in nueva:
        ocupacion.reservar(rid, cita.fecha_inicio, cita.fecha_fin, cita.id)
    guardar_asignacion(cita, nueva)
