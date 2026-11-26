"""Ventas terminadas cuya cartera quedó abierta por cómo funcionaba la terminación.

Antes del 2026-11-25 una venta terminada podía quedar con la cartera abierta de
dos formas:

1. **Plan de cuotas de antes de terminar.** Al terminar se eligió "Cobrar un
   valor" por el saldo completo y el plan no se tocaba: las cuotas originales
   siguieron vivas, con su mora y el bloqueo de recepción. Se reconocen porque
   la cartera tiene cuotas pendientes creadas antes de ``terminada_en``. El
   comando solo las lista: la clínica decide si se cobran. Si no se van a
   cobrar, soporte las cierra en Console › Soporte › «Cerrar cartera de una
   venta terminada». Si sí, se reanuda la venta y se termina de nuevo: ahora
   queda una sola cuota con la fecha que se elija.

2. **Saldo sin cuota.** La terminación sumaba solo las cuotas pendientes. Si la
   cartera estaba descuadrada (total mayor que lo que suman sus cuotas: ventas
   aceptadas antes de exigir el plan de pagos, carteras de ``backfill_carteras``),
   no veía ese saldo y la cartera quedó activa para siempre. Con ``--aplicar`` se
   perdona esa parte sin cuota (queda en ``valor_perdonado`` y
   ``saldo_al_terminar``, se recalcula el total con las cuotas vigentes y queda
   en el log de acciones). Las cuotas vigentes no se tocan.

Por defecto solo lista y no cambia nada.
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
    help = (
        "Lista las ventas terminadas con la cartera abierta (plan de cuotas viejo o saldo sin cuota). "
        "Con --aplicar perdona el saldo sin cuota."
    )

    def add_arguments(self, parser):
        parser.add_argument("--aplicar", action="store_true", help="Perdona el saldo sin cuota. Sin esto solo lista.")
        parser.add_argument("--clinica", help="Limita a una clínica (id).")

    def _revisar(self, clinica_id=None):
        """Por cada venta terminada con algo abierto: (venta, cartera, saldo de
        la cartera, cuotas del plan viejo, saldo sin cuota)."""
        ventas = Cotizacion.objects.filter(
            estado=Cotizacion.Estado.ACEPTADA, terminada_en__isnull=False,
        ).select_related("clinica", "paciente")
        if clinica_id:
            ventas = ventas.filter(clinica_id=clinica_id)
        for venta in ventas.order_by("clinica__nombre", "terminada_en"):
            cartera = Cartera.objects.filter(cotizacion=venta).first()
            if cartera is None:
                continue
            cuotas = _cuotas_pendientes(cartera)
            saldo_cartera = Decimal(cartera.saldo_pendiente)
            plan_viejo = [c for c in cuotas if c.created_at < venta.terminada_en]
            sin_cuota = saldo_cartera - _saldo(cuotas)
            if plan_viejo or sin_cuota > 0:
                yield venta, cartera, saldo_cartera, plan_viejo, max(sin_cuota, CERO)

    def _linea(self, venta, extra):
        return (
            f"  {venta.clinica.nombre} | venta {venta.id} | {venta.paciente.nombre_completo} | "
            f"terminada {venta.terminada_en:%Y-%m-%d} | {extra}"
        )

    def handle(self, *args, **options):
        aplicar = options["aplicar"]
        filas = list(self._revisar(options.get("clinica")))
        if not filas:
            self.stdout.write(self.style.SUCCESS("No hay ventas terminadas con la cartera abierta por error."))
            return

        con_plan = [f for f in filas if f[3]]
        self.stdout.write(f"\n1. Con el plan de cuotas de antes de terminar: {len(con_plan)}")
        for venta, _cartera, saldo_cartera, plan_viejo, _sin_cuota in con_plan:
            vencidas = [c for c in plan_viejo if c.vencida]
            self.stdout.write(self._linea(venta, (
                f"saldo cartera {saldo_cartera:,.0f} | {len(plan_viejo)} cuota(s) del plan viejo por "
                f"{_saldo(plan_viejo):,.0f} | vencidas {len(vencidas)} por {_saldo(vencidas):,.0f}"
            )))
        if con_plan:
            self.stdout.write(
                "  Este comando no las cambia. Si la clínica no las va a cobrar: Console › Soporte › "
                "«Cerrar cartera de una venta terminada». Si sí: reanudar la venta y terminarla de nuevo."
            )

        sin_cuota_filas = [f for f in filas if f[4] > 0]
        self.stdout.write(f"\n2. Con saldo sin cuota: {len(sin_cuota_filas)}")
        for venta, _cartera, saldo_cartera, _plan_viejo, sin_cuota in sin_cuota_filas:
            self.stdout.write(self._linea(
                venta, f"saldo cartera {saldo_cartera:,.0f} | sin cuota {sin_cuota:,.0f}",
            ))
        if sin_cuota_filas:
            total = sum((f[4] for f in sin_cuota_filas), CERO)
            self.stdout.write(f"  Total sin cuota: {total:,.0f}")

        if not aplicar:
            if sin_cuota_filas:
                self.stdout.write(self.style.WARNING("\nSolo lista. Usa --aplicar para perdonar el saldo sin cuota (grupo 2)."))
            return

        for venta, cartera, _saldo_cartera, plan_viejo, sin_cuota in sin_cuota_filas:
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
                        "saldo_cubierto_por_cuotas": f"{_saldo(_cuotas_pendientes(cartera)):.2f}",
                    },
                    clinica=venta.clinica,
                )
        self.stdout.write(self.style.SUCCESS(f"\nCorregidas {len(sin_cuota_filas)} ventas con saldo sin cuota."))
