"""Desde la venta aprobada cualquier profesional de la clínica firma los consentimientos
que el paciente ya firmó (firma diferida en el mismo sobre de Documenso), sin esperar a la cita."""
import io
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Servicio, ServicioConsentimiento
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.core.models import LogAccion
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import DocumensoIntegrationError
from apps.pacientes.models import Paciente

User = get_user_model()


def _imagen() -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), (10, 10, 120)).save(buffer, format="PNG")
    return buffer.getvalue()


@override_settings(
    DOCUMENSO_API_URL="",
    MINIO_PUBLIC_BUCKET="",
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class FirmaProfesionalDesdeLaVentaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Venta FP", nit="900765433")
        # La venta la creó recepción: no hay "profesional de la venta" que deba firmar.
        self.recepcion = User.objects.create_user(
            email="recepcion-fp@example.com", password="secret123", rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.profesional = User.objects.create_user(
            email="dra-venta@example.com", password="secret123", first_name="Ana", last_name="Lopez",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True, registro_profesional="TP-9876",
        )
        self.profesional.firma_digital.save("firma-venta.png", ContentFile(_imagen()), save=True)
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="123450099",
            nombres="Juan", apellidos="Perez", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="Calle 2", telefono="3001112299",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        servicio = Servicio.objects.create(
            clinica=self.clinica, nombre="Toxina", descripcion="Aplicacion", duracion_min=30, precio="150000.00",
        )
        self.template = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Toxina botulínica", template_token="toxina-venta",
        )
        ServicioConsentimiento.objects.create(servicio=servicio, template=self.template, orden=1)
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.recepcion,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        ItemCotizacion.objects.create(
            cotizacion=self.cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=servicio,
            descripcion="Toxina", num_citas=1, valor_unitario=Decimal("150000"),
        )
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token="toxina-venta", documenso_template_nombre="Toxina botulínica",
            firmado=True, fecha_firma=timezone.localdate(),
            documenso_document_id="envelope_9", requiere_firma_profesional=True,
            documenso_recipient_paciente_id="21", documenso_recipient_profesional_id="22",
        )
        self.url = f"/api/v1/cotizaciones/{self.cotizacion.id}/firma_profesional/"

    def test_el_panel_de_la_venta_marca_el_consentimiento_como_pendiente_del_profesional(self):
        self.client.force_authenticate(self.profesional)

        data = self.client.get(f"/api/v1/cotizaciones/{self.cotizacion.id}/consentimientos/").json()

        self.assertEqual(data[0]["estado"], "firmado")
        self.assertTrue(data[0]["pendiente_firma_profesional"])

    def test_cualquier_profesional_puede_firmar_aunque_no_haya_creado_la_venta(self):
        self.client.force_authenticate(self.profesional)

        data = self.client.get(self.url).json()

        self.assertTrue(data["puede_firmar"])
        self.assertIsNone(data["motivo"])
        self.assertEqual([d["id"] for d in data["documentos"]], [str(self.consentimiento.id)])

    def test_quien_no_es_profesional_no_puede_firmar(self):
        self.recepcion.registro_profesional = "TP-1"
        self.recepcion.save(update_fields=["registro_profesional"])
        self.recepcion.firma_digital.save("firma-recepcion.png", ContentFile(_imagen()), save=True)
        self.client.force_authenticate(self.recepcion)

        self.assertEqual(self.client.get(self.url).json()["motivo"]["code"], "NO_ES_PROFESIONAL")
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 400)
        self.consentimiento.refresh_from_db()
        self.assertIsNone(self.consentimiento.fecha_firma_profesional)

    def test_la_venta_debe_estar_aprobada(self):
        self.cotizacion.estado = Cotizacion.Estado.BORRADOR
        self.cotizacion.save(update_fields=["estado"])
        self.client.force_authenticate(self.profesional)

        self.assertEqual(self.client.get(self.url).json()["motivo"]["code"], "VENTA_NO_APROBADA")
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 400)
        self.consentimiento.refresh_from_db()
        self.assertIsNone(self.consentimiento.fecha_firma_profesional)

    def test_bloqueado_sin_firma_cargada(self):
        self.profesional.firma_digital.delete(save=True)
        self.client.force_authenticate(self.profesional)

        self.assertEqual(self.client.get(self.url).json()["motivo"]["code"], "SIN_FIRMA")

    @patch("apps.historia_clinica.firma_profesional.firmar_como_profesional")
    def test_firma_desde_la_venta(self, mocked_firmar):
        self.client.force_authenticate(self.profesional)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 200, response.content)
        kwargs = mocked_firmar.call_args.kwargs
        self.assertEqual(kwargs["envelope_id"], "envelope_9")
        self.assertEqual(kwargs["recipient_id"], "22")
        self.assertEqual(kwargs["registro_profesional"], "TP-9876")
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.firmado_profesional_por, self.profesional)
        self.assertIsNotNone(self.consentimiento.fecha_vencimiento)
        self.assertTrue(
            LogAccion.objects.filter(
                accion="consentimiento.firma_profesional", objeto_id=str(self.cotizacion.id),
            ).exists()
        )
        self.assertEqual(self.client.get(self.url).json()["documentos"], [])

    @patch(
        "apps.historia_clinica.firma_profesional.firmar_como_profesional",
        side_effect=DocumensoIntegrationError("Documenso rechazo la firma del profesional."),
    )
    def test_si_documenso_falla_no_queda_firmado(self, _mocked):
        self.client.force_authenticate(self.profesional)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "FIRMA_PROFESIONAL_FALLIDA")
        self.consentimiento.refresh_from_db()
        self.assertIsNone(self.consentimiento.fecha_firma_profesional)

    def test_ver_documento_devuelve_el_pdf_de_la_plantilla(self):
        self.template.pdf_file.save("plantilla-venta.pdf", ContentFile(b"%PDF-venta"), save=True)
        self.consentimiento.plantilla = self.template
        self.consentimiento.save()
        self.client.force_authenticate(self.profesional)

        response = self.client.get(f"{self.url}documento/{self.consentimiento.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"%PDF-venta")
        otro = self.client.get(f"{self.url}documento/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(otro.status_code, 404)
