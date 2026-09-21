"""Ningun PDF se guarda como firmado mientras Documenso no haya sellado el documento:
antes de eso la descarga devuelve el original SIN firma."""
import tempfile
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.agenda.serializers import _archivo_url
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.consentimientos.services import (
    recuperar_pdf_asistencia,
    verificar_firma_asistencia_en_documenso,
)
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import (
    descargar_pdf_documenso_sellado,
    documento_documenso_sellado,
    refrescar_pdf_consentimiento_informado,
)
from apps.pacientes.models import Paciente

User = get_user_model()


def _respuesta(status):
    resp = MagicMock()
    resp.ok = True
    resp.json.return_value = {"status": status}
    resp.raise_for_status.return_value = None
    return resp


@override_settings(
    DOCUMENSO_API_URL="https://documenso.test",
    DOCUMENSO_API_KEY="k",
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class DescargaSoloSiEstaSelladoTests(TestCase):
    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Sello", nit="901777111")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="777111222",
            nombres="Ana", apellidos="Sello", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 9", telefono="3000000009",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.profesional = User.objects.create_user(
            email="prof-sello@example.com", password="secret123", first_name="P", last_name="S",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.informado = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="otros", documenso_template_token="tpl",
            firmado=True, fecha_firma=timezone.localdate(), documenso_document_id="55",
        )

    # ── helper compartido ───────────────────────────────────────────────
    @patch("apps.historia_clinica.services.requests.get")
    def test_documento_sellado_solo_con_estado_completed(self, mocked_get):
        mocked_get.return_value = _respuesta("PENDING")
        self.assertFalse(documento_documenso_sellado("55"))
        mocked_get.return_value = _respuesta("COMPLETED")
        self.assertTrue(documento_documenso_sellado("55"))

    @patch("apps.historia_clinica.services.requests.get")
    def test_error_al_consultar_el_estado_cuenta_como_no_sellado(self, mocked_get):
        mocked_get.side_effect = RuntimeError("boom")
        self.assertFalse(documento_documenso_sellado("55"))

    @patch("apps.historia_clinica.services.descargar_pdf_documenso")
    @patch("apps.historia_clinica.services.documento_documenso_sellado")
    def test_no_descarga_si_no_esta_sellado(self, mocked_sellado, mocked_descargar):
        mocked_sellado.return_value = False
        self.assertIsNone(descargar_pdf_documenso_sellado("55"))
        mocked_descargar.assert_not_called()

        mocked_sellado.return_value = True
        mocked_descargar.return_value = b"%PDF-firmado"
        self.assertEqual(descargar_pdf_documenso_sellado("55"), b"%PDF-firmado")

    # ── consentimientos informados ──────────────────────────────────────
    @patch("apps.agenda.serializers.descargar_pdf_documenso_sellado")
    def test_archivo_url_no_guarda_pdf_sin_sellar(self, mocked_descargar):
        mocked_descargar.return_value = None
        _archivo_url(self.informado)
        self.informado.refresh_from_db()
        self.assertFalse(self.informado.archivo)

    @patch("apps.historia_clinica.services.descargar_pdf_documenso_sellado")
    def test_refrescar_reemplaza_solo_si_el_pdf_cambio(self, mocked_descargar):
        mocked_descargar.return_value = b"%PDF-sin-firma"
        self.assertEqual(refrescar_pdf_consentimiento_informado(self.informado), "actualizado")

        mocked_descargar.return_value = b"%PDF-sin-firma"
        self.assertEqual(refrescar_pdf_consentimiento_informado(self.informado), "sin_cambios")

        mocked_descargar.return_value = b"%PDF-firmado"
        self.assertEqual(refrescar_pdf_consentimiento_informado(self.informado), "actualizado")
        self.informado.refresh_from_db()
        self.assertEqual(self.informado.archivo.read(), b"%PDF-firmado")

        mocked_descargar.return_value = None
        self.assertEqual(refrescar_pdf_consentimiento_informado(self.informado), "no_disponible")

    @patch("apps.historia_clinica.views.descargar_pdf_documenso_sellado")
    def test_reintentar_pdf_avisa_si_aun_no_esta_sellado(self, mocked_descargar):
        superadmin = User.objects.create_user(
            email="root-sello@example.com", password="secret123", first_name="R", last_name="S",
            rol=User.Role.SUPERADMIN,
        )
        client = APIClient()
        client.force_authenticate(superadmin)
        url = f"/api/v1/historia-clinica/consentimientos/{self.informado.id}/reintentar_pdf/"

        mocked_descargar.return_value = None
        respuesta = client.post(url)
        self.assertEqual(respuesta.status_code, 502)
        self.assertIn("aún no está disponible", respuesta.json()["error"])
        self.informado.refresh_from_db()
        self.assertFalse(self.informado.archivo)

        mocked_descargar.return_value = b"%PDF-firmado"
        self.assertEqual(client.post(url).status_code, 200)
        self.informado.refresh_from_db()
        self.assertTrue(self.informado.archivo)

    # ── registro de asistencia ──────────────────────────────────────────
    def _cita_firmada(self):
        servicio = Servicio.objects.create(
            clinica=self.clinica, nombre="Limpieza", duracion_min=30, precio="100000.00",
        )
        inicio = timezone.now() + timedelta(days=2)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=servicio, profesional=self.profesional,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            firma_asistencia_estado="firmada", firma_asistencia_documento_id="envelope-asist-1",
        )

    @patch("apps.historia_clinica.services.descargar_pdf_documenso")
    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_asistencia_no_guarda_pdf_sin_sellar_y_lo_reintenta_al_verificar(self, mocked_fetch, mocked_descargar):
        cita = self._cita_firmada()
        mocked_descargar.return_value = b"%PDF-asistencia-firmada"

        mocked_fetch.return_value = {"status": "PENDING", "secondaryId": "document_9"}
        self.assertFalse(recuperar_pdf_asistencia(cita))
        mocked_descargar.assert_not_called()
        cita.refresh_from_db()
        self.assertFalse(cita.firma_asistencia_archivo)

        # "Comprobar en Documenso" sobre una cita ya firmada sin PDF reintenta y guarda cuando ya esta sellado.
        mocked_fetch.return_value = {"status": "COMPLETED", "secondaryId": "document_9"}
        verificar_firma_asistencia_en_documenso(cita)
        cita.refresh_from_db()
        self.assertTrue(cita.firma_asistencia_archivo)
        self.assertEqual(cita.firma_asistencia_archivo.read(), b"%PDF-asistencia-firmada")


@override_settings(
    DOCUMENSO_API_URL="https://documenso.test",
    DOCUMENSO_API_KEY="k",
    DOCUMENSO_WEBHOOK_SECRET="secreto-verificar",
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class FirmaPorLinkTests(TestCase):
    """El paciente firma desde el link de WhatsApp: el envelope de la plantilla PDF se crea por
    multipart y Documenso ignora el externalId, asi que el webhook llega sin el. El estado tiene
    que actualizarse igual (por token de firma o consultando a Documenso)."""

    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Link", nit="901888111")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="888111222",
            nombres="Eva", apellidos="Link", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 7", telefono="3000000007",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.informado = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="otros", documenso_template_token="tpl-link",
            documenso_document_id="envelope-link-1", documenso_signing_token="token-firmante-1",
        )

    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_verificar_marca_firmado_solo_cuando_documenso_dice_que_firmo(self, mocked_fetch):
        from apps.historia_clinica.services import verificar_firma_consentimiento_en_documenso

        mocked_fetch.return_value = {"status": "PENDING", "recipients": [{"role": "SIGNER", "signingStatus": "NOT_SIGNED"}]}
        self.assertFalse(verificar_firma_consentimiento_en_documenso(self.informado))
        self.informado.refresh_from_db()
        self.assertFalse(self.informado.firmado)

        mocked_fetch.return_value = {"status": "COMPLETED", "recipients": [{"role": "SIGNER", "signingStatus": "SIGNED"}]}
        self.assertTrue(verificar_firma_consentimiento_en_documenso(self.informado))
        self.informado.refresh_from_db()
        self.assertTrue(self.informado.firmado)
        self.assertEqual(self.informado.fecha_firma, timezone.localdate())

    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_endpoint_verificar_firma_devuelve_el_consentimiento_actualizado(self, mocked_fetch):
        superadmin = User.objects.create_user(
            email="root-link@example.com", password="secret123", first_name="R", last_name="L",
            rol=User.Role.SUPERADMIN,
        )
        client = APIClient()
        client.force_authenticate(superadmin)
        mocked_fetch.return_value = {"status": "COMPLETED", "recipients": [{"role": "SIGNER", "signingStatus": "SIGNED"}]}

        respuesta = client.post(f"/api/v1/historia-clinica/consentimientos/{self.informado.id}/verificar_firma/")

        self.assertEqual(respuesta.status_code, 200)
        self.assertTrue(respuesta.json()["firmado"])

    @patch("apps.historia_clinica.webhooks.descargar_pdf_documenso")
    def test_webhook_sin_external_id_resuelve_el_consentimiento_por_token_de_firma(self, mocked_descargar):
        import json

        mocked_descargar.return_value = None
        payload = {
            "event": "DOCUMENT_COMPLETED",
            "payload": {"id": 321, "recipients": [{"token": "token-firmante-1"}]},
        }

        respuesta = APIClient().post(
            "/webhooks/documenso/", data=json.dumps(payload), content_type="application/json",
            HTTP_X_DOCUMENSO_SECRET="secreto-verificar",
        )

        self.assertEqual(respuesta.status_code, 200)
        self.informado.refresh_from_db()
        self.assertTrue(self.informado.firmado)
