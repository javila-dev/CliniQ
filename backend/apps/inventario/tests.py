from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.clinicas.models import Clinica, Sede
from apps.cobros.models import Cobro
from apps.cotizaciones.models import Cotizacion
from apps.inventario.models import Insumo, MovimientoInventario
from apps.inventario.serializers import MovimientoInventarioSerializer
from apps.pacientes.models import Paciente

User = get_user_model()


class ContextoMovimientoCobroTests(TestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(
            email="kardex@example.com",
            password="secret123",
            first_name="Kar",
            last_name="Dex",
            rol=User.Role.SUPERADMIN,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica Kardex", nit="901333444")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="111222333",
            nombres="Luz",
            apellidos="Kardex",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 2",
            telefono="3012222222",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.insumo = Insumo.objects.create(
            clinica=self.clinica,
            nombre="Crema",
            unidad_medida=Insumo.UnidadMedida.UNIDAD,
            es_venta_retail=True,
        )

    def _movimiento_de_cobro(self, cobro):
        return MovimientoInventario.objects.create(
            insumo=self.insumo,
            sede=self.sede,
            tipo=MovimientoInventario.TipoMovimiento.SALIDA,
            cantidad=Decimal("1"),
            costo_unitario=Decimal("1000.00"),
            costo_promedio_resultante=Decimal("1000.00"),
            stock_resultante=Decimal("9"),
            origen=MovimientoInventario.OrigenMovimiento.VENTA_RETAIL,
            referencia_id=cobro.id,
            referencia_tipo="cobro",
            realizado_por=self.usuario,
        )

    def _cobro(self, **extra):
        return Cobro.objects.create(
            paciente=self.paciente, sede=self.sede, created_by=self.usuario, **extra,
        )

    def test_cobro_de_cotizacion_devuelve_la_referencia_corta(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.usuario, sede=self.sede,
        )
        cobro = self._cobro(origen=Cobro.Origen.COTIZACION, cotizacion=cotizacion)

        contexto = MovimientoInventarioSerializer(self._movimiento_de_cobro(cobro)).data["contexto"]

        self.assertEqual(contexto["tipo"], "cobro")
        self.assertEqual(contexto["origen"], "cotizacion")
        self.assertEqual(contexto["cotizacion_id"], str(cotizacion.id))
        self.assertEqual(contexto["cotizacion_numero"], str(cotizacion.id)[:8].upper())

    def test_cobro_sin_cotizacion_no_tiene_referencia(self):
        cobro = self._cobro(origen=Cobro.Origen.LIBRE)

        contexto = MovimientoInventarioSerializer(self._movimiento_de_cobro(cobro)).data["contexto"]

        self.assertEqual(contexto["tipo"], "cobro")
        self.assertIsNone(contexto["cotizacion_id"])
        self.assertIsNone(contexto["cotizacion_numero"])
