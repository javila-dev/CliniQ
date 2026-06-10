from datetime import timedelta
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Servicio, ServicioConsentimiento, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.pacientes.models import Paciente
from apps.protocolos.models import ConsentimientoPaciente, SesionProcedimiento, TratamientoPaciente
from apps.protocolos.serializers import SesionProcedimientoSerializer


User = get_user_model()


class ProtocolosFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-protocolos@example.com",
            password="Secret123!",
            first_name="Root",
            last_name="Protocolos",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Protocolos", nit="905000111")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="123456789",
            nombres="Maria",
            apellidos="Lopez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 1",
            telefono="3000000000",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.procedimiento = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Tensamax",
            descripcion="Sesion corporal",
            duracion_min=60,
            precio="200000.00",
        )
        self.template = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica,
            tipo="otros",
            template_token="consentimiento-tensamax",
        )
        ServicioConsentimiento.objects.create(servicio=self.procedimiento, template=self.template, orden=1)
        self.tratamiento_catalogo = TratamientoCatalogo.objects.create(
            clinica=self.clinica,
            nombre="Plan Tensamax",
            descripcion="Plan",
            precio_estimado="400000.00",
        )
        self.tipo_sesion = TipoSesion.objects.create(
            tratamiento=self.tratamiento_catalogo,
            nombre="Sesion Tensamax",
            cantidad=2,
            orden=1,
            es_compromiso=True,
        )
        TipoSesionProcedimiento.objects.create(
            tipo_sesion=self.tipo_sesion,
            procedimiento=self.procedimiento,
            orden=1,
        )

    def test_crear_tratamiento_paciente_generates_sessions_by_tipo(self):
        response = self.client.post(
            "/api/v1/protocolos/tratamientos/",
            {
                "paciente": str(self.paciente.id),
                "tratamiento_catalogo": str(self.tratamiento_catalogo.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        tratamiento = TratamientoPaciente.objects.get()
        self.assertEqual(tratamiento.tratamiento_catalogo_id, self.tratamiento_catalogo.id)
        self.assertEqual(tratamiento.sesiones.count(), 2)
        self.assertEqual(sorted(tratamiento.sesiones.values_list("numero", flat=True)), [1, 2])

        detail = self.client.get(f"/api/v1/protocolos/tratamientos/{tratamiento.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["total_sesiones"], 2)
        self.assertEqual(len(detail.json()["grupos"]), 1)
        self.assertEqual(detail.json()["grupos"][0]["tipo_sesion_nombre"], "Sesion Tensamax")

    def test_sesion_consentimientos_blocks_completion_when_missing(self):
        tratamiento = TratamientoPaciente.objects.create(
            paciente=self.paciente,
            servicio=self.procedimiento,
            tratamiento_catalogo=self.tratamiento_catalogo,
        )
        sesion = SesionProcedimiento.objects.create(
            tratamiento=tratamiento,
            tipo_sesion=self.tipo_sesion,
            numero=1,
            procedimiento=self.procedimiento,
        )

        consentimientos = self.client.get(f"/api/v1/protocolos/sesiones/{sesion.id}/consentimientos/")
        self.assertEqual(consentimientos.status_code, 200)
        self.assertFalse(consentimientos.json()["puede_ejecutar"])
        self.assertEqual(consentimientos.json()["consentimientos"][0]["estado"], "faltante")

        complete = self.client.post(f"/api/v1/protocolos/sesiones/{sesion.id}/marcar_completada/", {}, format="json")
        self.assertEqual(complete.status_code, 400)
        self.assertEqual(complete.json()["code"], "CONSENTIMIENTOS_FALTANTES")

    def test_completar_sesion_guarda_snapshot_de_consentimiento(self):
        tratamiento = TratamientoPaciente.objects.create(
            paciente=self.paciente,
            servicio=self.procedimiento,
            tratamiento_catalogo=self.tratamiento_catalogo,
        )
        sesion = SesionProcedimiento.objects.create(
            tratamiento=tratamiento,
            tipo_sesion=self.tipo_sesion,
            numero=1,
            procedimiento=self.procedimiento,
        )
        consentimiento = ConsentimientoPaciente.objects.create(
            paciente=self.paciente,
            template_token="consentimiento-tensamax",
            template_nombre="Otros procedimientos",
            procedimiento=self.procedimiento,
            fecha_firma=timezone.localdate(),
            vigencia_hasta=timezone.localdate() + timedelta(days=365),
            metodo=ConsentimientoPaciente.Metodo.PRESENCIAL_CONFIRMADO,
            registrado_por=self.superadmin,
        )

        complete = self.client.post(
            f"/api/v1/protocolos/sesiones/{sesion.id}/marcar_completada/",
            {"procedimientos_ejecutados": [str(self.procedimiento.id)]},
            format="json",
        )

        self.assertEqual(complete.status_code, 200)
        sesion.refresh_from_db()
        self.assertEqual(sesion.estado, SesionProcedimiento.Estado.COMPLETADO)
        self.assertTrue(sesion.consentimientos_verificados.filter(id=consentimiento.id).exists())

    @override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
    @patch("apps.protocolos.serializers.get_signed_url")
    def test_checkin_foto_guarda_path_y_serializa_url_firmada_fresca(self, mocked_get_signed_url):
        mocked_get_signed_url.side_effect = [
            "http://minio.test/clinica-media/checkin.jpg?X-Amz-Expires=3600",
            "http://minio.test/clinica-media/checkin.jpg?X-Amz-Expires=7200",
        ]
        tratamiento = TratamientoPaciente.objects.create(
            paciente=self.paciente,
            servicio=self.procedimiento,
            tratamiento_catalogo=self.tratamiento_catalogo,
        )
        sesion = SesionProcedimiento.objects.create(
            tratamiento=tratamiento,
            tipo_sesion=self.tipo_sesion,
            numero=1,
            procedimiento=self.procedimiento,
            foto_presencia=SimpleUploadedFile("checkin.jpg", b"fake-jpg-content", content_type="image/jpeg"),
        )

        sesion.refresh_from_db()
        self.assertTrue(sesion.foto_presencia_url.endswith(".jpg"))
        self.assertNotIn("X-Amz-", sesion.foto_presencia_url)

        first = SesionProcedimientoSerializer(sesion).data["foto_presencia_url"]
        second = SesionProcedimientoSerializer(sesion).data["foto_presencia_url"]

        self.assertNotEqual(first, second)
        self.assertIn("X-Amz-", first)
        self.assertIn("X-Amz-", second)
