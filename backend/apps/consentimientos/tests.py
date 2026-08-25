from datetime import timedelta
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Sede
from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente

User = get_user_model()


class ConsentimientoIniciarFirmaCompromisoPagoTests(TestCase):
    """
    Cubre la logica de la app con mas responsabilidad legal del sistema
    (firma electronica de compromiso de pago), sin tests hasta ahora: que no
    se puedan crear dos sobres de firma para el mismo consentimiento.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-consentimientos@example.com",
            password="secret123",
            first_name="Root",
            last_name="Consentimientos",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Consentimientos", nit="901777888")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="333444555",
            nombres="Valentina",
            apellidos="Cruz",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 5",
            telefono="3000000001",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        self.plantilla = PlantillaConsentimiento.objects.create(
            clinica=self.clinica,
            ambito=PlantillaConsentimiento.Ambito.COTIZACION,
            nombre="Compromiso de pago",
            contenido_html="<p>Texto del compromiso</p>",
        )
        self.consentimiento = Consentimiento.objects.create(
            cotizacion=self.cotizacion,
            paciente=self.paciente,
            plantilla=self.plantilla,
            contenido_snapshot="<p>Texto del compromiso</p>",
            hash_contenido="a" * 64,
        )

    def _mock_response(self, payload):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = payload
        return response

    def _iniciar_firma(self):
        return self.client.post(
            f"/api/v1/consentimientos/{self.consentimiento.id}/iniciar_firma_documenso/", {}, format="json"
        )

    @patch("apps.agenda.pdf_coords.extraer_coordenadas_firma")
    @patch("apps.consentimientos.services.generar_pdf_para_firma_documenso")
    @patch("apps.consentimientos.services._crear_envelope_documenso")
    @patch("apps.historia_clinica.services.requests.request")
    def test_llamar_dos_veces_no_crea_dos_sobres_de_firma(
        self, mocked_request, mocked_crear_envelope, mocked_generar_pdf, mocked_coords
    ):
        mocked_generar_pdf.return_value = b"%PDF-fake"
        mocked_coords.return_value = {"pageNumber": 1, "pageX": 10, "pageY": 10, "pageWidth": 50, "pageHeight": 20}
        mocked_crear_envelope.return_value = "envelope-abc"
        mocked_request.return_value = self._mock_response(
            {
                "recipients": [
                    {
                        "id": 1,
                        "email": f"paciente-{self.paciente.id}@noreply.clinica",
                        "name": self.paciente.nombre_completo,
                        "token": "tok-abc",
                        "signingUrl": "https://documenso.test/sign/tok-abc",
                    }
                ]
            }
        )

        primero = self._iniciar_firma()
        self.assertEqual(primero.status_code, 200)
        self.assertEqual(mocked_crear_envelope.call_count, 1)

        # Segunda llamada: aunque el frontend la dispare dos veces (doble
        # clic, doble render), no debe crear un segundo sobre en Documenso.
        segundo = self._iniciar_firma()
        self.assertEqual(segundo.status_code, 200)
        self.assertEqual(mocked_crear_envelope.call_count, 1)
        self.assertEqual(primero.json()["document_id"], segundo.json()["document_id"])
        self.assertEqual(primero.json()["signing_token"], segundo.json()["signing_token"])

    @patch("apps.historia_clinica.services.requests.request")
    def test_si_ya_tiene_sobre_y_token_no_llama_a_documenso(self, mocked_request):
        self.consentimiento.documenso_documento_id = "envelope-existente"
        self.consentimiento.documenso_signing_token = "tok-existente"
        self.consentimiento.save(update_fields=["documenso_documento_id", "documenso_signing_token", "updated_at"])

        response = self._iniciar_firma()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"signing_token": "tok-existente", "document_id": "envelope-existente"})
        mocked_request.assert_not_called()


class ConsentimientoInmutableTrasFirmaTests(TestCase):
    """El hash de contenido protege que un consentimiento firmado no se pueda alterar despues."""

    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Hash", nit="901777999")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="333444666",
            nombres="Laura",
            apellidos="Diaz",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 6",
            telefono="3000000002",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )
        self.superadmin = User.objects.create_user(
            email="root-hash@example.com", password="secret123", first_name="R", last_name="H", rol=User.Role.SUPERADMIN
        )
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.superadmin, sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        self.plantilla = PlantillaConsentimiento.objects.create(
            clinica=self.clinica, ambito=PlantillaConsentimiento.Ambito.COTIZACION,
            nombre="Compromiso", contenido_html="<p>Original</p>",
        )
        self.consentimiento = Consentimiento.objects.create(
            cotizacion=self.cotizacion, paciente=self.paciente, plantilla=self.plantilla,
            contenido_snapshot="<p>Original</p>", hash_contenido="a" * 64,
            estado=Consentimiento.Estado.FIRMADO, firmado_en=timezone.now(),
        )

    def test_no_se_puede_modificar_el_contenido_de_un_consentimiento_firmado(self):
        self.consentimiento.contenido_snapshot = "<p>Alterado</p>"
        with self.assertRaises(ValueError):
            self.consentimiento.save()

    def test_si_se_puede_modificar_un_campo_no_protegido(self):
        self.consentimiento.firma_ip = "10.0.0.1"
        self.consentimiento.save()
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.firma_ip, "10.0.0.1")
