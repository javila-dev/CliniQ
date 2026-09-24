"""Firma diferida del profesional: el paciente firma al aceptar la cotizacion y el
profesional que atiende la primera cita firma despues, en el mismo sobre de Documenso."""
import json
import tempfile
from datetime import timedelta
from unittest.mock import MagicMock, patch

from dateutil.relativedelta import relativedelta
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.configuracion.serializers import PlantillaCamposSerializer
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import verificar_firma_consentimiento_en_documenso
from apps.pacientes.models import Paciente

User = get_user_model()

WEBHOOK_SECRET = "test-webhook-secret"

CAMPO_PACIENTE = {"type": "SIGNATURE", "page": 1, "positionX": 10, "positionY": 60, "width": 35, "height": 8}
CAMPOS_PROFESIONAL = [
    {"firmante": "profesional", "rol": "firma", "page": 1, "positionX": 10, "positionY": 80, "width": 35, "height": 8},
    {"firmante": "profesional", "rol": "nombre", "page": 1, "positionX": 50, "positionY": 80, "width": 30, "height": 6},
    {"firmante": "profesional", "rol": "tp", "page": 1, "positionX": 50, "positionY": 88, "width": 30, "height": 6},
]


def _crear_paciente(clinica, documento="555111222"):
    return Paciente.objects.create(
        clinica=clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento=documento,
        nombres="Laura", apellidos="Firma", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
        sexo=Paciente.Sexo.FEMENINO, direccion="Calle 3", telefono="3000000011", email="laura@example.com",
        canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
    )


class PlantillaCamposValidacionTests(TestCase):
    def _validar(self, campos, **extra):
        ser = PlantillaCamposSerializer(data={"campos": campos, **extra})
        return ser.is_valid(), ser

    def test_exige_una_firma_del_paciente(self):
        valido, ser = self._validar(CAMPOS_PROFESIONAL)
        self.assertFalse(valido)
        self.assertIn("firma del paciente", str(ser.errors))

    def test_el_tipo_de_los_campos_del_profesional_lo_define_el_rol(self):
        campos = [dict(CAMPO_PACIENTE)] + [dict(c, type="CHECKBOX") for c in CAMPOS_PROFESIONAL]
        valido, ser = self._validar(campos)
        self.assertTrue(valido, ser.errors)
        tipos = {c["rol"]: c["type"] for c in ser.validated_data["campos"] if c["firmante"] == "profesional"}
        self.assertEqual(tipos, {"firma": "SIGNATURE", "nombre": "NAME", "tp": "TEXT"})

    def test_rechaza_roles_repetidos_o_desconocidos(self):
        repetido = [dict(CAMPO_PACIENTE), CAMPOS_PROFESIONAL[0], CAMPOS_PROFESIONAL[0]]
        self.assertFalse(self._validar(repetido)[0])
        desconocido = [dict(CAMPO_PACIENTE), {"firmante": "profesional", "rol": "fecha", "page": 1}]
        self.assertFalse(self._validar(desconocido)[0])

    def test_sin_firma_del_profesional_descarta_sus_campos(self):
        valido, ser = self._validar([dict(CAMPO_PACIENTE)] + CAMPOS_PROFESIONAL, requiere_firma_profesional=False)
        self.assertTrue(valido, ser.errors)
        self.assertEqual([c["firmante"] for c in ser.validated_data["campos"]], ["paciente"])

    def test_campos_sin_firmante_son_del_paciente(self):
        valido, ser = self._validar([dict(CAMPO_PACIENTE)])
        self.assertTrue(valido)
        self.assertEqual(ser.validated_data["campos"][0]["firmante"], "paciente")


class PlantillaUsaFirmaProfesionalTests(TestCase):
    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Plantilla", nit="901000111")

    def test_basta_la_firma_del_profesional_nombre_y_tp_son_opcionales(self):
        plantilla = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Toxina", campos=[CAMPO_PACIENTE] + CAMPOS_PROFESIONAL[1:2],
        )
        self.assertFalse(plantilla.usa_firma_profesional)  # nombre sin firma no basta
        plantilla.campos = [CAMPO_PACIENTE] + CAMPOS_PROFESIONAL[:1]
        self.assertTrue(plantilla.usa_firma_profesional)
        self.assertFalse(plantilla.pide_tp_profesional)
        self.assertFalse(plantilla.pide_tp_profesional)
        plantilla.campos = [CAMPO_PACIENTE] + CAMPOS_PROFESIONAL
        self.assertTrue(plantilla.pide_tp_profesional)
        plantilla.requiere_firma_profesional = False
        self.assertFalse(plantilla.usa_firma_profesional)


@override_settings(
    DOCUMENSO_API_URL="https://documenso.test",
    DOCUMENSO_API_KEY="k",
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class CrearSobreConProfesionalTests(TestCase):
    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Sobre", nit="901000222")
        self.paciente = _crear_paciente(self.clinica)
        self.plantilla = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Rellenos", campos=[CAMPO_PACIENTE] + CAMPOS_PROFESIONAL,
        )
        self.plantilla.pdf_file.save("plantilla.pdf", ContentFile(b"%PDF-plantilla"), save=True)
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="otros",
            documenso_template_token=str(self.plantilla.id), plantilla=self.plantilla,
        )
        self.fetch_calls = []

    def _fake_fetch(self, method, path, *, json_payload=None, params=None):
        self.fetch_calls.append((method, path, json_payload))
        recipients = [
            {"id": 11, "email": "laura@example.com", "signingOrder": 1, "token": "tok-paciente"},
            {"id": 12, "email": f"profesional+{self.consentimiento.id}@noreply.clinica", "signingOrder": 2, "token": "tok-prof"},
        ]
        if method == "GET":
            return {"id": "envelope_1", "envelopeItems": [{"id": "item_1"}], "recipients": recipients}
        return {}

    def _crear(self):
        from apps.historia_clinica.services import iniciar_firma_consentimiento

        create_resp = MagicMock(ok=True, status_code=200, text="{}")
        create_resp.json.return_value = {"id": "envelope_1"}
        with patch("apps.historia_clinica.documenso_firmantes.requests.post", return_value=create_resp) as post, \
                patch("apps.historia_clinica.documenso_firmantes._fetch_documenso_json", side_effect=self._fake_fetch):
            resultado = iniciar_firma_consentimiento(self.consentimiento)
        return resultado, json.loads(post.call_args.kwargs["data"]["payload"])

    def test_sobre_secuencial_con_paciente_y_profesional_provisional(self):
        (token, envelope_id), payload = self._crear()

        self.assertEqual((token, envelope_id), ("tok-paciente", "envelope_1"))
        self.assertEqual(payload["meta"]["signingOrder"], "SEQUENTIAL")
        self.assertEqual(payload["meta"]["distributionMethod"], "NONE")
        self.assertEqual([r["signingOrder"] for r in payload["recipients"]], [1, 2])
        self.assertEqual(payload["recipients"][1]["name"], "Profesional tratante")

        campos = next(p for m, path, p in self.fetch_calls if path.endswith("field/create-many"))["data"]
        por_destinatario = {(c["recipientId"], c["type"]) for c in campos}
        self.assertEqual(por_destinatario, {(11, "SIGNATURE"), (12, "SIGNATURE"), (12, "NAME"), (12, "TEXT")})

        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.requiere_firma_profesional)
        self.assertTrue(self.consentimiento.requiere_tp_profesional)
        self.assertEqual(self.consentimiento.documenso_recipient_paciente_id, "11")
        self.assertEqual(self.consentimiento.documenso_recipient_profesional_id, "12")
        self.assertEqual(self.consentimiento.documenso_signing_token, "tok-paciente")

    def test_plantilla_sin_firma_del_profesional_solo_lleva_al_paciente(self):
        self.plantilla.requiere_firma_profesional = False
        self.plantilla.save()

        _, payload = self._crear()

        self.assertEqual(len(payload["recipients"]), 1)
        campos = next(p for m, path, p in self.fetch_calls if path.endswith("field/create-many"))["data"]
        self.assertEqual([c["recipientId"] for c in campos], [11])
        self.consentimiento.refresh_from_db()
        self.assertFalse(self.consentimiento.requiere_firma_profesional)
        self.assertEqual(self.consentimiento.documenso_recipient_profesional_id, "")


@override_settings(DOCUMENSO_API_URL="https://documenso.test", DOCUMENSO_API_KEY="k")
class VigenciaYVerificacionTests(TestCase):
    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Vigencia", nit="901000333")
        self.paciente = _crear_paciente(self.clinica)
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="otros", documenso_template_token="tpl",
            documenso_document_id="envelope_1", requiere_firma_profesional=True,
            documenso_recipient_paciente_id="11", documenso_recipient_profesional_id="12",
            vigencia_meses=12,
        )

    def test_no_vence_mientras_falta_el_profesional_y_luego_cuenta_desde_su_firma(self):
        hace_un_anio = timezone.localdate() - timedelta(days=400)
        self.consentimiento.firmado = True
        self.consentimiento.fecha_firma = hace_un_anio
        self.consentimiento.save()
        self.assertIsNone(self.consentimiento.fecha_vencimiento)
        self.assertTrue(self.consentimiento.pendiente_firma_profesional)

        firma_profesional = timezone.now()
        self.consentimiento.fecha_firma_profesional = firma_profesional
        self.consentimiento.save(update_fields=["fecha_firma_profesional", "updated_at"])
        self.consentimiento.refresh_from_db()
        self.assertEqual(
            self.consentimiento.fecha_vencimiento,
            timezone.localdate(firma_profesional) + relativedelta(months=12),
        )
        self.assertTrue(self.consentimiento.completo)

    def test_sin_firma_del_profesional_la_vigencia_sigue_contando_desde_el_paciente(self):
        self.consentimiento.requiere_firma_profesional = False
        self.consentimiento.firmado = True
        self.consentimiento.fecha_firma = timezone.localdate()
        self.consentimiento.save()
        self.assertEqual(self.consentimiento.fecha_vencimiento, timezone.localdate() + relativedelta(months=12))

    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_verificar_marca_firmado_cuando_firmo_el_paciente_aunque_el_sobre_siga_pendiente(self, mocked_fetch):
        mocked_fetch.return_value = {
            "status": "PENDING",
            "recipients": [
                {"id": 11, "role": "SIGNER", "signingStatus": "SIGNED"},
                {"id": 12, "role": "SIGNER", "signingStatus": "NOT_SIGNED"},
            ],
        }
        self.assertTrue(verificar_firma_consentimiento_en_documenso(self.consentimiento))
        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.firmado)
        self.assertTrue(self.consentimiento.pendiente_firma_profesional)

    @patch("apps.historia_clinica.services._fetch_documenso_json")
    def test_verificar_no_marca_si_el_paciente_no_ha_firmado(self, mocked_fetch):
        mocked_fetch.return_value = {
            "status": "PENDING",
            "recipients": [{"id": 11, "role": "SIGNER", "signingStatus": "NOT_SIGNED"}],
        }
        self.assertFalse(verificar_firma_consentimiento_en_documenso(self.consentimiento))


@override_settings(
    DOCUMENSO_WEBHOOK_SECRET=WEBHOOK_SECRET,
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class WebhookFirmaProfesionalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Webhook FP", nit="901000444")
        self.paciente = _crear_paciente(self.clinica)
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="otros", documenso_template_token="tpl",
            documenso_document_id="envelope_1", documenso_signing_token="tok-paciente",
            requiere_firma_profesional=True,
            documenso_recipient_paciente_id="11", documenso_recipient_profesional_id="12",
        )

    def _post(self, event, recipients, document_id=514):
        body = {"event": event, "payload": {"id": document_id, "recipients": recipients}}
        return self.client.post(
            "/webhooks/documenso/", data=json.dumps(body), content_type="application/json",
            HTTP_X_DOCUMENSO_SECRET=WEBHOOK_SECRET,
        )

    def test_document_signed_por_el_paciente_lo_marca_firmado(self):
        response = self._post("DOCUMENT_SIGNED", [
            {"id": 11, "token": "tok-paciente", "signingStatus": "SIGNED"},
            {"id": 12, "token": "tok-prof", "signingStatus": "NOT_SIGNED"},
        ])
        self.assertEqual(response.status_code, 200)
        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.firmado)
        self.assertIsNone(self.consentimiento.fecha_firma_profesional)

    def test_document_signed_sin_firma_del_paciente_no_cambia_nada(self):
        self._post("DOCUMENT_SIGNED", [
            {"id": 11, "token": "tok-paciente", "signingStatus": "NOT_SIGNED"},
        ])
        self.consentimiento.refresh_from_db()
        self.assertFalse(self.consentimiento.firmado)

    @patch("apps.historia_clinica.webhooks.descargar_pdf_documenso", return_value=None)
    def test_document_completed_registra_la_firma_del_profesional_si_faltaba(self, _mocked):
        self._post("DOCUMENT_COMPLETED", [
            {"id": 11, "token": "tok-paciente", "signingStatus": "SIGNED"},
            {"id": 12, "token": "tok-prof", "signingStatus": "SIGNED"},
        ])
        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.firmado)
        self.assertIsNotNone(self.consentimiento.fecha_firma_profesional)
        self.assertIsNotNone(self.consentimiento.fecha_vencimiento)


@override_settings(DOCUMENSO_API_URL="https://documenso.test", DOCUMENSO_API_KEY="k")
class IdsDocumensoTests(TestCase):
    """El embed y el webhook envían el id numérico del documento; la firma del profesional y las
    consultas v2 necesitan el id ``envelope_...``."""

    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Ids", nit="901000555")
        self.paciente = _crear_paciente(self.clinica)
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="otros", documenso_template_token="tpl",
            documenso_document_id="envelope_abc", requiere_firma_profesional=True,
            documenso_recipient_paciente_id="11", documenso_recipient_profesional_id="12",
        )
        self.user = User.objects.create_user(
            email="ids@example.com", password="x", rol=User.Role.ADMIN, clinica=self.clinica,
        )

    def test_completar_firma_desde_el_embed_conserva_el_id_del_sobre(self):
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.patch(
            f"/api/v1/historia-clinica/consentimientos/{self.consentimiento.id}/completar_firma/",
            {"documenso_document_id": "514"}, format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.consentimiento.refresh_from_db()
        self.assertTrue(self.consentimiento.firmado)
        self.assertEqual(self.consentimiento.documenso_document_id, "envelope_abc")

    def test_ids_numericos_de_documentos_antiguos_si_se_guardan(self):
        from apps.historia_clinica.services import marcar_consentimiento_firmado

        self.consentimiento.documenso_document_id = ""
        self.consentimiento.save()
        marcar_consentimiento_firmado(self.consentimiento, documenso_document_id="77")
        self.assertEqual(self.consentimiento.documenso_document_id, "77")

    @patch("apps.historia_clinica.services.requests.get")
    @patch("apps.historia_clinica.services._fetch_documenso_json", return_value={"secondaryId": "document_514"})
    def test_la_consulta_de_sellado_traduce_el_id_del_sobre(self, _fetch, mocked_get):
        from apps.historia_clinica.services import documento_documenso_sellado

        mocked_get.return_value = MagicMock(ok=True, json=MagicMock(return_value={"status": "COMPLETED"}))

        self.assertTrue(documento_documenso_sellado("envelope_abc"))
        self.assertTrue(mocked_get.call_args.args[0].endswith("/api/v1/documents/514"))

    @patch("apps.historia_clinica.documenso_firmantes._fetch_documenso_json", return_value={"envelopeId": "envelope_abc"})
    def test_la_firma_del_profesional_acepta_un_id_numerico(self, _fetch):
        from apps.historia_clinica.documenso_firmantes import resolver_envelope_id

        self.assertEqual(resolver_envelope_id("514"), "envelope_abc")
        self.assertEqual(resolver_envelope_id("envelope_xyz"), "envelope_xyz")
