from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import ConfiguracionGlobal
from apps.suscripciones.activacion import actualizar_hitos
from apps.suscripciones.cobros import procesar_cobros
from apps.suscripciones.ciclo_vida import procesar_avisos
from apps.suscripciones.facturacion import procesar_facturas
from apps.suscripciones.models import Suscripcion
from apps.suscripciones.services import actualizar_estado


class Command(BaseCommand):
    help = (
        "Tarea periódica de suscripciones: guarda los cambios de estado por tiempo, "
        "cobra las renovaciones y reintentos con tarjeta, guarda los hitos de "
        "activación nuevos y envía los correos del ciclo de vida que toquen. Idempotente; se programa cada hora en Dokploy."
    )

    def add_arguments(self, parser):
        parser.add_argument("--simular", action="store_true", help="Muestra qué correos saldrían, sin enviarlos.")

    def handle(self, *args, simular=False, **options):
        self._procesar(simular)
        if not simular:
            # Con update() para no tocar updated_at: lo que la consola muestra como último cambio de ajustes.
            ConfiguracionGlobal.get_solo()
            ConfiguracionGlobal.objects.filter(pk=1).update(suscripciones_procesadas_el=timezone.now())

    def _procesar(self, simular):
        cambios = 0
        for suscripcion in Suscripcion.objects.select_related("clinica"):
            anterior = suscripcion.estado
            if actualizar_estado(suscripcion).estado != anterior:
                cambios += 1
                self.stdout.write(f"{suscripcion.clinica.nombre}: {anterior} -> {suscripcion.estado}")
            actualizar_hitos(suscripcion.clinica)
        self.stdout.write(self.style.SUCCESS(f"{cambios} suscripciones cambiaron de estado."))

        if not simular:
            for linea in procesar_cobros() + procesar_facturas():
                self.stdout.write(linea)

        habilitados = ConfiguracionGlobal.objects.filter(pk=1, correos_ciclo_vida_habilitados=True).exists()
        if not (habilitados or simular):
            self.stdout.write("Correos del ciclo de vida apagados (ConfiguracionGlobal).")
            return
        for clinica, clave, para in procesar_avisos(simular=simular):
            self.stdout.write(f"{'[simulado] ' if simular else ''}{clinica}: {clave} -> {', '.join(para) or 'sin destinatarios'}")
