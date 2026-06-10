from django.core.management.base import BaseCommand
from django.db import transaction

from apps.cartera.models import Cartera, CuotaCartera
from apps.cotizaciones.models import Cotizacion


class Command(BaseCommand):
    help = "Crea objetos Cartera para cotizaciones aceptadas que no los tienen, y backfill de fechas en cuotas existentes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Muestra qué se crearía sin persistir cambios.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("--dry-run activo, no se persistirán cambios."))

        self._crear_carteras_faltantes(dry_run)
        self._backfill_fechas_cuotas(dry_run)

    def _crear_carteras_faltantes(self, dry_run):
        cotizaciones = (
            Cotizacion.objects.filter(estado=Cotizacion.Estado.ACEPTADA, activo=True)
            .exclude(cartera__isnull=False)
            .prefetch_related("items", "formas_pago")
            .select_related("paciente")
        )

        total = cotizaciones.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay cotizaciones aceptadas sin cartera. Nada que hacer."))
            return

        self.stdout.write(f"\nCotizaciones aceptadas sin cartera: {total}")

        creadas = 0
        errores = 0

        for cotizacion in cotizaciones:
            try:
                if dry_run:
                    self.stdout.write(f"  [dry-run] Crearía Cartera para cotizacion {cotizacion.id} (paciente: {cotizacion.paciente})")
                    creadas += 1
                    continue

                with transaction.atomic():
                    cartera, created = Cartera.objects.get_or_create(
                        cotizacion=cotizacion,
                        defaults={
                            "paciente": cotizacion.paciente,
                            "total": cotizacion.total,
                        },
                    )
                    if not created:
                        cartera.total = cotizacion.total
                        cartera.save(update_fields=["total", "updated_at"])

                    if not cartera.cuotas.exists():
                        for forma_pago in cotizacion.formas_pago.filter(activo=True):
                            CuotaCartera.objects.create(
                                cartera=cartera,
                                tipo=forma_pago.tipo,
                                descripcion=forma_pago.descripcion,
                                valor_esperado=forma_pago.valor,
                                fecha_esperada=forma_pago.fecha,
                            )

                    creadas += 1
                    self.stdout.write(f"  {'Actualizada' if not created else 'Creada'} Cartera {cartera.id} para cotizacion {cotizacion.id}")

            except Exception as exc:
                errores += 1
                self.stderr.write(self.style.ERROR(f"  Error en cotizacion {cotizacion.id}: {exc}"))

        self.stdout.write(self.style.SUCCESS(f"Carteras — procesadas: {creadas}, errores: {errores}."))

    def _backfill_fechas_cuotas(self, dry_run):
        # Cuotas sin pagar, sin fecha, cuya cartera tiene formas de pago con fecha
        cuotas_sin_fecha = (
            CuotaCartera.objects.filter(pagada=False, fecha_esperada__isnull=True)
            .select_related("cartera__cotizacion")
            .prefetch_related("cartera__cotizacion__formas_pago")
        )

        total = cuotas_sin_fecha.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay cuotas sin fecha_esperada. Nada que hacer."))
            return

        self.stdout.write(f"\nCuotas sin fecha_esperada: {total}")

        actualizadas = 0
        errores = 0

        for cuota in cuotas_sin_fecha:
            try:
                formas_pago = list(
                    cuota.cartera.cotizacion.formas_pago.filter(
                        activo=True,
                        tipo=cuota.tipo,
                        valor=cuota.valor_esperado,
                        fecha__isnull=False,
                    )
                )
                if not formas_pago:
                    continue

                fecha = formas_pago[0].fecha

                if dry_run:
                    self.stdout.write(f"  [dry-run] Cuota {cuota.id} -> fecha_esperada={fecha}")
                    actualizadas += 1
                    continue

                cuota.fecha_esperada = fecha
                cuota.save(update_fields=["fecha_esperada", "updated_at"])
                self.stdout.write(f"  Cuota {cuota.id} -> fecha_esperada={fecha}")
                actualizadas += 1

            except Exception as exc:
                errores += 1
                self.stderr.write(self.style.ERROR(f"  Error en cuota {cuota.id}: {exc}"))

        self.stdout.write(self.style.SUCCESS(f"Cuotas — actualizadas: {actualizadas}, errores: {errores}."))
