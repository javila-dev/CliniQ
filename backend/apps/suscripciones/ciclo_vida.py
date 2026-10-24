"""Correos automáticos del ciclo de vida de la prueba (ver §6 del plan).

Cada aviso tiene una condición y sale una sola vez por clínica (MensajeCicloVida;
la `referencia` permite repetirlo si cambia la fecha, p. ej. al extender la
prueba). Para no saturar: como mucho un correo por clínica y por corrida, y
ninguno si ya salió otro en las últimas 20 horas.

Se encienden con ConfiguracionGlobal.correos_ciclo_vida_habilitados. El WhatsApp
desde el número de CliniQ (D7) se suma cuando ese número exista.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable

from django.conf import settings
from django.utils import timezone

from .activacion import ETIQUETA_HITO, PREPARACION, actualizar_hitos, atenciones_completadas
from .models import MensajeCicloVida, Suscripcion
from .services import DIAS_SOLO_LECTURA, actualizar_estado, dias_restantes_prueba

logger = logging.getLogger(__name__)
E = Suscripcion.Estado

FECHA = "%d/%m/%Y"
HORAS_ENTRE_CORREOS = 20


@dataclass
class Contexto:
    clinica: object
    s: Suscripcion
    hitos: dict
    ahora: object

    @property
    def dias_desde_registro(self) -> float:
        return (self.ahora - self.clinica.created_at).total_seconds() / 86400

    @property
    def dias_en_estado(self) -> float:
        return (self.ahora - self.s.estado_desde).total_seconds() / 86400

    @property
    def dias_restantes(self):
        return dias_restantes_prueba(self.s, self.ahora)

    @property
    def fin_prueba(self) -> str:
        return timezone.localtime(self.s.prueba_termina_el).strftime(FECHA) if self.s.prueba_termina_el else ""

    @property
    def suspension(self) -> str:
        return timezone.localtime(self.s.estado_desde + timedelta(days=DIAS_SOLO_LECTURA)).strftime(FECHA)

    def resumen_uso(self) -> str:
        from apps.agenda.models import Cita
        from apps.pacientes.models import Paciente

        pacientes = Paciente.objects.filter(clinica=self.clinica).count()
        citas = Cita.objects.filter(sede__clinica=self.clinica).count()
        atenciones = atenciones_completadas(self.clinica)
        return f"Hasta hoy registraste {pacientes} pacientes, {citas} citas y {atenciones} atenciones."


@dataclass
class Aviso:
    clave: str
    aplica: Callable[[Contexto], bool]
    asunto: Callable[[Contexto], str]
    intro: Callable[[Contexto], str]
    boton: str
    ruta: str
    # Lo que permite repetir el aviso: la fecha de fin de la prueba, el día en que entró al estado...
    referencia: Callable[[Contexto], str] = lambda c: ""


def _en_prueba(c: Contexto) -> bool:
    return c.s.estado == E.PRUEBA


def _faltan_preparacion(c: Contexto) -> list[str]:
    return [ETIQUETA_HITO[h].lower() for h in PREPARACION if h not in c.hitos]


def _cuando_termina(c: Contexto) -> str:
    return "hoy" if c.dias_restantes == 0 else "mañana"


AVISOS = [
    Aviso(
        clave="bienvenida",
        aplica=lambda c: _en_prueba(c) and c.dias_desde_registro < 3,
        asunto=lambda c: "Tu prueba gratuita de CliniQ ya empezó",
        intro=lambda c: (
            f"Tienes hasta el {c.fin_prueba} para probar CliniQ con tu equipo y tus pacientes reales. "
            "Para empezar, entra a Preparar mi clínica: en unos minutos dejas lista tu sede, tu equipo "
            "y tus procedimientos para agendar la primera cita."
        ),
        boton="Preparar mi clínica",
        ruta="/preparar-clinica",
    ),
    Aviso(
        clave="sin_configurar",
        aplica=lambda c: _en_prueba(c) and 1 <= c.dias_desde_registro < 5 and bool(_faltan_preparacion(c)),
        asunto=lambda c: "Te faltan pocos pasos para agendar tu primera cita",
        intro=lambda c: (
            "Para agendar en CliniQ te falta: " + ", ".join(_faltan_preparacion(c)) + ". "
            "Son unos minutos y quedas con todo listo para recibir pacientes."
        ),
        boton="Terminar la configuración",
        ruta="/preparar-clinica",
    ),
    Aviso(
        clave="sin_primera_cita",
        aplica=lambda c: (
            _en_prueba(c) and 3 <= c.dias_desde_registro < 10
            and "procedimiento" in c.hitos and "cita" not in c.hitos
        ),
        asunto=lambda c: "¿Agendamos tu primera cita?",
        intro=lambda c: (
            "Ya tienes tus procedimientos. El siguiente paso es agendar una cita con un paciente real y "
            "atenderla en CliniQ: así ves todo el recorrido, desde la llegada hasta el cobro."
        ),
        boton="Ir a la agenda",
        ruta="/agenda",
    ),
    Aviso(
        clave="prueba_vence_3d",
        aplica=lambda c: _en_prueba(c) and c.dias_restantes in (2, 3),
        asunto=lambda c: f"Tu prueba de CliniQ termina en {c.dias_restantes} días",
        intro=lambda c: (
            f"Tu prueba termina el {c.fin_prueba}. {c.resumen_uso()} Elige un plan para seguir trabajando "
            "sin interrupciones: después de esa fecha tu cuenta queda en solo lectura."
        ),
        boton="Ver mi plan",
        ruta="/configuracion/plan",
        referencia=lambda c: c.fin_prueba,
    ),
    Aviso(
        clave="prueba_vence_1d",
        aplica=lambda c: _en_prueba(c) and c.dias_restantes is not None and c.dias_restantes <= 1,
        asunto=lambda c: f"Tu prueba de CliniQ termina {_cuando_termina(c)}",
        intro=lambda c: (
            f"Tu prueba termina {_cuando_termina(c)}, el {c.fin_prueba}. {c.resumen_uso()} Elige un plan "
            "para no perder el ritmo: tu información se conserva tal como está."
        ),
        boton="Ver mi plan",
        ruta="/configuracion/plan",
        referencia=lambda c: c.fin_prueba,
    ),
    Aviso(
        clave="prueba_vencida",
        aplica=lambda c: c.s.estado == E.SOLO_LECTURA and c.s.periodo_inicio is None and c.dias_en_estado < 3,
        asunto=lambda c: "Tu prueba terminó: tu información está a salvo",
        intro=lambda c: (
            "Tu cuenta quedó en solo lectura: puedes consultar todo, pero no crear ni modificar nada. "
            f"Tienes hasta el {c.suspension} para elegir un plan y seguir donde lo dejaste."
        ),
        boton="Elegir plan",
        ruta="/configuracion/plan",
        referencia=lambda c: timezone.localdate(c.s.estado_desde).isoformat(),
    ),
    Aviso(
        clave="solo_lectura_7d",
        aplica=lambda c: c.s.estado in (E.SOLO_LECTURA, E.CANCELADA) and 7 <= c.dias_en_estado < 14,
        asunto=lambda c: "Tu cuenta de CliniQ sigue en solo lectura",
        intro=lambda c: (
            "Tu información sigue guardada y puedes consultarla, pero no puedes agendar ni atender. "
            f"Elige un plan antes del {c.suspension} para que la cuenta no se suspenda."
        ),
        boton="Elegir plan",
        ruta="/configuracion/plan",
        referencia=lambda c: timezone.localdate(c.s.estado_desde).isoformat(),
    ),
    Aviso(
        clave="suspension_en_5d",
        aplica=lambda c: c.s.estado in (E.SOLO_LECTURA, E.CANCELADA) and DIAS_SOLO_LECTURA - 5 <= c.dias_en_estado < DIAS_SOLO_LECTURA,
        asunto=lambda c: "En pocos días se suspende tu cuenta de CliniQ",
        intro=lambda c: (
            f"El {c.suspension} tu cuenta se suspende y solo quien la administra podrá entrar para reactivarla. "
            "No se borra nada: al elegir un plan vuelves con todo tal como lo dejaste."
        ),
        boton="Elegir plan",
        ruta="/configuracion/plan",
        referencia=lambda c: timezone.localdate(c.s.estado_desde).isoformat(),
    ),
]


def destinatarios(clinica) -> list[str]:
    """Administradores activos de la clínica (los que pueden elegir el plan)."""
    from apps.users.models import User
    from apps.users.services import ES_ADMIN_Q

    return list(
        User.objects.filter(clinica=clinica, activo=True, is_active=True)
        .filter(ES_ADMIN_Q)
        .exclude(email="")
        .values_list("email", flat=True)
        .distinct()
    )


def aviso_pendiente(suscripcion: Suscripcion, ahora=None) -> Aviso | None:
    """El primer aviso que le toca a la clínica y aún no se envió, o None."""
    ahora = ahora or timezone.now()
    clinica = suscripcion.clinica
    enviados = MensajeCicloVida.objects.filter(clinica=clinica, canal=MensajeCicloVida.Canal.CORREO)
    if enviados.filter(enviado_at__gt=ahora - timedelta(hours=HORAS_ENTRE_CORREOS)).exists():
        return None
    c = Contexto(clinica=clinica, s=suscripcion, hitos=actualizar_hitos(clinica), ahora=ahora)
    ya = set(enviados.values_list("clave", "referencia"))
    for aviso in AVISOS:
        if aviso.aplica(c) and (aviso.clave, aviso.referencia(c)) not in ya:
            return aviso
    return None


def enviar_aviso(suscripcion: Suscripcion, aviso: Aviso, ahora=None) -> MensajeCicloVida | None:
    from apps.notificaciones.services import enviar_email
    from apps.users.services import build_auth_email_html

    ahora = ahora or timezone.now()
    clinica = suscripcion.clinica
    para = destinatarios(clinica)
    if not para:
        return None
    c = Contexto(clinica=clinica, s=suscripcion, hitos=actualizar_hitos(clinica), ahora=ahora)
    asunto, intro = aviso.asunto(c), aviso.intro(c)
    url = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}{aviso.ruta}"
    html = build_auth_email_html(
        badge=clinica.nombre,
        title=asunto,
        preview=asunto,
        greeting_name="equipo de " + clinica.nombre,
        intro=intro,
        button_label=aviso.boton,
        url=url,
        expiration_hours=None,
        footer_note="Recibes este correo porque administras la cuenta de tu clínica en CliniQ.",
    )
    enviar_email(to=para, subject=asunto, body=f"Hola,\n\n{intro}\n\n{aviso.boton}: {url}", html_body=html)
    return MensajeCicloVida.objects.create(
        clinica=clinica, clave=aviso.clave, referencia=aviso.referencia(c), destinatarios=para, enviado_at=ahora,
    )


def procesar_avisos(*, simular: bool = False) -> list[tuple[str, str, list[str]]]:
    """Revisa todas las suscripciones y envía lo que toque. Devuelve (clínica, aviso, destinatarios)."""
    resultado = []
    for suscripcion in Suscripcion.objects.select_related("clinica").filter(clinica__activo=True):
        aviso = aviso_pendiente(actualizar_estado(suscripcion))
        if aviso is None:
            continue
        if simular:
            resultado.append((suscripcion.clinica.nombre, aviso.clave, destinatarios(suscripcion.clinica)))
            continue
        try:
            enviado = enviar_aviso(suscripcion, aviso)
        except Exception:
            # El correo falló: no se marca como enviado y se reintenta en la próxima corrida.
            logger.exception("No se pudo enviar el aviso %s a %s", aviso.clave, suscripcion.clinica_id)
            continue
        if enviado is not None:
            resultado.append((suscripcion.clinica.nombre, aviso.clave, enviado.destinatarios))
    return resultado
