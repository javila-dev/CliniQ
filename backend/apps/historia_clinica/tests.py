from datetime import timedelta
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.historia_clinica.models import (
    ConsentimientoInformado,
    HistoriaClinica,
    NotaClinica,
    OrdenMedica,
    PlantillaOrden,
    SignosVitales,
)
from apps.pacientes.models import Paciente


User = get_user_model()


class ConsentimientoCreateReuseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-consent@example.com",
            password="secret123",
            first_name="Root",
            last_name="Consent",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Demo", nit="900777888")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="5550001",
            nombres="Laura",
            apellidos="Diaz",
            fecha_nacimiento=timezone.localdate() - timedelta(days=25 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 9",
            telefono="3009998888",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.payload = {
            "paciente": str(self.paciente.id),
            "documenso_template_token": "template-limpieza-facial",
            "documenso_template_nombre": "Consentimiento Limpieza Facial",
        }

    def test_create_reuses_vigente_consentimiento(self):
        existente = ConsentimientoInformado.objects.create(
            paciente=self.paciente,
            clinica=self.clinica,
            tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token=self.payload["documenso_template_token"],
            documenso_template_nombre="Viejo nombre",
            firmado=True,
            fecha_firma=timezone.localdate(),
        )

        response = self.client.post(
            "/api/v1/historia-clinica/consentimientos/",
            self.payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        existente.refresh_from_db()
        self.assertEqual(response.json()["id"], str(existente.id))
        self.assertEqual(existente.documenso_template_nombre, self.payload["documenso_template_nombre"])
        self.assertEqual(ConsentimientoInformado.objects.count(), 1)

    def test_create_reuses_unsigned_draft_same_day(self):
        existente = ConsentimientoInformado.objects.create(
            paciente=self.paciente,
            clinica=self.clinica,
            tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token=self.payload["documenso_template_token"],
            documenso_template_nombre=self.payload["documenso_template_nombre"],
            firmado=False,
        )

        response = self.client.post(
            "/api/v1/historia-clinica/consentimientos/",
            self.payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(existente.id))
        self.assertEqual(ConsentimientoInformado.objects.count(), 1)

    def test_create_allows_new_record_when_previous_is_old_and_not_vigente(self):
        previo = ConsentimientoInformado.objects.create(
            paciente=self.paciente,
            clinica=self.clinica,
            tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token=self.payload["documenso_template_token"],
            documenso_template_nombre=self.payload["documenso_template_nombre"],
            firmado=True,
            fecha_firma=timezone.localdate() - timedelta(days=400),
            vigencia_meses=1,
        )

        response = self.client.post(
            "/api/v1/historia-clinica/consentimientos/",
            self.payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(ConsentimientoInformado.objects.count(), 2)
        self.assertNotEqual(response.json()["id"], str(previo.id))


class ConsentimientoIniciarFirmaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-firma@example.com",
            password="secret123",
            first_name="Root",
            last_name="Firma",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Firma", nit="900333222")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="987654321",
            nombres="Camila",
            apellidos="Rojas",
            fecha_nacimiento=timezone.localdate() - timedelta(days=28 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Carrera 10",
            telefono="3001234567",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente,
            clinica=self.clinica,
            tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token="template-public-token",
            documenso_template_nombre="Consentimiento Procedimiento",
        )

    def _mock_response(self, payload):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = payload
        return response

    @patch("apps.historia_clinica.services.requests.request")
    def test_iniciar_firma_crea_documento_y_guarda_token(self, mocked_request):
        mocked_request.side_effect = [
            self._mock_response(
                {
                    "data": [
                        {
                            "id": 321,
                            "title": "Consentimiento Procedimiento",
                            "directLink": {"token": "template-public-token"},
                            "recipients": [{"id": 44, "role": "SIGNER"}],
                        }
                    ],
                    "pagination": {"totalPages": 1},
                }
            ),
            self._mock_response(
                {
                    "id": "envelope_123",
                    "recipients": [
                        {
                            "id": 44,
                            "email": f"paciente-{self.paciente.id}@noreply.clinica",
                            "name": self.paciente.nombre_completo,
                            "token": "sign_tok_123",
                            "signingUrl": "https://documenso.test/sign/sign_tok_123",
                        }
                    ],
                }
            ),
        ]

        response = self.client.post(
            f"/api/v1/historia-clinica/consentimientos/{self.consentimiento.id}/iniciar_firma/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "signing_token": "sign_tok_123",
                "documenso_document_id": "envelope_123",
            },
        )

        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.documenso_document_id, "envelope_123")
        self.assertEqual(self.consentimiento.documenso_signing_token, "sign_tok_123")

        template_call = mocked_request.call_args_list[0]
        self.assertEqual(template_call.args[0], "GET")
        self.assertEqual(template_call.kwargs["params"], {"page": 1, "perPage": 100})

        create_call = mocked_request.call_args_list[1]
        self.assertEqual(create_call.args[0], "POST")
        self.assertEqual(
            create_call.kwargs["json"]["recipients"],
            [
                {
                    "id": 44,
                    "email": f"paciente-{self.paciente.id}@noreply.clinica",
                    "name": self.paciente.nombre_completo,
                }
            ],
        )
        self.assertEqual(create_call.kwargs["json"]["externalId"], str(self.consentimiento.id))

    @patch("apps.historia_clinica.services.requests.request")
    def test_iniciar_firma_reutiliza_signing_token_existente(self, mocked_request):
        self.consentimiento.documenso_document_id = "envelope_existente"
        self.consentimiento.documenso_signing_token = "sign_tok_existente"
        self.consentimiento.save(update_fields=["documenso_document_id", "documenso_signing_token", "updated_at"])

        response = self.client.post(
            f"/api/v1/historia-clinica/consentimientos/{self.consentimiento.id}/iniciar_firma/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "signing_token": "sign_tok_existente",
                "documenso_document_id": "envelope_existente",
            },
        )
        mocked_request.assert_not_called()

    @patch("apps.historia_clinica.services.requests.request")
    def test_iniciar_firma_recupera_token_si_documento_ya_existia(self, mocked_request):
        self.consentimiento.documenso_document_id = "envelope_existente"
        self.consentimiento.save(update_fields=["documenso_document_id", "updated_at"])

        mocked_request.return_value = self._mock_response(
            {
                "id": "envelope_existente",
                "recipients": [
                    {
                        "id": 99,
                        "email": f"paciente-{self.paciente.id}@noreply.clinica",
                        "name": self.paciente.nombre_completo,
                        "signingUrl": "https://documenso.test/sign/sign_tok_recuperado",
                    }
                ],
            }
        )

        response = self.client.post(
            f"/api/v1/historia-clinica/consentimientos/{self.consentimiento.id}/iniciar_firma/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["signing_token"], "sign_tok_recuperado")
        self.consentimiento.refresh_from_db()
        self.assertEqual(self.consentimiento.documenso_signing_token, "sign_tok_recuperado")


class OrdenMedicaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-orden@example.com",
            password="secret123",
            first_name="Root",
            last_name="Orden",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Ordenes", nit="900111222")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="444555666",
            nombres="Paola",
            apellidos="Nuñez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 12",
            telefono="3000001111",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.historia = HistoriaClinica.objects.get(paciente=self.paciente)

    def test_rechaza_plantilla_no_editable_si_contenido_cambia(self):
        plantilla = PlantillaOrden.objects.create(
            clinica=self.clinica,
            nombre="Orden base",
            contenido="Contenido fijo",
            permite_edicion_profesional=False,
        )

        response = self.client.post(
            "/api/v1/historia-clinica/ordenes-medicas/",
            {
                "historia": str(self.historia.id),
                "plantilla_origen": str(plantilla.id),
                "contenido": "Contenido alterado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PLANTILLA_NO_EDITABLE")
        self.assertEqual(OrdenMedica.objects.count(), 0)

    def test_registra_auditoria_cuando_plantilla_editable_se_modifica(self):
        plantilla = PlantillaOrden.objects.create(
            clinica=self.clinica,
            nombre="Orden flexible",
            contenido="Texto base",
            permite_edicion_profesional=True,
        )

        response = self.client.post(
            "/api/v1/historia-clinica/ordenes-medicas/",
            {
                "historia": str(self.historia.id),
                "plantilla_origen": str(plantilla.id),
                "contenido": "Texto base con cambios",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        orden = OrdenMedica.objects.get()
        self.assertTrue(orden.fue_editada)
        self.assertEqual(orden.contenido_original, "Texto base")
        self.assertEqual(orden.auditorias.count(), 1)

    @patch("apps.historia_clinica.views.enviar_documento_whatsapp_webhook")
    @patch("apps.historia_clinica.views.settings.WHATSAPP_OUTBOUND_WEBHOOK_URL", "https://n8n.test/webhook/whatsapp")
    def test_enviar_whatsapp_llama_webhook(self, mocked_send):
        plantilla = PlantillaOrden.objects.create(
            clinica=self.clinica,
            nombre="Orden envio",
            contenido="Reposo por 3 dias",
            permite_edicion_profesional=True,
        )
        orden = OrdenMedica.objects.create(
            historia=self.historia,
            plantilla_origen=plantilla,
            contenido="Reposo por 3 dias",
            contenido_original="Reposo por 3 dias",
            profesional=self.superadmin,
        )
        mocked_send.return_value = {}

        response = self.client.post(
            f"/api/v1/historia-clinica/ordenes-medicas/{orden.id}/enviar_whatsapp/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"enviado": True})
        mocked_send.assert_called_once()
        kwargs = mocked_send.call_args.kwargs
        self.assertEqual(kwargs["paciente"], self.paciente)
        self.assertEqual(kwargs["tipo_notificacion"], "envio_formula")
        self.assertEqual(kwargs["nombre_archivo_pdf"], f"orden-medica-{orden.id}.pdf")


class H87H89HistoriaClinicaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-h8@example.com",
            password="secret123",
            first_name="Root",
            last_name="Historia",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica H8", nit="900000999")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="10203040",
            nombres="Lucia",
            apellidos="Vargas",
            fecha_nacimiento=timezone.localdate() - timedelta(days=27 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 100",
            telefono="3005551111",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.historia = HistoriaClinica.objects.get(paciente=self.paciente)

    def test_signos_vitales_crea_imc_y_entrega_evolucion(self):
        response = self.client.post(
            "/api/v1/historia-clinica/signos-vitales/",
            {
                "historia": str(self.historia.id),
                "peso_kg": "62.50",
                "altura_cm": "165.00",
                "tension_sistolica": 120,
                "tension_diastolica": 70,
                "campos_adicionales": [{"nombre": "Grasa corporal", "valor": "22", "unidad": "%"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        signo = SignosVitales.objects.get()
        self.assertEqual(str(signo.imc), "22.96")
        self.assertEqual(response.json()["registrado_por"], str(self.superadmin.id))

        evolucion = self.client.get(f"/api/v1/historia-clinica/historias/{self.historia.id}/evolucion-signos/")

        self.assertEqual(evolucion.status_code, 200)
        self.assertEqual(evolucion.json()["campos"], ["peso_kg", "altura_cm", "imc", "tension_sistolica", "tension_diastolica"])
        self.assertEqual(len(evolucion.json()["series"]), 1)
        self.assertEqual(evolucion.json()["series"][0]["peso_kg"], 62.5)
        self.assertEqual(evolucion.json()["series"][0]["imc"], 22.96)

    def test_nota_clinica_flujo_borrador_autosave_completar(self):
        """H26: POST crea borrador → PATCH auto-guarda → POST completar finaliza."""
        payload = {"historia": str(self.historia.id)}

        # Crear borrador
        resp_crear = self.client.post("/api/v1/historia-clinica/notas/", payload, format="json")
        self.assertEqual(resp_crear.status_code, 201)
        nota_id = resp_crear.json()["id"]
        self.assertEqual(resp_crear.json()["estado"], "borrador")

        # Auto-save parcial (motivo_consulta)
        resp_patch = self.client.patch(
            f"/api/v1/historia-clinica/notas/{nota_id}/",
            {"motivo_consulta": "Paciente en control.", "plan_manejo": "Seguimiento mensual."},
            format="json",
        )
        self.assertEqual(resp_patch.status_code, 200)

        # Completar nota
        resp_completar = self.client.post(f"/api/v1/historia-clinica/notas/{nota_id}/completar/")
        self.assertEqual(resp_completar.status_code, 200)
        self.assertEqual(resp_completar.json()["estado"], "completada")

        # Intentar editar nota completada debe fallar
        resp_patch2 = self.client.patch(
            f"/api/v1/historia-clinica/notas/{nota_id}/",
            {"motivo_consulta": "Cambio no permitido."},
            format="json",
        )
        self.assertEqual(resp_patch2.status_code, 400)

        # Completar dos veces debe fallar
        resp_completar2 = self.client.post(f"/api/v1/historia-clinica/notas/{nota_id}/completar/")
        self.assertEqual(resp_completar2.status_code, 400)

        # HistoriaClinica.motivo_consulta/plan_manejo deben reflejar la última nota completada
        resp_historia = self.client.get(f"/api/v1/historia-clinica/historias/{self.historia.id}/")
        self.assertEqual(resp_historia.status_code, 200)
        self.assertEqual(resp_historia.json()["motivo_consulta"], "Paciente en control.")
        self.assertEqual(resp_historia.json()["plan_manejo"], "Seguimiento mensual.")
