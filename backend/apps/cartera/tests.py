from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.cartera.models import Cartera
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.cobros.models import Cobro
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente


User = get_user_model()


class CarteraFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-cartera@example.com",
            password="secret123",
            first_name="Root",
            last_name="Cartera",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Cartera", nit="901888777")
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario={
                "lunes": ["08:00", "18:00"],
                "martes": ["08:00", "18:00"],
                "miercoles": ["08:00", "18:00"],
                "jueves": ["08:00", "18:00"],
                "viernes": ["08:00", "18:00"],
            },
        )
        self.profesional = User.objects.create_user(
            email="prof-cartera@example.com",
            password="secret123",
            first_name="Ana",
            last_name="Garcia",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="555222111",
            nombres="Kelly",
            apellidos="Atencia",
            fecha_nacimiento=timezone.localdate() - timedelta(days=29 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 8",
            telefono="3009990000",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.servicio = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Toxina",
            descripcion="Aplicacion",
            duracion_min=30,
            precio="350000.00",
        )
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.BORRADOR,
        )
        item = self.cotizacion.items.create(
            descripcion="Toxina botulinica",
            num_citas=4,
            periodicidad="Cada 4 meses",
            valor_unitario="350000.00",
            descuento_porcentaje="0.00",
        )
        self.item = item
        self.cotizacion.formas_pago.create(tipo="transferencia", descripcion="Cuota 1", valor="350000.00")
        self.cotizacion.formas_pago.create(tipo="transferencia", descripcion="Cuota 2", valor="350000.00")

    def _crear_cita_payload(self):
        inicio = timezone.now() + timedelta(days=1)
        return {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "servicio": str(self.servicio.id),
            "profesional": str(self.profesional.id),
            "fecha_inicio": inicio.isoformat(),
            "canal_origen": "presencial",
            "item_cotizacion": str(self.item.id),
        }

    def test_aceptar_cotizacion_crea_cartera_y_cuotas(self):
        response = self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        cartera = Cartera.objects.get(cotizacion=self.cotizacion)
        self.assertEqual(cartera.total, self.cotizacion.total)
        self.assertEqual(cartera.cuotas.count(), 2)

    def test_registrar_pago_de_cuota_y_resumen(self):
        self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        cartera = Cartera.objects.get(cotizacion=self.cotizacion)
        cuota = cartera.cuotas.first()

        pago = self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/registrar_pago/",
            {
                "valor_pagado": "350000.00",
                "fecha_pago": timezone.localdate().isoformat(),
                "medio_pago": "transferencia",
                "observaciones": "Nequi",
            },
            format="json",
        )

        self.assertEqual(pago.status_code, 200)
        self.assertIn("cobro_id", pago.json())
        cartera.refresh_from_db()
        self.assertEqual(str(cartera.total_pagado), "350000.00")
        cobro = Cobro.objects.get(id=pago.json()["cobro_id"])
        self.assertEqual(cobro.origen, Cobro.Origen.COTIZACION)
        self.assertEqual(cobro.cotizacion_id, self.cotizacion.id)
        self.assertEqual(str(cobro.total), "350000.00")

        resumen = self.client.get("/api/v1/cartera/resumen/")
        self.assertEqual(resumen.status_code, 200)
        self.assertEqual(resumen.json()["total_cobrado"], "350000.00")

    def test_listado_cartera_pagina_y_busca_por_nombre(self):
        self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )

        otro_paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="111000222",
            nombres="Bruno",
            apellidos="Zapata",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO,
            direccion="Calle 9",
            telefono="3001112222",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        otra_cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=otro_paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.BORRADOR,
        )
        otra_cotizacion.items.create(
            descripcion="Peeling",
            num_citas=1,
            periodicidad="Única",
            valor_unitario="200000.00",
            descuento_porcentaje="0.00",
        )
        otra_cotizacion.formas_pago.create(tipo="efectivo", descripcion="Contado", valor="200000.00")
        self.client.post(
            f"/api/v1/cotizaciones/{otra_cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )

        todas = self.client.get("/api/v1/cartera/").json()
        self.assertIn("count", todas)
        self.assertIn("results", todas)
        self.assertEqual(todas["count"], 2)

        por_nombre = self.client.get("/api/v1/cartera/", {"search": "kelly"}).json()
        self.assertEqual(por_nombre["count"], 1)
        self.assertIn("Kelly", por_nombre["results"][0]["paciente_nombre"])

        por_apellido = self.client.get("/api/v1/cartera/", {"search": "zapata"}).json()
        self.assertEqual(por_apellido["count"], 1)

        por_documento = self.client.get("/api/v1/cartera/", {"search": "111000222"}).json()
        self.assertEqual(por_documento["count"], 1)
        self.assertIn("Bruno", por_documento["results"][0]["paciente_nombre"])

        pagina = self.client.get("/api/v1/cartera/", {"page_size": 1}).json()
        self.assertEqual(pagina["count"], 2)
        self.assertEqual(len(pagina["results"]), 1)
        self.assertIsNotNone(pagina["next"])

    def test_abono_parcial_deja_cuota_abierta_y_marca_mora(self):
        self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        cartera = Cartera.objects.get(cotizacion=self.cotizacion)
        cuota = cartera.cuotas.first()
        cuota.fecha_esperada = timezone.localdate() - timedelta(days=3)
        cuota.save(update_fields=["fecha_esperada"])

        abono = self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/registrar_pago/",
            {
                "valor_pagado": "100000.00",
                "fecha_pago": timezone.localdate().isoformat(),
                "medio_pago": "efectivo",
            },
            format="json",
        )
        self.assertEqual(abono.status_code, 200, abono.content)
        cuota.refresh_from_db()
        self.assertFalse(cuota.pagada)
        self.assertEqual(str(cuota.valor_pagado), "100000.00")
        self.assertEqual(cuota.saldo_pendiente, Decimal("250000.00"))

        detalle = self.client.get(f"/api/v1/cartera/{cartera.id}/").json()
        self.assertTrue(detalle["en_mora"])
        self.assertGreaterEqual(detalle["mora_dias"], 3)
        self.assertEqual(detalle["mora_valor"], "250000.00")
        self.assertEqual(detalle["proxima_cuota_valor"], "250000.00")
        cuota_payload = next(c for c in detalle["cuotas"] if c["id"] == str(cuota.id))
        self.assertEqual(cuota_payload["saldo_pendiente"], "250000.00")
        self.assertTrue(cuota_payload["vencida"])

        resumen = self.client.get("/api/v1/cartera/resumen/").json()
        self.assertGreaterEqual(resumen["cuotas_vencidas"], 1)
        self.assertEqual(resumen["total_cobrado"], "100000.00")

        saldo = self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/registrar_pago/",
            {
                "valor_pagado": "250000.00",
                "fecha_pago": timezone.localdate().isoformat(),
                "medio_pago": "efectivo",
            },
            format="json",
        )
        self.assertEqual(saldo.status_code, 200, saldo.content)
        cuota.refresh_from_db()
        self.assertTrue(cuota.pagada)
        self.assertEqual(str(cuota.valor_pagado), "350000.00")

        detalle = self.client.get(f"/api/v1/cartera/{cartera.id}/").json()
        self.assertFalse(detalle["en_mora"])

    def test_registrar_pago_rechaza_monto_mayor_al_saldo(self):
        self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        cartera = Cartera.objects.get(cotizacion=self.cotizacion)
        cuota = cartera.cuotas.first()
        self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/registrar_pago/",
            {
                "valor_pagado": "300000.00",
                "fecha_pago": timezone.localdate().isoformat(),
                "medio_pago": "efectivo",
            },
            format="json",
        )
        excede = self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/registrar_pago/",
            {
                "valor_pagado": "100000.00",
                "fecha_pago": timezone.localdate().isoformat(),
                "medio_pago": "efectivo",
            },
            format="json",
        )
        self.assertEqual(excede.status_code, 400)
        self.assertIn("PAGO_EXCEDE_CUOTA", str(excede.json()))

    def test_cita_puede_vincular_item_de_cotizacion_aceptada(self):
        self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        response = self.client.post("/api/v1/agenda/citas/", self._crear_cita_payload(), format="json")

        self.assertEqual(response.status_code, 201, response.content)
        cita = Cita.objects.get()
        self.assertEqual(cita.item_cotizacion_id, self.item.id)
        self.assertEqual(response.json()["cotizacion_resumen"]["citas_restantes"], 3)
