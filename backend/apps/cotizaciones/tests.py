from datetime import timedelta
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.agenda.models import Cita
from apps.clinicas.models import Sede, Servicio, ServicioConsentimiento, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo, TratamientoProcedimiento
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
from apps.cotizaciones.pdf import build_cotizacion_pdf_html
from apps.pacientes.models import Paciente


User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class CotizacionFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-cotizacion@example.com",
            password="secret123",
            first_name="Root",
            last_name="Cotizacion",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Comercial", nit="901111222")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="123123123",
            nombres="Kelly",
            apellidos="Atencia",
            fecha_nacimiento=timezone.localdate() - timedelta(days=29 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 21",
            telefono="3010000000",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
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
        self.servicio = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Toxina",
            descripcion="Aplicacion",
            duracion_min=30,
            precio="350000.00",
        )

    def _payload(self):
        return {
            "paciente": str(self.paciente.id),
            "validez_dias": 30,
            "notas": "Incluye control posterior.",
            "items": [
                {
                    "descripcion": "Toxina botulinica",
                    "num_citas": 1,
                    "duracion_estimada": "45 min",
                    "periodicidad": "Cada 4 meses",
                    "valor_unitario": "350000.00",
                    "descuento_porcentaje": "0.00",
                }
            ],
            "formas_pago": [
                {
                    "tipo": "transferencia",
                    "descripcion": "Banco XYZ",
                    "valor": "350000.00",
                }
            ],
        }

    def test_crea_cotizacion_con_items_y_formas_pago(self):
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")

        self.assertEqual(response.status_code, 201)
        cotizacion = Cotizacion.objects.get()
        self.assertEqual(cotizacion.items.count(), 1)
        self.assertEqual(cotizacion.formas_pago.count(), 1)
        self.assertEqual(response.json()["estado"], Cotizacion.Estado.BORRADOR)
        self.assertEqual(response.json()["items"][0]["periodicidad"], "Cada 4 meses")

    def test_permite_editar_si_esta_en_borrador(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.BORRADOR,
        )

        response = self.client.patch(
            f"/api/v1/cotizaciones/{cotizacion.id}/",
            {"notas": "Cambio"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.notas, "Cambio")

    def test_no_permite_editar_si_ya_fue_aceptada(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.ACEPTADA,
        )

        response = self.client.patch(
            f"/api/v1/cotizaciones/{cotizacion.id}/",
            {"notas": "Cambio"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COTIZACION_NO_EDITABLE")

    def test_cambiar_estado_valida_transiciones(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
        )

        response = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/",
            {"estado": "vencida"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.ACEPTADA)

    def test_patch_persiste_periodicidad_en_items(self):
        create_response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion_id = create_response.json()["id"]
        item_id = create_response.json()["items"][0]["id"]

        response = self.client.patch(
            f"/api/v1/cotizaciones/{cotizacion_id}/",
            {
                "items": [
                    {
                        "id": item_id,
                        "descripcion": "Toxina botulinica",
                        "num_citas": 2,
                        "duracion_estimada": "45 min",
                        "periodicidad": "Mensual",
                        "valor_unitario": "350000.00",
                        "descuento_porcentaje": "10.00",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["periodicidad"], "Mensual")
        cotizacion = Cotizacion.objects.get(id=cotizacion_id)
        self.assertEqual(cotizacion.items.get(activo=True).periodicidad, "Mensual")

    def test_detalle_y_panel_sesiones_exponen_consumo_por_item(self):
        create_response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion = Cotizacion.objects.get(id=create_response.json()["id"])
        item = cotizacion.items.get()
        cotizacion.estado = Cotizacion.Estado.ACEPTADA
        cotizacion.save(update_fields=["estado", "updated_at"])

        inicio = timezone.now() + timedelta(days=1)
        cita = Cita.objects.create(
            paciente=self.paciente,
            sede=self.sede,
            servicio=self.servicio,
            profesional=self.superadmin,
            fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=self.servicio.duracion_min),
            estado=Cita.Estado.COMPLETADA,
            estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO,
            canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
            created_by=self.superadmin,
            item_cotizacion=item,
        )

        detail = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/")
        sesiones = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/sesiones/")

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["items"][0]["citas_agendadas"], 1)
        self.assertEqual(detail.json()["items"][0]["citas_completadas"], 1)
        self.assertEqual(detail.json()["items"][0]["citas_restantes"], 0)
        self.assertEqual(sesiones.status_code, 200)

    def test_item_cotizacion_se_autocompleta_desde_tratamiento(self):
        tratamiento = TratamientoCatalogo.objects.create(
            clinica=self.clinica,
            nombre="Plan Toxina Premium",
            descripcion="Paquete",
            precio_estimado="700000.00",
        )
        tipo = TipoSesion.objects.create(
            tratamiento=tratamiento,
            nombre="Sesion Toxina",
            cantidad=2,
            orden=1,
        )
        TipoSesionProcedimiento.objects.create(
            tipo_sesion=tipo,
            procedimiento=self.servicio,
            orden=1,
        )

        payload = self._payload()
        payload["items"] = [
            {
                "tratamiento": str(tratamiento.id),
                "descuento_porcentaje": "0.00",
            }
        ]

        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        item = response.json()["items"][0]
        self.assertEqual(item["tratamiento"], str(tratamiento.id))
        self.assertEqual(item["tipo"], "tratamiento")
        self.assertEqual(item["tratamiento_nombre"], "Plan Toxina Premium")
        self.assertIsNone(item["procedimiento"])
        self.assertIsNone(item["procedimiento_nombre"])
        self.assertEqual(item["descripcion"], "Plan Toxina Premium")
        self.assertEqual(item["valor_unitario"], "700000.00")
        self.assertEqual(item["num_citas"], 2)

    def test_item_cotizacion_con_procedimiento_expone_tipo_y_nombre(self):
        payload = self._payload()
        payload["items"] = [
            {
                "tipo": "procedimiento",
                "procedimiento": str(self.servicio.id),
                "descuento_porcentaje": "10.00",
            }
        ]

        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        item = response.json()["items"][0]
        self.assertEqual(item["tipo"], "procedimiento")
        self.assertEqual(item["procedimiento"], str(self.servicio.id))
        self.assertEqual(item["procedimiento_nombre"], "Toxina")
        self.assertIsNone(item["tratamiento"])
        self.assertIsNone(item["tratamiento_nombre"])
        self.assertEqual(item["descripcion"], "Toxina")
        self.assertEqual(item["valor_unitario"], "350000.00")
        self.assertEqual(item["duracion_estimada"], "30 min")

        sesiones = self.client.get(f"/api/v1/cotizaciones/{response.json()['id']}/sesiones/")
        self.assertEqual(sesiones.status_code, 200)
        self.assertEqual(sesiones.json()["items"][0]["tipo"], "procedimiento")

    def test_item_cotizacion_valida_fk_obligatorio_segun_tipo(self):
        payload = self._payload()
        payload["items"] = [
            {
                "tipo": "tratamiento",
                "descripcion": "Plan sin catalogo",
                "valor_unitario": "100000.00",
            }
        ]

        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["items"]["tratamiento"][0], "Requerido para tipo tratamiento.")

        payload["items"] = [
            {
                "tipo": "procedimiento",
                "descripcion": "Procedimiento sin catalogo",
                "valor_unitario": "100000.00",
            }
        ]

        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["items"]["procedimiento"][0], "Requerido para tipo procedimiento.")

    def test_item_cotizacion_valida_clinica_del_procedimiento_para_superadmin(self):
        otra_clinica = Clinica.objects.create(nombre="Clinica Externa", nit="900999888")
        procedimiento_externo = Servicio.objects.create(
            clinica=otra_clinica,
            nombre="Laser externo",
            descripcion="No pertenece",
            duracion_min=30,
            precio="200000.00",
        )
        payload = self._payload()
        payload["items"] = [
            {
                "tipo": "procedimiento",
                "procedimiento": str(procedimiento_externo.id),
                "descuento_porcentaje": "0.00",
            }
        ]

        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("procedimiento", response.json()["items"])

    def test_aceptar_cotizacion_devuelve_consentimientos_pendientes(self):
        template = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica,
            tipo="otros",
            template_token="consentimiento-toxina",
        )
        ServicioConsentimiento.objects.create(servicio=self.servicio, template=template, orden=1)
        tratamiento = TratamientoCatalogo.objects.create(
            clinica=self.clinica,
            nombre="Plan Consentimiento",
            descripcion="Paquete",
            precio_estimado="500000.00",
        )
        tipo = TipoSesion.objects.create(
            tratamiento=tratamiento,
            nombre="Sesion Toxina",
            cantidad=1,
            orden=1,
        )
        TipoSesionProcedimiento.objects.create(tipo_sesion=tipo, procedimiento=self.servicio, orden=1)

        payload = self._payload()
        payload["items"] = [{"tratamiento": str(tratamiento.id), "descuento_porcentaje": "0.00"}]
        create_response = self.client.post("/api/v1/cotizaciones/", payload, format="json")

        response = self.client.post(
            f"/api/v1/cotizaciones/{create_response.json()['id']}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["estado"], Cotizacion.Estado.ACEPTADA)
        self.assertEqual(response.json()["consentimientos_pendientes"][0]["template_token"], "consentimiento-toxina")

    @patch("apps.cotizaciones.views.render_cotizacion_pdf")
    def test_pdf_incluye_columna_periodicidad_si_hay_valores(self, mocked_render_pdf):
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion = Cotizacion.objects.get(id=response.json()["id"])
        html = build_cotizacion_pdf_html(cotizacion)
        self.assertIn("Periodicidad", html)
        self.assertIn("Cada 4 meses", html)
        self.assertIn("FORMAS DE PAGO", html.upper())
        self.assertIn("TOTAL", html.upper())

        mocked_render_pdf.return_value = b"%PDF-test"
        pdf_response = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/pdf/")
        self.assertEqual(pdf_response.status_code, 200)
        mocked_render_pdf.assert_called_once()

    @override_settings(MINIO_ENDPOINT="http://minio:9000", MINIO_PUBLIC_BUCKET="clinica-static")
    def test_pdf_incluye_logo_publico_con_hostname_interno_si_la_clinica_lo_tiene(self):
        self.clinica.logo = SimpleUploadedFile("logo.png", b"fake-png-content", content_type="image/png")
        self.clinica.save(update_fields=["logo", "updated_at"])
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion = Cotizacion.objects.get(id=response.json()["id"])

        html = build_cotizacion_pdf_html(cotizacion)

        self.assertIn("http://minio:9000/clinica-static/", html)
        self.assertIn(self.clinica.nombre, html)

    @patch("apps.cotizaciones.views.enviar_documento_whatsapp_webhook")
    def test_enviar_whatsapp_cotizacion_llama_webhook_con_payload_estandar(self, mocked_send):
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion = Cotizacion.objects.get(id=response.json()["id"])
        mocked_send.return_value = {}

        send_response = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/enviar_whatsapp/",
            {},
            format="json",
        )

        self.assertEqual(send_response.status_code, 200)
        self.assertIn("envio_id", send_response.json())
        mocked_send.assert_called_once()
        kwargs = mocked_send.call_args.kwargs
        self.assertEqual(kwargs["paciente"], self.paciente)
        self.assertEqual(kwargs["tipo_notificacion"], "envio_cotizacion")
        self.assertEqual(kwargs["nombre_archivo_pdf"], f"cotizacion-{cotizacion.id}.pdf")
        envio = CotizacionEnvio.objects.get(id=send_response.json()["envio_id"])
        self.assertEqual(envio.canal, CotizacionEnvio.Canal.WHATSAPP)
        self.assertEqual(envio.destinatario, self.paciente.telefono)

    @patch("apps.cotizaciones.views.email_provider_config")
    @patch("apps.cotizaciones.views.enviar_email")
    def test_enviar_email_cotizacion_crea_historial(self, mocked_send_email, mocked_email_config):
        self.paciente.email = "paciente@example.com"
        self.paciente.save(update_fields=["email"])
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion = Cotizacion.objects.get(id=response.json()["id"])
        mocked_email_config.return_value = {"configured": True}
        mocked_send_email.return_value = 1

        send_response = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/enviar_email/",
            {"notas": "Adjunto cotizacion"},
            format="json",
        )

        self.assertEqual(send_response.status_code, 200)
        self.assertIn("envio_id", send_response.json())
        mocked_send_email.assert_called_once()
        envio = CotizacionEnvio.objects.get(id=send_response.json()["envio_id"])
        self.assertEqual(envio.canal, CotizacionEnvio.Canal.EMAIL)
        self.assertEqual(envio.destinatario, "paciente@example.com")

    def test_registrar_envio_pdf_y_listar_envios(self):
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        cotizacion = Cotizacion.objects.get(id=response.json()["id"])

        registrar = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/registrar_envio/",
            {"canal": "pdf", "notas": "Descargada manualmente"},
            format="json",
        )
        envios = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/envios/")
        detalle = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/")

        self.assertEqual(registrar.status_code, 201)
        self.assertEqual(registrar.json()["canal"], "pdf")
        self.assertEqual(envios.status_code, 200)
        self.assertEqual(len(envios.json()), 1)
        self.assertEqual(envios.json()[0]["notas"], "Descargada manualmente")
        self.assertEqual(detalle.status_code, 200)
        self.assertEqual(detalle.json()["envios"][0]["canal"], "pdf")
