"""Cobro con tarjeta (Wompi simulado): contratar, webhook, renovaciones, reintentos y cambios."""

import hashlib
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Plan
from apps.core.tests.factories import ClinicaFixtureMixin, User

from . import cobros, services
from .models import CobroSuscripcion, FuentePago, Suscripcion

E = Suscripcion.Estado
WOMPI = dict(
    WOMPI_ENV="sandbox", WOMPI_PUBLIC_KEY="pub_test_x", WOMPI_PRIVATE_KEY="prv_test_x",
    WOMPI_EVENTS_SECRET="test_events_x", WOMPI_INTEGRITY_SECRET="test_integrity_x",
)
FUENTE_OK = {"id": 1234, "status": "AVAILABLE"}


def _transaccion(estado):
    return {"id": "tx-1", "status": estado, "status_message": "" if estado == "APPROVED" else "Fondos insuficientes"}


class CalculosTests(TestCase):
    def test_el_anual_aplica_el_descuento_en_pesos_enteros(self):
        plan = Plan(nombre="Clínica", precio=Decimal("270000"), descuento_anual_pct=17)
        self.assertEqual(cobros.precio_periodo(plan, "mensual"), Decimal("270000"))
        self.assertEqual(cobros.precio_periodo(plan, "anual"), Decimal("2689200"))

    def test_fecha_aniversario_con_dia_que_no_existe(self):
        self.assertEqual(cobros.fin_de_periodo(date(2026, 1, 31), "mensual", 31), date(2026, 2, 27))
        self.assertEqual(cobros.fin_de_periodo(date(2026, 2, 28), "mensual", 31), date(2026, 3, 30))
        self.assertEqual(cobros.fin_de_periodo(date(2026, 10, 21), "anual", 21), date(2027, 10, 20))

    @override_settings(WOMPI_INTEGRITY_SECRET="secreto")
    def test_firma_de_integridad(self):
        from . import wompi

        esperado = hashlib.sha256(b"REF1150000COPsecreto").hexdigest()
        self.assertEqual(wompi.firma_integridad("REF1", 150000), esperado)


@override_settings(**WOMPI)
class CobroTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.plan = Plan.objects.create(nombre="Solo", precio=Decimal("120000"), max_usuarios=0, max_sedes=0, descuento_anual_pct=17)
        self.plan_grande = Plan.objects.create(nombre="Clínica", precio=Decimal("270000"), max_usuarios=0, max_sedes=0)
        self.s = services.crear_prueba(self.clinica, 14)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _contratar(self, estado="APPROVED", ciclo="mensual", plan=None):
        with patch("apps.suscripciones.wompi.crear_fuente_pago", return_value=FUENTE_OK), \
             patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion(estado)), \
             patch("apps.suscripciones.wompi.anular_fuente_pago") as anular:
            respuesta = self.client.post("/api/v1/suscripcion/pago/contratar/", {
                "plan": str((plan or self.plan).pk), "ciclo": ciclo, "token": "tok_test_1",
                "acceptance_token": "acc", "accept_personal_auth": "per", "acepta_terminos": True,
                "tarjeta": {"marca": "VISA", "ultimos4": "4242", "expira_mes": "12", "expira_anio": "29", "titular": "Ana"},
                "datos_facturacion": {
                    "tipo_persona": "juridica", "tipo_documento": "NIT", "numero_documento": "900.123.456", "dv": "8",
                    "razon_social": "Clínica Test SAS", "email_facturacion": "facturas@test.com", "telefono": "3001234567",
                    "direccion": "Calle 1 # 2-3", "ciudad": "Bogotá, D.C.", "departamento": "Bogotá D.C.",
                },
            }, format="json")
        return respuesta, anular

    def test_pagar_en_la_prueba_activa_y_el_periodo_empieza_al_terminarla(self):
        respuesta, _ = self._contratar()
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        self.assertEqual(respuesta.json()["estado"], "aprobado")
        self.s.refresh_from_db()
        self.clinica.refresh_from_db()
        fin_prueba = timezone.localdate(self.s.prueba_termina_el)
        self.assertEqual(self.s.estado, E.ACTIVA)
        self.assertEqual(self.s.periodo_inicio, fin_prueba + timedelta(days=1))
        self.assertEqual(self.s.proximo_cobro_el, self.s.periodo_fin)
        self.assertEqual(self.s.precio_periodo, Decimal("120000"))
        self.assertEqual(self.clinica.plan_id, self.plan.pk)
        self.assertEqual(self.s.fuente_pago.ultimos4, "4242")
        self.assertEqual(self.clinica.datos_facturacion.razon_social, "Clínica Test SAS")

    def test_pago_rechazado_no_cambia_la_cuenta_y_anula_la_tarjeta(self):
        respuesta, anular = self._contratar(estado="DECLINED")
        self.assertEqual(respuesta.json()["estado"], "rechazado")
        self.s.refresh_from_db()
        self.assertEqual(self.s.estado, E.PRUEBA)
        anular.assert_called_once()
        self.assertEqual(FuentePago.objects.get().estado, FuentePago.Estado.ANULADA)

    def test_con_la_cuenta_suspendida_quien_administra_puede_pagar(self):
        Suscripcion.objects.filter(pk=self.s.pk).update(estado=E.SUSPENDIDA, prueba_termina_el=timezone.now() - timedelta(days=40))
        respuesta, _ = self._contratar()
        self.s.refresh_from_db()
        self.assertEqual((respuesta.status_code, self.s.estado), (201, E.ACTIVA))
        self.assertEqual(self.s.periodo_inicio, timezone.localdate())

    def test_webhook_aprueba_un_cobro_pendiente_y_rechaza_firmas_falsas(self):
        self._contratar(estado="PENDING")
        cobro = CobroSuscripcion.objects.get()
        evento = {
            "event": "transaction.updated",
            "data": {"transaction": {
                "id": "tx-1", "status": "APPROVED", "amount_in_cents": cobro.monto_centavos, "reference": cobro.referencia,
            }},
            "signature": {"properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"], "checksum": "falso"},
            "timestamp": 1700000000,
        }
        cliente = APIClient()
        self.assertEqual(cliente.post("/api/v1/suscripcion/webhooks/wompi/", evento, format="json").status_code, 401)
        texto = f"tx-1APPROVED{cobro.monto_centavos}1700000000test_events_x"
        evento["signature"]["checksum"] = hashlib.sha256(texto.encode()).hexdigest()
        self.assertEqual(cliente.post("/api/v1/suscripcion/webhooks/wompi/", evento, format="json").status_code, 200)
        cobro.refresh_from_db()
        self.assertEqual(cobro.estado, "aprobado")
        self.s.refresh_from_db()
        self.assertEqual(self.s.estado, E.ACTIVA)

    def _vencer_periodo(self):
        self._contratar()
        hoy = timezone.localdate()
        Suscripcion.objects.filter(pk=self.s.pk).update(periodo_inicio=hoy - timedelta(days=29), periodo_fin=hoy, proximo_cobro_el=hoy)
        self.s.refresh_from_db()

    def test_renovacion_rechazada_da_gracia_reintenta_y_al_tercer_fallo_solo_lectura(self):
        self._vencer_periodo()
        with patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion("DECLINED")):
            cobros.renovar(self.s)
            self.s.refresh_from_db()
            self.assertEqual((self.s.estado, self.s.intentos_fallidos), (E.EN_GRACIA, 1))
            self.assertEqual(self.s.proximo_cobro_el, timezone.localdate() + timedelta(days=3))
            for _ in range(2):
                Suscripcion.objects.filter(pk=self.s.pk).update(proximo_cobro_el=timezone.localdate())
                self.s.refresh_from_db()
                cobros.renovar(self.s)
        self.s.refresh_from_db()
        self.assertEqual((self.s.estado, self.s.intentos_fallidos), (E.SOLO_LECTURA, 3))

    def test_renovacion_aprobada_extiende_el_periodo(self):
        self._vencer_periodo()
        fin = self.s.periodo_fin
        with patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion("APPROVED")):
            cobros.renovar(self.s)
            self.assertIsNone(cobros.renovar(Suscripcion.objects.get(pk=self.s.pk)))  # ya no toca
        self.s.refresh_from_db()
        self.assertEqual(self.s.periodo_inicio, fin + timedelta(days=1))
        self.assertEqual(CobroSuscripcion.objects.filter(concepto="renovacion").count(), 1)

    def test_cambiar_tarjeta_en_mora_reintenta_el_cobro(self):
        self._vencer_periodo()
        with patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion("DECLINED")):
            cobros.renovar(self.s)
        with patch("apps.suscripciones.wompi.crear_fuente_pago", return_value={"id": 999, "status": "AVAILABLE"}), \
             patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion("APPROVED")), \
             patch("apps.suscripciones.wompi.anular_fuente_pago"):
            respuesta = self.client.post("/api/v1/suscripcion/pago/tarjeta/", {
                "token": "tok_2", "acceptance_token": "a", "accept_personal_auth": "p",
                "tarjeta": {"marca": "MASTERCARD", "ultimos4": "5555"},
            }, format="json")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.s.refresh_from_db()
        self.assertEqual((self.s.estado, self.s.fuente_pago.ultimos4), (E.ACTIVA, "5555"))

    def test_subir_de_plan_cobra_la_diferencia_prorrateada(self):
        self._contratar()
        hoy = timezone.localdate()
        Suscripcion.objects.filter(pk=self.s.pk).update(periodo_inicio=hoy - timedelta(days=15), periodo_fin=hoy + timedelta(days=14))
        with patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion("APPROVED")) as cobrar:
            respuesta = self.client.post(
                "/api/v1/suscripcion/pago/cambiar-plan/", {"plan": str(self.plan_grande.pk), "ciclo": "mensual"}, format="json",
            )
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        # (270.000 - 120.000) x 15 días de 30
        self.assertEqual(cobrar.call_args.kwargs["monto_centavos"], 75000 * 100)
        self.clinica.refresh_from_db()
        self.assertEqual(self.clinica.plan_id, self.plan_grande.pk)

    def test_bajar_de_plan_se_aplica_al_renovar(self):
        self._contratar(plan=self.plan_grande)
        respuesta = self.client.post("/api/v1/suscripcion/pago/cambiar-plan/", {"plan": str(self.plan.pk), "ciclo": "mensual"}, format="json")
        self.assertIsNone(respuesta.json()["cobro"])
        self.assertEqual(respuesta.json()["suscripcion"]["plan_pendiente_nombre"], "Solo")
        hoy = timezone.localdate()
        Suscripcion.objects.filter(pk=self.s.pk).update(periodo_inicio=hoy - timedelta(days=29), periodo_fin=hoy, proximo_cobro_el=hoy)
        with patch("apps.suscripciones.wompi.cobrar", return_value=_transaccion("APPROVED")) as cobrar:
            cobros.renovar(Suscripcion.objects.get(pk=self.s.pk))
        self.assertEqual(cobrar.call_args.kwargs["monto_centavos"], 120000 * 100)
        self.clinica.refresh_from_db()
        self.assertEqual(self.clinica.plan_id, self.plan.pk)

    def test_cancelar_no_renueva_y_al_terminar_queda_cancelada(self):
        self._vencer_periodo()
        self.client.post("/api/v1/suscripcion/pago/cancelar/", {"cancelar": True}, format="json")
        s = Suscripcion.objects.get(pk=self.s.pk)
        self.assertIsNone(cobros.renovar(s))
        self.assertEqual(services.estado_vigente(s, timezone.now() + timedelta(days=1))[0], E.CANCELADA)

    def test_no_se_contrata_un_plan_mas_chico_que_el_uso(self):
        self.plan.max_usuarios = 1
        self.plan.save()
        User.objects.create_user(
            email="otro@test.com", password="Secret123!", first_name="O", last_name="T", rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        respuesta, _ = self._contratar()
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("usuarios", respuesta.json()["error"])


@override_settings(**WOMPI)
class DatosFacturacionTests(ClinicaFixtureMixin, TestCase):
    """No se puede pagar ni facturar con datos incompletos o mal escritos."""

    VALIDOS = {
        "tipo_persona": "juridica", "tipo_documento": "NIT", "numero_documento": "900123456", "dv": "8",
        "razon_social": "Clínica Test SAS", "email_facturacion": "facturas@test.com", "telefono": "3001234567",
        "direccion": "Calle 1 # 2-3", "ciudad": "Medellín", "departamento": "Antioquia",
        "responsable_iva": False, "responsabilidades_fiscales": [],
    }

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        services.crear_prueba(self.clinica, 14)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _guardar(self, **cambios):
        return self.client.put("/api/v1/suscripcion/pago/facturacion/", {**self.VALIDOS, **cambios}, format="json")

    def test_datos_completos_se_guardan(self):
        respuesta = self._guardar(responsabilidades_fiscales=["12", "5"])
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["datos_facturacion_faltantes"], {})
        self.assertEqual(self.clinica.datos_facturacion.responsabilidades_fiscales, ["12", "5"])

    def test_dv_que_no_corresponde_al_nit(self):
        self.assertIn("dv", self._guardar(dv="7").json())

    def test_municipio_fuera_del_catalogo_o_de_otro_departamento(self):
        self.assertIn("ciudad", self._guardar(ciudad="Ciudad Inventada").json())
        self.assertIn("ciudad", self._guardar(ciudad="Cúcuta").json())
        self.assertIn("departamento", self._guardar(departamento="Norte de Santander").json())

    def test_faltan_telefono_correo_y_direccion(self):
        errores = self._guardar(telefono="", email_facturacion="sin-arroba", direccion="").json()
        self.assertTrue({"telefono", "email_facturacion", "direccion"} <= set(errores))

    def test_empresa_sin_nit_y_persona_sin_apellidos(self):
        self.assertIn("tipo_documento", self._guardar(tipo_documento="CC", dv="").json())
        errores = self._guardar(tipo_persona="natural", tipo_documento="CC", numero_documento="1020304050", dv="",
                                razon_social="", nombres="Ana", apellidos="").json()
        self.assertEqual(set(errores), {"apellidos"})

    def test_persona_natural_con_cedula(self):
        respuesta = self._guardar(tipo_persona="natural", tipo_documento="CC", numero_documento="1.020.304.050", dv="9",
                                  razon_social="", nombres="Ana", apellidos="Ruiz", ciudad="Bogotá, D.C.", departamento="Bogotá D.C.")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        guardados = self.clinica.datos_facturacion
        self.assertEqual((guardados.numero_documento, guardados.dv), ("1020304050", ""))

    def test_no_se_puede_pagar_con_datos_incompletos(self):
        with patch("apps.suscripciones.wompi.crear_fuente_pago") as crear_fuente:
            respuesta = self.client.post("/api/v1/suscripcion/pago/contratar/", {
                "plan": str(Plan.objects.create(nombre="Solo", precio=Decimal("120000")).pk), "ciclo": "mensual",
                "token": "tok", "acceptance_token": "a", "accept_personal_auth": "p", "acepta_terminos": True,
                "tarjeta": {"marca": "VISA", "ultimos4": "4242"},
                "datos_facturacion": {**self.VALIDOS, "ciudad": "Ciudad Inventada"},
            }, format="json")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("ciudad", respuesta.json()["datos_facturacion"])
        crear_fuente.assert_not_called()  # ni siquiera se guarda la tarjeta
