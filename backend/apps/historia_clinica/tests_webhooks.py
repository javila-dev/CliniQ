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


@override_settings(
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class RecuperarPdfCompromisoPagoTests(TestCase):
    """El PDF solo se guarda cuando Documenso ya sello el documento: antes de eso
    la descarga devuelve el original SIN firma y quedaria guardado para siempre."""

    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica PDF CP", nit="901555888")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="222333666",
            nombres="Lina", apellidos="Mora", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 4", telefono="3000000005",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        cotizacion = Cotizacion.objects.create(clinica=self.clinica, paciente=self.paciente)
        self.consentimiento = Consentimiento.objects.create(
            cotizacion=cotizacion, paciente=self.paciente, plantilla=None,
            contenido_snapshot="<p>Texto</p>", hash_contenido="c" * 64,
            documenso_documento_id="envelope-pdf-1", estado=Consentimiento.Estado.FIRMADO,
        )

    @patch("apps.historia_clinica.services.descargar_pdf_documenso")
    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_no_guarda_el_pdf_si_documenso_aun_no_sello_el_documento(self, mocked_fetch, mocked_descargar):
        from apps.consentimientos.services import recuperar_pdf_compromiso_pago

        mocked_fetch.return_value = {"status": "PENDING", "secondaryId": "document_7"}
        mocked_descargar.return_value = b"%PDF-sin-firma"

        guardado = recuperar_pdf_compromiso_pago(self.consentimiento)

        self.assertFalse(guardado)
        mocked_descargar.assert_not_called()
        self.consentimiento.refresh_from_db()
        self.assertFalse(self.consentimiento.pdf_archivo)

    @patch("apps.historia_clinica.services.descargar_pdf_documenso")
    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_guarda_el_pdf_firmado_cuando_esta_sellado_y_puede_reemplazar_uno_previo(self, mocked_fetch, mocked_descargar):
        from apps.consentimientos.services import recuperar_pdf_compromiso_pago

        mocked_fetch.return_value = {"status": "COMPLETED", "secondaryId": "document_7"}
        mocked_descargar.return_value = b"%PDF-firmado-1"
        self.assertTrue(recuperar_pdf_compromiso_pago(self.consentimiento))
        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.pdf_archivo)

        # Sin "reemplazar" un PDF ya guardado se conserva.
        mocked_descargar.return_value = b"%PDF-otro"
        self.assertTrue(recuperar_pdf_compromiso_pago(self.consentimiento))
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.pdf_archivo.read(), b"%PDF-firmado-1")

        mocked_descargar.return_value = b"%PDF-firmado-2"
        self.assertTrue(recuperar_pdf_compromiso_pago(self.consentimiento, reemplazar=True))
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.pdf_archivo.read(), b"%PDF-firmado-2")

    @patch("apps.historia_clinica.services.descargar_pdf_documenso")
    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_verificar_reintenta_el_pdf_de_un_consentimiento_firmado_sin_pdf(self, mocked_fetch, mocked_descargar):
        from apps.consentimientos.services import verificar_firma_compromiso_pago_en_documenso

        mocked_fetch.side_effect = [
            {"status": "PENDING", "secondaryId": "document_7"},
            {"status": "COMPLETED", "secondaryId": "document_7"},
        ]
        mocked_descargar.return_value = b"%PDF-firmado"

        verificar_firma_compromiso_pago_en_documenso(self.consentimiento)
        self.consentimiento.refresh_from_db()
        self.assertFalse(self.consentimiento.pdf_archivo)

        verificar_firma_compromiso_pago_en_documenso(self.consentimiento)
        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.pdf_archivo)


@override_settings(DOCUMENSO_WEBHOOK_SECRET=WEBHOOK_SECRET)
class WebhookExternalIdAjenoTests(TestCase):
    """La instancia de Documenso es compartida: un sobre con un ``externalId`` que no es
    nuestro (ni prefijo conocido ni UUID) antes reventaba con ValueError en el filtro por id."""

    def _post(self, event, external_id="doc-creado-a-mano"):
        payload = {"event": event, "payload": {"externalId": external_id, "id": 99, "recipients": []}}
        return APIClient().post(
            "/webhooks/documenso/", data=json.dumps(payload), content_type="application/json",
            HTTP_X_DOCUMENSO_SECRET=WEBHOOK_SECRET,
        )

    def test_documento_completado_con_external_id_ajeno_no_falla(self):
        self.assertEqual(self._post("DOCUMENT_COMPLETED").status_code, 200)

    def test_firma_parcial_con_external_id_ajeno_no_falla(self):
        self.assertEqual(self._post("DOCUMENT_SIGNED").status_code, 200)
