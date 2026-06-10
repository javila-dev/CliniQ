from django.core.management.base import BaseCommand
from django.db import transaction

from apps.cotizaciones.models import Cotizacion


class Command(BaseCommand):
    help = "Asigna la sede principal a cotizaciones que no tienen sede."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Muestra qué se actualizaría sin persistir cambios.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("--dry-run activo, no se persistirán cambios."))

        cotizaciones = (
            Cotizacion.objects.filter(sede__isnull=True, activo=True)
            .select_related("clinica")
        )
        total = cotizaciones.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay cotizaciones sin sede. Nada que hacer."))
            return

        self.stdout.write(f"Cotizaciones sin sede: {total}")

        actualizadas = 0
        sin_sede_clinica = 0
        errores = 0

        sede_cache = {}

        for cotizacion in cotizaciones:
            clinica_id = cotizacion.clinica_id
            if clinica_id not in sede_cache:
                sede_cache[clinica_id] = (
                    cotizacion.clinica.sedes.filter(activo=True).order_by("created_at").first()
                )
            sede = sede_cache[clinica_id]

            if not sede:
                self.stdout.write(self.style.WARNING(
                    f"  Clínica {cotizacion.clinica} no tiene sedes activas — cotizacion {cotizacion.id} omitida."
                ))
                sin_sede_clinica += 1
                continue

            try:
                if dry_run:
                    self.stdout.write(f"  [dry-run] Cotizacion {cotizacion.id} → sede '{sede.nombre}'")
                    actualizadas += 1
                    continue

                with transaction.atomic():
                    cotizacion.sede = sede
                    cotizacion.save(update_fields=["sede", "updated_at"])
                self.stdout.write(f"  Cotizacion {cotizacion.id} → sede '{sede.nombre}'")
                actualizadas += 1

            except Exception as exc:
                errores += 1
                self.stderr.write(self.style.ERROR(f"  Error en cotizacion {cotizacion.id}: {exc}"))

        self.stdout.write(self.style.SUCCESS(
            f"\nListo. Actualizadas: {actualizadas}, sin sede en clínica: {sin_sede_clinica}, errores: {errores}."
        ))
