"""Seguimiento de la activación real de cada clínica en prueba.

- Hitos: la primera vez que llega a cada paso (sede con horario, primer
  procedimiento, primera atención...). Se calculan desde los datos y se guardan
  en HitoClinica para medir el embudo; un hito ya guardado no se recalcula.
- Actividad: días en que alguien de la clínica usó la app (ActividadDiaria).
- Activación real (propuesta del plan, §6): al menos 3 atenciones completadas y
  uso en al menos 3 días distintos.
"""

from datetime import timedelta

from django.core.cache import cache
from django.db import IntegrityError
from django.db.models import F, Min
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import ActividadDiaria, HitoClinica, Suscripcion

ATENCIONES_PARA_ACTIVAR = 3
DIAS_ACTIVOS_PARA_ACTIVAR = 3
# Sin uso en estos días, la prueba está en riesgo; con más, dormida.
DIAS_SIN_USO_RIESGO = 2
DIAS_SIN_USO_DORMIDA = 7

_VENTANA_ACTIVIDAD = 15 * 60


# --- Hitos ---------------------------------------------------------------------


def _primer_ingreso(clinica):
    from apps.core.models import LogAccion

    return LogAccion.objects.filter(clinica=clinica, accion="auth.login").aggregate(m=Min("created_at"))["m"]


def _sede_con_horario(clinica):
    from apps.clinicas.models import Sede
    from apps.clinicas.preparacion import sede_tiene_horario

    # Cuándo se le puso horario no queda guardado: la última edición lo aproxima.
    fechas = [s.updated_at for s in Sede.objects.filter(clinica=clinica, activo=True) if sede_tiene_horario(s)]
    return min(fechas) if fechas else None


def _primer_profesional(clinica):
    from apps.clinicas.preparacion import profesionales_activos

    return profesionales_activos(clinica).aggregate(m=Min("created_at"))["m"]


def _primer_procedimiento(clinica):
    from apps.clinicas.models import Servicio

    return Servicio.objects.filter(clinica=clinica, activo=True).aggregate(m=Min("created_at"))["m"]


def _primer_paciente(clinica):
    from apps.pacientes.models import Paciente

    return Paciente.objects.filter(clinica=clinica).aggregate(m=Min("created_at"))["m"]


def _primera_cita(clinica):
    from apps.agenda.models import Cita

    return Cita.objects.filter(sede__clinica=clinica).aggregate(m=Min("created_at"))["m"]


def _atenciones(clinica):
    """Fechas de las atenciones completadas, de la primera a la última."""
    from apps.agenda.models import Cita

    return (
        Cita.objects.filter(sede__clinica=clinica, estado=Cita.Estado.COMPLETADA)
        .annotate(cuando=Coalesce("fecha_fin_real", "updated_at"))
        .order_by("cuando")
        .values_list("cuando", flat=True)
    )


def _atencion_numero(n):
    def calcular(clinica):
        fechas = list(_atenciones(clinica)[n - 1:n])
        return fechas[0] if fechas else None

    return calcular


def _primer_pago(clinica):
    from apps.cobros.models import PagoRecibido

    return PagoRecibido.objects.filter(cobro__sede__clinica=clinica).aggregate(m=Min("created_at"))["m"]


def _segundo_usuario(clinica):
    """Cuándo entró por primera vez la segunda persona del equipo."""
    from apps.core.models import LogAccion

    primeras = (
        LogAccion.objects.filter(clinica=clinica, accion="auth.login", usuario__isnull=False)
        .values("usuario")
        .annotate(primera=Min("created_at"))
        .order_by("primera")
        .values_list("primera", flat=True)
    )
    fechas = list(primeras[1:2])
    return fechas[0] if fechas else None


# Orden del recorrido esperado: así se leen en la consola y en el embudo.
HITOS = [
    ("ingreso", "Entró a la app", _primer_ingreso),
    ("sede", "Sede con horario", _sede_con_horario),
    ("profesional", "Profesional que atiende", _primer_profesional),
    ("procedimiento", "Primer procedimiento", _primer_procedimiento),
    ("paciente", "Primer paciente", _primer_paciente),
    ("cita", "Primera cita", _primera_cita),
    ("atencion", "Primera atención", _atencion_numero(1)),
    ("pago", "Primer pago", _primer_pago),
    ("equipo", "Segundo usuario", _segundo_usuario),
    ("cinco_atenciones", "5 atenciones", _atencion_numero(5)),
]
ETIQUETA_HITO = {clave: etiqueta for clave, etiqueta, _ in HITOS}
PREPARACION = ("sede", "profesional", "procedimiento")


def actualizar_hitos(clinica) -> dict:
    """Guarda los hitos nuevos y devuelve {hito: fecha} de todos los alcanzados."""
    ya = dict(HitoClinica.objects.filter(clinica=clinica).values_list("hito", "alcanzado_el"))
    ahora = timezone.now()
    for clave, _, calcular in HITOS:
        if clave in ya:
            continue
        fecha = calcular(clinica)
        if fecha is None:
            continue
        # Nunca antes de que exista la clínica (datos migrados) ni en el futuro.
        fecha = min(max(fecha, clinica.created_at), ahora)
        HitoClinica.objects.get_or_create(clinica=clinica, hito=clave, defaults={"alcanzado_el": fecha})
        ya[clave] = fecha
    return ya


# --- Actividad -------------------------------------------------------------------


def registrar_actividad(user, token) -> None:
    """Marca que el usuario usó la app hoy (como mucho una escritura cada 15 min)."""
    if token.get("suplantado_por") or not getattr(user, "clinica_id", None):
        return
    hoy = timezone.localdate()
    if not cache.add(f"actividad:{user.pk}:{hoy}", 1, _VENTANA_ACTIVIDAD):
        return
    ahora = timezone.now()
    cambiadas = ActividadDiaria.objects.filter(clinica_id=user.clinica_id, usuario=user, fecha=hoy).update(
        bloques=F("bloques") + 1, ultima_at=ahora
    )
    if not cambiadas:
        try:
            ActividadDiaria.objects.create(clinica_id=user.clinica_id, usuario=user, fecha=hoy, ultima_at=ahora)
        except IntegrityError:
            pass  # otra petición del mismo usuario la creó a la par


def resumen_actividad(clinica) -> dict:
    hoy = timezone.localdate()
    filas = ActividadDiaria.objects.filter(clinica=clinica)
    ultima = filas.order_by("-ultima_at").values_list("ultima_at", flat=True).first()
    return {
        "dias_activos": filas.values("fecha").distinct().count(),
        "usuarios_activos_7d": filas.filter(fecha__gt=hoy - timedelta(days=7)).values("usuario").distinct().count(),
        "ultima_actividad": ultima,
    }


# --- Semáforo ----------------------------------------------------------------------


def atenciones_completadas(clinica) -> int:
    return _atenciones(clinica).count()


def evaluar(clinica, suscripcion: Suscripcion, hitos: dict, actividad: dict, atenciones: int) -> dict:
    """Activada / en camino / en riesgo / dormida, con el motivo en palabras."""
    from .services import dias_restantes_prueba

    ahora = timezone.now()
    activada = atenciones >= ATENCIONES_PARA_ACTIVAR and actividad["dias_activos"] >= DIAS_ACTIVOS_PARA_ACTIVAR
    if activada:
        return {"activada": True, "semaforo": "activada", "motivo": "Ya atiende pacientes en CliniQ."}

    ultima = actividad["ultima_actividad"]
    dias_sin_uso = (ahora - ultima).days if ultima else (ahora - clinica.created_at).days
    if dias_sin_uso >= DIAS_SIN_USO_DORMIDA:
        motivo = "Nunca la ha usado." if ultima is None else f"No la usa hace {dias_sin_uso} días."
        return {"activada": False, "semaforo": "dormida", "motivo": motivo}

    motivos = []
    if suscripcion.estado != Suscripcion.Estado.PRUEBA and suscripcion.periodo_inicio is None:
        motivos.append("La prueba terminó sin activarse.")
    if dias_sin_uso >= DIAS_SIN_USO_RIESGO:
        motivos.append("Nunca la ha usado." if ultima is None else f"No la usa hace {dias_sin_uso} días.")
    if (ahora - clinica.created_at).days >= 3 and not all(h in hitos for h in PREPARACION):
        faltan = [ETIQUETA_HITO[h].lower() for h in PREPARACION if h not in hitos]
        motivos.append("Le falta: " + ", ".join(faltan) + ".")
    restantes = dias_restantes_prueba(suscripcion)
    if restantes is not None and restantes <= 3:
        motivos.append("La prueba termina pronto sin haber atendido pacientes.")
    if motivos:
        return {"activada": False, "semaforo": "en_riesgo", "motivo": " ".join(motivos)}
    return {"activada": False, "semaforo": "en_camino", "motivo": "Va configurando y usando la app."}
