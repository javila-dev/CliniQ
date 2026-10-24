"""Factura electrónica (Alegra simulado) de los cobros aprobados."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Plan
from apps.core.tests.factories import ClinicaFixtureMixin, User

from . import alegra, facturacion, services
from .models import CobroSuscripcion, DatosFacturacion, FacturaSaaS, FuentePago

ALEGRA = dict(
    ALEGRA_EMAIL="facturas@cliniq.test", ALEGRA_TOKEN="tok", ALEGRA_NUMBER_TEMPLATE_ID="14",
    ALEGRA_ITEM_ID="7", ALEGRA_BANK_ACCOUNT_ID="2", ALEGRA_TAX_ID="", ALEGRA_IVA_PCT=19,
    ALEGRA_MEDIO_PAGO="CREDIT_CARD", ALEGRA_EMITIR_DIAN=True,
)
FACTURA_OK = {"id": 501, "numberTemplate": {"prefix": "FE", "number": "123"}, "stamp": {"cufe": "abc123", "legalStatus": "ACCEPTED"}}


@override_settings(**ALEGRA)
class FacturacionTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.plan = Plan.objects.create(nombre="Solo", precio=Decimal("120000"), max_usuarios=0, max_sedes=0)
        self.s = services.crear_prueba(self.clinica, 14)
        self.datos = DatosFacturacion.objects.create(
            clinica=self.clinica, tipo_persona="juridica", tipo_documento="NIT", numero_documento="900123456", dv="8",
            razon_social="Clínica Test SAS", email_facturacion="facturas@clinica.test", telefono="3001234567",
            direccion="Calle 1 # 2-3", ciudad="Bogotá, D.C.", departamento="Bogotá D.C.", responsabilidades_fiscales=["12"],
        )
        fuente = FuentePago.objects.create(clinica=self.clinica, wompi_id="1", email="facturas@clinica.test", marca="VISA", ultimos4="4242")
        hoy = timezone.localdate()
        self.cobro = CobroSuscripcion.objects.create(
            suscripcion=self.s, referencia="CQ-1", concepto="primer_pago", plan=self.plan, ciclo="mensual",
            periodo_inicio=hoy, periodo_fin=hoy + timedelta(days=29), monto_centavos=12_000_000,
            estado="aprobado", fuente_pago=fuente,
        )

    def _emitir(self, crear=None):
        with patch("apps.suscripciones.alegra.buscar_contacto", return_value=None), \
             patch("apps.suscripciones.alegra.crear_contacto", return_value={"id": 88}), \
             patch("apps.suscripciones.alegra.actualizar_contacto"), \
             patch("apps.suscripciones.alegra.crear_factura", **(crear or {"return_value": FACTURA_OK})) as crear_factura, \
             patch("apps.suscripciones.alegra.enviar_factura") as enviar:
            factura = facturacion.emitir(self.cobro)
        return factura, crear_factura, enviar

    def test_emite_la_factura_pagada_con_el_total_cobrado_y_la_envia(self):
        factura, crear, enviar = self._emitir()
        self.assertEqual((factura.estado, factura.numero, factura.cufe), ("emitida", "FE123", "abc123"))
        datos = crear.call_args.args[0]
        self.assertEqual(datos["client"], {"id": "88"})
        contacto = facturacion.datos_contacto(self.datos)
        self.assertEqual((contacto["regime"], contacto["fiscalResponsabilities"]), ("SIMPLIFIED_REGIME", ["12"]))
        self.assertEqual(datos["items"][0]["price"], 120000.0)
        self.assertNotIn("tax", datos["items"][0])
        self.assertEqual(datos["payments"][0]["amount"], 120000.0)
        self.assertTrue(datos["stamp"]["generateStamp"])
        enviar.assert_called_once_with("501", ["facturas@clinica.test"])
        self.datos.refresh_from_db()
        self.assertEqual(self.datos.alegra_contact_id, "88")

    @override_settings(ALEGRA_TAX_ID="3")
    def test_con_iva_el_item_va_sin_iva_y_el_pago_es_el_total(self):
        _, crear, _ = self._emitir()
        datos = crear.call_args.args[0]
        self.assertEqual(datos["items"][0]["price"], 100840.34)
        self.assertEqual(datos["items"][0]["tax"], [{"id": "3"}])
        self.assertEqual(datos["payments"][0]["amount"], 120000.0)

    def test_si_la_dian_la_rechaza_se_guarda_el_borrador_y_se_reintenta_sin_duplicar(self):
        error = alegra.AlegraError("Rechazada por la DIAN", {"invoice": {"id": 777}}, 400)
        factura, _, _ = self._emitir({"side_effect": error})
        self.assertEqual((factura.estado, factura.alegra_invoice_id, factura.intentos), ("pendiente", "777", 1))
        with patch("apps.suscripciones.alegra.timbrar") as timbrar, \
             patch("apps.suscripciones.alegra.obtener_factura", return_value={**FACTURA_OK, "id": 777}), \
             patch("apps.suscripciones.alegra.crear_factura") as crear, \
             patch("apps.suscripciones.alegra.enviar_factura"):
            factura = facturacion.emitir(self.cobro)
        timbrar.assert_called_once_with(["777"])
        crear.assert_not_called()
        self.assertEqual(factura.estado, "emitida")

    def test_tras_cinco_intentos_queda_en_error_y_la_consola_la_reintenta(self):
        for _ in range(facturacion.INTENTOS_MAXIMOS):
            factura, _, _ = self._emitir({"side_effect": alegra.AlegraError("Alegra caído")})
        self.assertEqual(factura.estado, "error")
        self.assertEqual(facturacion.procesar_facturas(), [])  # ya no la toca la tarea periódica
        superadmin = User.objects.create_user(email="root@test.com", password="Secret123!", first_name="R", last_name="S", rol=User.Role.SUPERADMIN)
        cliente = APIClient()
        cliente.force_authenticate(superadmin)
        with patch("apps.suscripciones.alegra.buscar_contacto", return_value=None), \
             patch("apps.suscripciones.alegra.crear_contacto", return_value={"id": 88}), \
             patch("apps.suscripciones.alegra.actualizar_contacto"), \
             patch("apps.suscripciones.alegra.crear_factura", return_value=FACTURA_OK), \
             patch("apps.suscripciones.alegra.enviar_factura"):
            respuesta = cliente.post("/api/v1/suscripcion/admin/cobros/CQ-1/factura/")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["factura"]["numero"], "FE123")

    def test_al_aprobar_un_cobro_se_factura(self):
        from . import cobros

        self.cobro.estado = "pendiente"
        self.cobro.save()
        with patch("apps.suscripciones.facturacion.emitir") as emitir, self.captureOnCommitCallbacks(execute=True):
            cobros.aprobar(self.cobro)
        emitir.assert_called_once()
        self.assertEqual(emitir.call_args.args[0].pk, self.cobro.pk)

    @override_settings(ALEGRA_EMITIR_DIAN=False)
    def test_en_modo_pruebas_es_borrador_sin_pago(self):
        factura, crear, _ = self._emitir()
        datos = crear.call_args.args[0]
        self.assertEqual(datos["status"], "draft")
        self.assertNotIn("payments", datos)
        self.assertNotIn("stamp", datos)
        self.assertEqual(factura.numero, "Borrador 501")

    def test_datos_viejos_incompletos_no_se_mandan_a_alegra(self):
        self.datos.ciudad, self.datos.telefono = "Bogotá", ""
        self.datos.save()
        factura, crear, _ = self._emitir()
        crear.assert_not_called()
        self.assertEqual(factura.estado, "pendiente")
        self.assertIn("incompletos", factura.ultimo_error)

    def test_consola_pagos_de_todas_las_clinicas_con_filtros_y_totales(self):
        hoy = timezone.localdate()
        CobroSuscripcion.objects.create(
            suscripcion=self.s, referencia="CQ-2", concepto="renovacion", plan=self.plan, ciclo="mensual",
            periodo_inicio=hoy, periodo_fin=hoy + timedelta(days=29), monto_centavos=12_000_000, estado="rechazado",
        )
        FacturaSaaS.objects.create(cobro=self.cobro, estado="emitida", numero="FE123", alegra_invoice_id="501")
        superadmin = User.objects.create_user(email="root@test.com", password="Secret123!", first_name="R", last_name="S", rol=User.Role.SUPERADMIN)
        cliente = APIClient()
        cliente.force_authenticate(superadmin)

        datos = cliente.get("/api/v1/suscripcion/admin/pagos/").json()
        self.assertEqual(datos["count"], 2)
        self.assertEqual(datos["resumen"], {
            "aprobados": 1, "total_aprobado": 120000.0, "rechazados": 1, "pendientes": 0, "facturas_con_problema": 0,
        })
        fila = next(f for f in datos["results"] if f["referencia"] == "CQ-1")
        self.assertEqual((fila["clinica_nombre"], fila["factura"]["numero"]), ("Clinica Test", "FE123"))

        self.assertEqual([f["referencia"] for f in cliente.get("/api/v1/suscripcion/admin/pagos/?estado=fallido").json()["results"]], ["CQ-2"])
        self.assertEqual(cliente.get("/api/v1/suscripcion/admin/pagos/?factura=sin_factura").json()["count"], 0)
        self.assertEqual(cliente.get("/api/v1/suscripcion/admin/pagos/?q=fe123").json()["count"], 1)
        manana = (hoy + timedelta(days=1)).isoformat()
        self.assertEqual(cliente.get(f"/api/v1/suscripcion/admin/pagos/?desde={manana}").json()["count"], 0)

    @override_settings(ALEGRA_TOKEN="")
    def test_sin_alegra_configurado_no_se_hace_nada(self):
        self.assertIsNone(facturacion.emitir(self.cobro))
        self.assertFalse(FacturaSaaS.objects.exists())
