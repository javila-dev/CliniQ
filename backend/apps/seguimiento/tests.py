"""Seguimiento (fase 2 del embudo): interesados, Para hoy, gestiones y avance automático."""

import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.agenda.models import Cita
from apps.cotizaciones import tests as cotizaciones_tests
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
from apps.seguimiento.models import Oportunidad

URL = "/api/v1/seguimiento/oportunidades/"


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class SeguimientoTests(TestCase):
    _forma_pago = cotizaciones_tests.CotizacionFlowTests._forma_pago
    _payload = cotizaciones_tests.CotizacionFlowTests._payload

    def setUp(self):
        cotizaciones_tests.CotizacionFlowTests.setUp(self)
        # El superadmin trabaja sobre la clínica que manda en el header.
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))

    def _crear_interesado(self, **extra):
        data = {"nombre": "Laura Pérez", "telefono": "300 555 1234", "interes": "Depilación axilas", "origen": "instagram"}
        data.update(extra)
        response = self.client.post(URL, data, format="json")
        return response

    def _cotizacion(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return Cotizacion.objects.get(pk=response.json()["id"])

    def _cita(self, dias=2):
        inicio = timezone.now() + timedelta(days=dias)
        with self.captureOnCommitCallbacks(execute=True):
            return Cita.objects.create(
                paciente=self.paciente, sede=self.sede, profesional=self.superadmin,
                fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
                canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
            )

    # ── Interesados ──

    def test_crear_interesado_sin_ficha_queda_para_hoy(self):
        response = self._crear_interesado()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertIsNone(data["paciente"])
        self.assertEqual(data["etapa"], "nuevo")
        self.assertEqual(data["tipo"], "nueva")
        self.assertEqual(data["proximo_contacto"], timezone.localdate().isoformat())
        self.assertEqual(data["responsable"], str(self.superadmin.id))
        self.assertIn("le interesa Depilación axilas", data["frase"])

        response = self.client.get(f"{URL}?para_hoy=1")
        self.assertEqual([o["id"] for o in response.json()["results"]], [data["id"]])

    def test_crear_interesado_con_sede(self):
        response = self._crear_interesado(sede=str(self.sede.id))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["sede"], str(self.sede.id))

        from apps.clinicas.models import Clinica, Sede

        otra = Sede.objects.create(
            clinica=Clinica.objects.create(nombre="Otra", nit="900000001"),
            nombre="Ajena", ciudad="Cali", direccion="x", telefono="1",
        )
        response = self._crear_interesado(nombre="Otro", telefono="3105550000", sede=str(otra.id))
        self.assertEqual(response.status_code, 400)

    def test_telefono_de_un_paciente_lo_vincula_y_no_duplica(self):
        # El paciente del setUp tiene 3010000000.
        response = self._crear_interesado(nombre="Kelly", telefono="+57 301 000 0000")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["paciente"], str(self.paciente.id))

        response = self._crear_interesado(nombre="Kelly otra vez", telefono="3010000000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "OPORTUNIDAD_ABIERTA")

    # ── Gestiones ──

    def test_gestion_mueve_el_proximo_contacto(self):
        oportunidad_id = self._crear_interesado().json()["id"]
        hoy = timezone.localdate()

        response = self.client.post(
            f"{URL}{oportunidad_id}/gestiones/", {"canal": "llamada", "resultado": "sin_respuesta"}, format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["proximo_contacto"], (hoy + timedelta(days=1)).isoformat())
        self.assertEqual(response.json()["ultima_gestion"]["resultado"], "sin_respuesta")
        # Ya no está en "Para hoy".
        self.assertEqual(self.client.get(f"{URL}?para_hoy=1").json()["count"], 0)

        elegida = hoy + timedelta(days=7)
        response = self.client.post(
            f"{URL}{oportunidad_id}/gestiones/",
            {"canal": "whatsapp_manual", "resultado": "interesado", "proximo_contacto": elegida.isoformat()},
            format="json",
        )
        self.assertEqual(response.json()["proximo_contacto"], elegida.isoformat())
        self.assertEqual(len(self.client.get(f"{URL}{oportunidad_id}/gestiones/").json()), 2)

    def test_perder_y_reabrir(self):
        oportunidad_id = self._crear_interesado().json()["id"]
        response = self.client.post(f"{URL}{oportunidad_id}/perder/", {"motivo": "precio"}, format="json")
        self.assertEqual(response.json()["estado"], "perdida")
        self.assertIsNone(response.json()["proximo_contacto"])
        self.assertEqual(self.client.get(URL).json()["count"], 0)

        response = self.client.post(f"{URL}{oportunidad_id}/reabrir/")
        self.assertEqual(response.json()["estado"], "abierta")

    # ── Avance automático ──

    def test_embudo_avanza_con_cita_envio_y_aceptacion(self):
        oportunidad_id = self._crear_interesado(telefono="3010000000").json()["id"]

        cita = self._cita(dias=2)
        oportunidad = Oportunidad.objects.get(pk=oportunidad_id)
        self.assertEqual(oportunidad.etapa, "valoracion")
        self.assertEqual(oportunidad.cita, cita)
        self.assertEqual(oportunidad.proximo_contacto, timezone.localdate(cita.fecha_inicio) + timedelta(days=1))

        cotizacion = self._cotizacion()
        self.assertEqual(cotizacion.oportunidad_id, oportunidad.id)

        with self.captureOnCommitCallbacks(execute=True):
            CotizacionEnvio.objects.create(cotizacion=cotizacion, canal=CotizacionEnvio.Canal.PDF)
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.etapa, "cotizado")
        self.assertEqual(oportunidad.valor_estimado, cotizacion.total)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", {"estado": "aceptada"}, format="json")
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.estado, "ganada")
        self.assertIsNone(oportunidad.proximo_contacto)

    def test_un_error_del_seguimiento_no_impide_aceptar(self):
        self._crear_interesado(telefono="3010000000")
        cotizacion = self._cotizacion()
        with patch("apps.seguimiento.services.abiertas_de_venta", side_effect=RuntimeError("boom")):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(
                    f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", {"estado": "aceptada"}, format="json",
                )
        self.assertEqual(response.status_code, 200, response.content)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.ACEPTADA)

    def test_descartar_cotizacion_puede_cerrar_el_seguimiento(self):
        oportunidad_id = self._crear_interesado(telefono="3010000000").json()["id"]
        cotizacion = self._cotizacion()
        response = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/",
            {"estado": "descartada", "motivo_descarte": "precio", "cerrar_oportunidad": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["oportunidad"], oportunidad_id)
        oportunidad = Oportunidad.objects.get(pk=oportunidad_id)
        self.assertEqual(oportunidad.estado, "perdida")
        self.assertEqual(oportunidad.motivo_perdida, "precio")

    def test_cotizacion_sin_oportunidad_no_crea_una(self):
        self._cotizacion()
        self.assertFalse(Oportunidad.objects.exists())

    # ── Embudo ──

    def test_embudo_cuenta_por_etapa(self):
        self._crear_interesado(valor_estimado="200000.00")
        perdida_id = self._crear_interesado(nombre="Otra", telefono="3109998877").json()["id"]
        self.client.post(f"{URL}{perdida_id}/perder/", {"motivo": "otra_clinica"}, format="json")

        data = self.client.get(f"{URL}embudo/").json()
        etapas = {e["etapa"]: e for e in data["etapas"]}
        self.assertEqual(etapas["nuevo"]["cantidad"], 1)
        self.assertEqual(etapas["nuevo"]["valor"], "200000.00")
        self.assertEqual(data["perdidas"]["cantidad"], 1)
        self.assertEqual(data["perdidas"]["por_motivo"][0]["motivo"], "otra_clinica")
        self.assertEqual(data["por_origen"][0]["origen"], "instagram")
        self.assertEqual(data["para_hoy"], 1)
