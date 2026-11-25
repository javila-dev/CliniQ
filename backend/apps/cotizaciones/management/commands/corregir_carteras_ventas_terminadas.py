"""Ventas terminadas cuya cartera sigue con saldo que no tiene cuota.

Antes de la corrección, terminar una venta calculaba el saldo solo con las
cuotas pendientes. Si la cartera estaba descuadrada (total mayor que lo que
suman sus cuotas: ventas aceptadas antes de exigir el plan de pagos, carteras
creadas por ``backfill_carteras``), la terminación no veía ese saldo: no pedía
perdonarlo ni cobrarlo y la cartera quedó activa para siempre.

Solo quedaron mal las terminadas sin nada perdonado (``valor_perdonado = 0``):
cuando se perdonó o se cobró un valor parcial, el total de la cartera ya se
recalculó con sus cuotas y el descuadre desapareció.

Por defecto solo lista. Con ``--aplicar`` perdona la parte sin cuota (la deja
en ``valor_perdonado`` y ``saldo_al_terminar``, recalcula el total de la cartera
con sus cuotas vigentes y deja registro en el log de acciones). Las cuotas
vigentes no se tocan: lo que el plan sí cubre se sigue cobrando. La venta deja
de poder reanudarse, igual que cualquier venta con saldo perdonado.

La alternativa sin script: reanudar la venta desde su pantalla y terminarla de
nuevo, que ahora sí pide decidir sobre todo el saldo.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum

from apps.cartera.models import Cartera
from apps.core.logging import registrar_accion
from apps.cotizaciones.models import Cotizacion
from apps.cotizaciones.terminacion import _cuotas_pendientes, _saldo

CERO = Decimal("0.00")


class Command(BaseCommand):
    help = "Lista (o con --aplicar, perdona) el saldo sin cuota de las ventas terminadas que quedó en cartera."

    def add_arguments(self, parser):
        parser.add_argument("--aplicar", action="store_true", help="Perdona el saldo sin cuota. Sin esto solo lista.")
        parser.add_argument("--clinica", help="Limita a una clínica (id).")

    def _afectadas(self, clinica_id=None):
        ventas = Cotizacion.objects.filter(
            estado=Cotizacion.Estado.ACEPTADA, terminada_en__isnull=False, valor_perdonado__lte=0,
        ).select_related("clinica", "paciente")
        if clinica_id:
            ventas = ventas.filter(clinica_id=clinica_id)
        for venta in ventas.order_by("clinica__nombre", "terminada_en"):
            cartera = Cartera.objects.filter(cotizacion=venta).first()
            if cartera is None:
                continue
            saldo_cartera = Decimal(cartera.saldo_pendiente)
            saldo_cuotas = _saldo(_cuotas_pendientes(cartera))
            sin_cuota = saldo_cartera - saldo_cuotas
            if sin_cuota > 0:
                yield venta, cartera, saldo_cartera, saldo_cuotas, sin_cuota

    def handle(self, *args, **options):
        aplicar = options["aplicar"]
        filas = list(self._afectadas(options.get("clinica")))
        if not filas:
            self.stdout.write(self.style.SUCCESS("No hay ventas terminadas con saldo sin cuota en cartera."))
            return

        self.stdout.write(f"Ventas terminadas con saldo sin cuota: {len(filas)}")
        total_sin_cuota = CERO
        for venta, cartera, saldo_cartera, saldo_cuotas, sin_cuota in filas:
            total_sin_cuota += sin_cuota
            self.stdout.write(
                f"  {venta.clinica.nombre} | venta {venta.id} | {venta.paciente.nombre_completo} | "
                f"terminada {venta.terminada_en:%Y-%m-%d} | saldo cartera {saldo_cartera:,.0f} | "
                f"cubierto por cuotas {saldo_cuotas:,.0f} | sin cuota {sin_cuota:,.0f}"
            )
        self.stdout.write(f"Total sin cuota: {total_sin_cuota:,.0f}")

        if not aplicar:
            self.stdout.write(self.style.WARNING("Solo lista. Usa --aplicar para perdonar el saldo sin cuota."))
            return

        for venta, cartera, _saldo_cartera, saldo_cuotas, sin_cuota in filas:
            with transaction.atomic():
                cartera = Cartera.objects.select_for_update().get(pk=cartera.pk)
                venta = Cotizacion.objects.select_for_update().get(pk=venta.pk)
                total_anterior = cartera.total
                cartera.total = cartera.cuotas.filter(anulada=False).aggregate(t=Sum("valor_esperado"))["t"] or CERO
                cartera.save(update_fields=["total", "updated_at"])
                saldo_al_terminar_anterior = venta.saldo_al_terminar
                venta.valor_perdonado = Decimal(venta.valor_perdonado or 0) + sin_cuota
                venta.saldo_al_terminar = Decimal(venta.saldo_al_terminar or 0) + sin_cuota
                venta.save(update_fields=["valor_perdonado", "saldo_al_terminar", "updated_at"])
                registrar_accion(
                    None, "venta.corregir_saldo_sin_cuota", venta,
                    {
                        "cartera": str(cartera.id),
                        "total_anterior": f"{total_anterior:.2f}",
                        "total_nuevo": f"{cartera.total:.2f}",
                        "perdonado_sin_cuota": f"{sin_cuota:.2f}",
                        "saldo_al_terminar_anterior": f"{saldo_al_terminar_anterior or CERO:.2f}",
                        "saldo_cubierto_por_cuotas": f"{saldo_cuotas:.2f}",
                    },
                    clinica=venta.clinica,
                )
        self.stdout.write(self.style.SUCCESS(f"Corregidas {len(filas)} ventas."))
