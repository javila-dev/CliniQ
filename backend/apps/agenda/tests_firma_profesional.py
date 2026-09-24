"""Al iniciar la atención, el profesional de la cita firma los consentimientos que el
paciente ya firmó (firma diferida en el mismo sobre de Documenso)."""
import base64
import io
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Sede, Servicio, ServicioConsentimiento
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.core.models import LogAccion
from apps.historia_clinica.documenso_firmantes import imagen_a_data_url_png
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import DocumensoIntegrationError
from apps.pacientes.models import Paciente

User = get_user_model()


def _imagen(formato="PNG") -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), (10, 10, 120)).save(buffer, format=formato)
    return buffer.getvalue()


@override_settings(
    DOCUMENSO_API_URL="",
    MINIO_PUBLIC_BUCKET="",
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class FirmaProfesionalAlIniciarAtencionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica FP", nit="900765432")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.profesional = User.objects.create_user(
            email="dra@example.com", password="secret123", first_name="Ana", last_name="Lopez",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
            registro_profesional="TP-9876",
        )
        self.profesional.firma_digital.save("firma.png", ContentFile(_imagen()), save=True)
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="123450000",
            nombres="Juan", apellidos="Perez", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.servicio = Servicio.objects.create(
            clinica=self.clinica, nombre="Toxina", descripcion="Aplicacion", duracion_min=30, precio="150000.00",
        )
        self.template = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Toxina botulínica", template_token="toxina-fp",
        )
        ServicioConsentimiento.objects.create(servicio=self.servicio, template=self.template, orden=1)
        inicio = timezone.now() + timedelta(hours=1)
        self.cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=self.servicio, profesional=self.profesional,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=Cita.Estado.EN_ESPERA,
            canal_confirmacion=self.paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token="toxina-fp", documenso_template_nombre="Toxina botulínica",
            firmado=True, fecha_firma=timezone.localdate() - timedelta(days=90),
            documenso_document_id="envelope_1", requiere_firma_profesional=True,
            documenso_recipient_paciente_id="11", documenso_recipient_profesional_id="12",
        )
        self.url = f"/api/v1/agenda/citas/{self.cita.id}/firma_profesional/"

    def _iniciar_atencion(self):
        return self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/", {"estado": Cita.Estado.EN_CURSO}, format="json",
        )

    def test_no_se_puede_iniciar_la_atencion_sin_la_firma_del_profesional(self):
        self.client.force_authenticate(self.profesional)

        response = self._iniciar_atencion()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "FIRMA_PROFESIONAL_REQUERIDA")
        self.assertEqual(
            [d["id"] for d in response.json()["documentos"]], [str(self.consentimiento.id)],
        )
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.EN_ESPERA)

    def test_get_lista_los_documentos_y_confirma_que_puede_firmar(self):
        self.client.force_authenticate(self.profesional)

        data = self.client.get(self.url).json()

        self.assertTrue(data["puede_firmar"])
        self.assertIsNone(data["motivo"])
        self.assertEqual(data["documentos"][0]["nombre"], "Toxina botulínica")
        self.assertEqual(data["profesional"]["registro_profesional"], "TP-9876")

    def test_bloqueado_sin_firma_cargada(self):
        self.client.force_authenticate(self.profesional)
        self.profesional.firma_digital.delete(save=True)

        self.assertEqual(self.client.get(self.url).json()["motivo"]["code"], "SIN_FIRMA")

    def test_la_tp_solo_se_exige_si_el_documento_tiene_el_campo(self):
        self.client.force_authenticate(self.profesional)
        self.profesional.registro_profesional = "  "
        self.profesional.save(update_fields=["registro_profesional"])

        # Sin campo de TP (p. ej. consentimiento de cosmetología): puede firmar sin TP.
        self.assertTrue(self.client.get(self.url).json()["puede_firmar"])

        self.consentimiento.requiere_tp_profesional = True
        self.consentimiento.save()
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SIN_TP")

    def test_solo_firma_el_profesional_asignado_a_la_cita(self):
        admin = User.objects.create_user(
            email="admin-fp@example.com", password="secret123", rol=User.Role.ADMIN, clinica=self.clinica,
            registro_profesional="TP-1",
        )
        admin.firma_digital.save("firma-admin.png", ContentFile(_imagen()), save=True)
        self.client.force_authenticate(admin)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PROFESIONAL_NO_ASIGNADO")
        self.consentimiento.refresh_from_db()
        self.assertIsNone(self.consentimiento.fecha_firma_profesional)

    @patch("apps.historia_clinica.firma_profesional.firmar_como_profesional")
    def test_firma_y_luego_inicia_la_atencion(self, mocked_firmar):
        self.client.force_authenticate(self.profesional)

        response = self.client.post(self.url, HTTP_USER_AGENT="Navegador de la doctora")

        self.assertEqual(response.status_code, 200, response.content)
        kwargs = mocked_firmar.call_args.kwargs
        self.assertEqual(kwargs["envelope_id"], "envelope_1")
        self.assertEqual(kwargs["recipient_id"], "12")
        self.assertEqual(kwargs["nombre"], "Ana Lopez")
        self.assertEqual(kwargs["email"], "dra@example.com")
        self.assertEqual(kwargs["registro_profesional"], "TP-9876")
        self.assertTrue(kwargs["firma_data_url"].startswith("data:image/png;base64,"))
        self.assertEqual(kwargs["user_agent"], "Navegador de la doctora")

        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.firmado_profesional_por, self.profesional)
        self.assertIsNotNone(self.consentimiento.fecha_firma_profesional)
        self.assertIsNotNone(self.consentimiento.fecha_vencimiento)
        self.assertTrue(
            LogAccion.objects.filter(accion="consentimiento.firma_profesional", objeto_id=str(self.cita.id)).exists()
        )

        self.assertEqual(self._iniciar_atencion().status_code, 200)

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
        self.assertEqual(self._iniciar_atencion().json()["code"], "FIRMA_PROFESIONAL_REQUERIDA")

    def test_ver_documento_devuelve_el_pdf_de_la_plantilla(self):
        self.template.pdf_file.save("plantilla-fp.pdf", ContentFile(b"%PDF-contenido"), save=True)
        self.consentimiento.plantilla = self.template
        self.consentimiento.save()
        self.client.force_authenticate(self.profesional)

        response = self.client.get(f"{self.url}documento/{self.consentimiento.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(response.content, b"%PDF-contenido")
        otro = self.client.get(f"{self.url}documento/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(otro.status_code, 404)

    def test_consentimiento_sin_firma_del_profesional_no_bloquea(self):
        self.consentimiento.requiere_firma_profesional = False
        self.consentimiento.save()
        self.client.force_authenticate(self.profesional)

        self.assertEqual(self._iniciar_atencion().status_code, 200)


@override_settings(
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class ImagenFirmaTests(TestCase):
    def test_convierte_jpeg_a_png(self):
        data_url = imagen_a_data_url_png(_imagen("JPEG"))

        self.assertTrue(data_url.startswith("data:image/png;base64,"))
        self.assertEqual(base64.b64decode(data_url.split(",", 1)[1])[:8], b"\x89PNG\r\n\x1a\n")
