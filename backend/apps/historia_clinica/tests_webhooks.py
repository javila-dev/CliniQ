import json
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Sede
from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente

User = get_user_model()

WEBHOOK_SECRET = "test-webhook-secret"


@override_settings(
    DOCUMENSO_WEBHOOK_SECRET=WEBHOOK_SECRET,
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class WebhookAsistenciaIdempotenciaTests(TestCase):
    """
    Documenso reintenta la entrega de webhooks (comportamiento normal, no un
    error). Sin un guard de idempotencia, cada reintento volvia a descargar y
    guardar el PDF -- con AWS_S3_FILE_OVERWRITE=False eso deja un archivo
    huerfano nuevo en storage por cada reintento.
    """

    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Webhook", nit="901555666")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )
        self.profesional = User.objects.create_user(
            email="prof-webhook@example.com", password="secret123", first_name="P", last_name="W",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="222333444",
            nombres="Sara", apellidos="Ruiz", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3000000003",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional,
            fecha_inicio=timezone.now(), fecha_fin=timezone.now() + timedelta(hours=1),
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )

    def _post_webhook(self, external_id, document_id="doc-1", event="DOCUMENT_COMPLETED"):
        payload = {"event": event, "payload": {"externalId": external_id, "id": document_id}}
        return self.client.post(
            "/webhooks/documenso/", data=json.dumps(payload), content_type="application/json",
            HTTP_X_DOCUMENSO_SECRET=WEBHOOK_SECRET,
        )

    @patch("apps.historia_clinica.webhooks.descargar_pdf_documenso")
    def test_primer_webhook_marca_firmada_y_guarda_pdf(self, mocked_descargar):
        mocked_descargar.return_value = b"%PDF-fake"

        response = self._post_webhook(f"asistencia:{self.cita.id}")

        self.assertEqual(response.status_code, 200)
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.firma_asistencia_estado, "firmada")
        self.assertTrue(self.cita.firma_asistencia_archivo)
        mocked_descargar.assert_called_once()

    @patch("apps.historia_clinica.webhooks.descargar_pdf_documenso")
    def test_reintento_del_webhook_no_vuelve_a_descargar_el_pdf(self, mocked_descargar):
        mocked_descargar.return_value = b"%PDF-fake"
        self._post_webhook(f"asistencia:{self.cita.id}")
        mocked_descargar.reset_mock()

        response = self._post_webhook(f"asistencia:{self.cita.id}")

        self.assertEqual(response.status_code, 200)
        mocked_descargar.assert_not_called()


@override_settings(
    DOCUMENSO_WEBHOOK_SECRET=WEBHOOK_SECRET,
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class WebhookCompromisoPagoIdempotenciaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Webhook CP", nit="901555777")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )
        self.superadmin = User.objects.create_user(
            email="root-webhook-cp@example.com", password="secret123", first_name="R", last_name="W",
            rol=User.Role.SUPERADMIN,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="222333555",
            nombres="Diana", apellidos="Pena", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 3", telefono="3000000004",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.superadmin, sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        self.plantilla = PlantillaConsentimiento.objects.create(
            clinica=self.clinica, ambito=PlantillaConsentimiento.Ambito.COTIZACION,
            nombre="Compromiso", contenido_html="<p>Texto</p>",
        )
        self.consentimiento = Consentimiento.objects.create(
            cotizacion=self.cotizacion, paciente=self.paciente, plantilla=self.plantilla,
            contenido_snapshot="<p>Texto</p>", hash_contenido="b" * 64,
            documenso_documento_id="envelope-cp-1",
        )

    def _post_webhook(self, document_id="doc-cp-1", event="DOCUMENT_COMPLETED"):
        payload = {
            "event": event,
            "payload": {"externalId": f"compromiso_pago:{self.consentimiento.id}", "id": document_id},
        }
        return self.client.post(
            "/webhooks/documenso/", data=json.dumps(payload), content_type="application/json",
            HTTP_X_DOCUMENSO_SECRET=WEBHOOK_SECRET,
        )

    @patch("apps.historia_clinica.webhooks.descargar_pdf_documenso")
    def test_webhook_marca_el_consentimiento_correcto_como_firmado(self, mocked_descargar):
        mocked_descargar.return_value = b"%PDF-fake"

        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.estado, Consentimiento.Estado.FIRMADO)
        self.assertIsNotNone(self.consentimiento.firmado_en)
        self.assertTrue(self.consentimiento.pdf_archivo)

    @patch("apps.historia_clinica.webhooks.descargar_pdf_documenso")
    def test_reintento_del_webhook_no_vuelve_a_descargar_el_pdf(self, mocked_descargar):
        mocked_descargar.return_value = b"%PDF-fake"
        self._post_webhook()
        mocked_descargar.reset_mock()

        # Documenso reintenta la misma entrega (comportamiento real de webhooks).
        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        mocked_descargar.assert_not_called()

    def test_secret_invalido_se_rechaza_y_no_toca_el_consentimiento(self):
        payload = {
            "event": "DOCUMENT_COMPLETED",
            "payload": {"externalId": f"compromiso_pago:{self.consentimiento.id}", "id": "doc"},
        }
        response = self.client.post(
            "/webhooks/documenso/", data=json.dumps(payload), content_type="application/json",
            HTTP_X_DOCUMENSO_SECRET="secreto-incorrecto",
        )
        self.assertEqual(response.status_code, 401)
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.estado, Consentimiento.Estado.PENDIENTE)
