from datetime import timedelta
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.serializers import build_consentimiento_info
from apps.clinicas.models import (
    Clinica,
    DiagramaCorporal,
    GrupoZonas,
    GrupoZonasDiagrama,
    Sede,
    Servicio,
    ServicioConsentimiento,
    ServicioGrupoZonas,
    TipoSesion,
    TipoSesionProcedimiento,
    TratamientoCatalogo,
)
from apps.agenda.models import Cita
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.historia_clinica.models import HistoriaClinica, NotaClinica
from apps.pacientes.models import Paciente
from apps.protocolos.models import ConsentimientoPaciente, SesionProcedimiento, TratamientoPaciente
from apps.protocolos.serializers import SesionProcedimientoSerializer
from apps.protocolos.services import contexto_sesion_para_cita


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

    def test_recepcion_no_puede_marcar_sesion_completada(self):
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
        recepcion = User.objects.create_user(
            email="recepcion-protocolos@example.com",
            password="Secret123!",
            first_name="Recepcion",
            last_name="Protocolos",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)

        complete = self.client.post(f"/api/v1/protocolos/sesiones/{sesion.id}/marcar_completada/", {}, format="json")
        self.assertEqual(complete.status_code, 403)

        inasistencia = self.client.post(f"/api/v1/protocolos/sesiones/{sesion.id}/marcar_inasistencia/", {}, format="json")
        self.assertEqual(inasistencia.status_code, 403)

    def test_marcar_completada_no_permite_cita_ni_profesional_de_otra_clinica(self):
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
        ConsentimientoPaciente.objects.create(
            paciente=self.paciente,
            template_token="consentimiento-tensamax",
            template_nombre="Otros procedimientos",
            procedimiento=self.procedimiento,
            fecha_firma=timezone.localdate(),
            vigencia_hasta=timezone.localdate() + timedelta(days=365),
            metodo=ConsentimientoPaciente.Metodo.PRESENCIAL_CONFIRMADO,
            registrado_por=self.superadmin,
        )

        otra_clinica = Clinica.objects.create(nombre="Otra Clinica", nit="905000222")
        otra_sede = Sede.objects.create(
            clinica=otra_clinica, nombre="Sede Central", ciudad="Bogota", direccion="Cra 1", telefono="3000000001"
        )
        otro_paciente = Paciente.objects.create(
            clinica=otra_clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="987654321",
            nombres="Ana",
            apellidos="Perez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 2",
            telefono="3000000002",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        otro_profesional = User.objects.create_user(
            email="profesional-otra-clinica@example.com",
            password="Secret123!",
            first_name="Otro",
            last_name="Profesional",
            rol=User.Role.PROFESIONAL,
            clinica=otra_clinica,
            es_profesional=True,
        )
        otra_cita = Cita.objects.create(
            paciente=otro_paciente,
            sede=otra_sede,
            profesional=otro_profesional,
            fecha_inicio=timezone.now(),
            fecha_fin=timezone.now() + timedelta(hours=1),
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )

        admin_clinica_propia = User.objects.create_user(
            email="admin-protocolos@example.com",
            password="Secret123!",
            first_name="Admin",
            last_name="Protocolos",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.client.force_authenticate(admin_clinica_propia)

        complete = self.client.post(
            f"/api/v1/protocolos/sesiones/{sesion.id}/marcar_completada/",
            {"cita_id": str(otra_cita.id), "profesional_id": str(otro_profesional.id)},
            format="json",
        )

        self.assertEqual(complete.status_code, 404)
        sesion.refresh_from_db()
        self.assertIsNone(sesion.cita_id)
        self.assertIsNone(sesion.profesional_id)


class TipoSesionMultiProcedimientoTests(TestCase):
    """Un tipo de sesión con varios procedimientos: la atención debe agregar los
    consentimientos y las zonas de TODOS ellos, y registrar todos como ejecutados."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin-multiproc@example.com",
            password="Secret123!",
            first_name="Admin",
            last_name="MultiProc",
            rol=User.Role.ADMIN,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica MultiProc", nit="905000333")
        self.admin.clinica = self.clinica
        self.admin.save(update_fields=["clinica"])
        self.client.force_authenticate(self.admin)

        self.profesional = User.objects.create_user(
            email="pro-multiproc@example.com",
            password="Secret123!",
            first_name="Pro",
            last_name="MultiProc",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
            es_profesional=True,
        )
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Central", ciudad="Bogota", direccion="Cra 1", telefono="3000000010"
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="111222333",
            nombres="Lucia",
            apellidos="Ramirez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 3",
            telefono="3000000011",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

        # Procedimiento A: consentimiento X, sin zonas
        self.proc_a = Servicio.objects.create(
            clinica=self.clinica, nombre="Contorno mandibular", duracion_min=30, precio="200000.00"
        )
        self.tpl_a = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, tipo="otros", template_token="consent-a"
        )
        ServicioConsentimiento.objects.create(servicio=self.proc_a, template=self.tpl_a, orden=1)

        # Procedimiento B: consentimiento Y + zonas
        self.proc_b = Servicio.objects.create(
            clinica=self.clinica, nombre="Limpieza facial", duracion_min=30, precio="150000.00"
        )
        self.tpl_b = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, tipo="otros", template_token="consent-b"
        )
        ServicioConsentimiento.objects.create(servicio=self.proc_b, template=self.tpl_b, orden=1)

        diagrama = DiagramaCorporal.objects.create(nombre="Rostro")
        grupo = GrupoZonas.objects.create(nombre="Zonas faciales")
        GrupoZonasDiagrama.objects.create(grupo=grupo, diagrama=diagrama, orden=1)
        ServicioGrupoZonas.objects.create(servicio=self.proc_b, grupo=grupo, orden=1)

        self.tratamiento_catalogo = TratamientoCatalogo.objects.create(
            clinica=self.clinica, nombre="Plan Facial", precio_estimado="700000.00"
        )
        self.tipo_sesion = TipoSesion.objects.create(
            tratamiento=self.tratamiento_catalogo,
            nombre="Contorno + Limpieza",
            cantidad=2,
            orden=1,
            es_compromiso=True,
        )
        TipoSesionProcedimiento.objects.create(tipo_sesion=self.tipo_sesion, procedimiento=self.proc_a, orden=1)
        TipoSesionProcedimiento.objects.create(tipo_sesion=self.tipo_sesion, procedimiento=self.proc_b, orden=2)

        self.tratamiento = TratamientoPaciente.objects.create(
            paciente=self.paciente,
            servicio=self.proc_a,
            tratamiento_catalogo=self.tratamiento_catalogo,
        )
        self.sesion1 = SesionProcedimiento.objects.create(
            tratamiento=self.tratamiento, tipo_sesion=self.tipo_sesion, numero=1, procedimiento=self.proc_a
        )
        self.sesion2 = SesionProcedimiento.objects.create(
            tratamiento=self.tratamiento, tipo_sesion=self.tipo_sesion, numero=2, procedimiento=self.proc_a
        )
        self.cita = Cita.objects.create(
            paciente=self.paciente,
            sede=self.sede,
            servicio=None,
            profesional=self.profesional,
            fecha_inicio=timezone.now(),
            fecha_fin=timezone.now() + timedelta(minutes=60),
            duracion_min=60,
            servicio_nombre="Contorno + Limpieza",
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )
        self.sesion1.cita = self.cita
        self.sesion1.save(update_fields=["cita"])

    def _firmar(self, token):
        """Consentimiento del paciente (usado por verificar_consentimientos_sesion)."""
        ConsentimientoPaciente.objects.create(
            paciente=self.paciente,
            template_token=token,
            template_nombre=token,
            fecha_firma=timezone.localdate(),
            vigencia_hasta=timezone.localdate() + timedelta(days=365),
            metodo=ConsentimientoPaciente.Metodo.PRESENCIAL_CONFIRMADO,
            registrado_por=self.admin,
        )

    def _firmar_informado(self, token):
        """ConsentimientoInformado (usado por build_consentimiento_info / gate de agenda)."""
        from apps.historia_clinica.models import ConsentimientoInformado

        ConsentimientoInformado.objects.create(
            paciente=self.paciente,
            clinica=self.clinica,
            tipo="otros",
            documenso_template_token=token,
            firmado=True,
            fecha_firma=timezone.localdate(),
        )

    def test_contexto_sesion_incluye_todos_los_procedimientos_y_zonas(self):
        ctx = contexto_sesion_para_cita(self.cita)
        self.assertIsNotNone(ctx)
        self.assertEqual(ctx["numero"], 1)
        self.assertEqual(ctx["total"], 2)
        self.assertEqual(ctx["tratamiento_nombre"], "Plan Facial")
        nombres = sorted(p["nombre"] for p in ctx["procedimientos"])
        self.assertEqual(nombres, ["Contorno mandibular", "Limpieza facial"])
        self.assertTrue(ctx["tiene_zonas"])

    def test_consentimiento_info_agrega_x_e_y(self):
        info = build_consentimiento_info(self.cita)
        tokens = sorted(c["template_token"] for c in info["consentimientos"])
        self.assertEqual(tokens, ["consent-a", "consent-b"])
        self.assertFalse(info["todos_firmados"])

        self._firmar_informado("consent-a")
        self._firmar_informado("consent-b")
        info = build_consentimiento_info(self.cita)
        self.assertTrue(info["todos_firmados"])

    def test_zonas_endpoint_deduplica_diagramas_entre_procedimientos(self):
        # A comparte el MISMO diagrama que B → no debe aparecer dos veces.
        diagrama = DiagramaCorporal.objects.get(nombre="Rostro")
        grupo_a = GrupoZonas.objects.create(nombre="Zonas contorno")
        GrupoZonasDiagrama.objects.create(grupo=grupo_a, diagrama=diagrama, orden=1)
        ServicioGrupoZonas.objects.create(servicio=self.proc_a, grupo=grupo_a, orden=1)

        historia, _ = HistoriaClinica.objects.get_or_create(
            paciente=self.paciente, defaults={"clinica": self.clinica}
        )
        nota = NotaClinica.objects.create(historia=historia, cita=self.cita)

        resp = self.client.get(f"/api/v1/historia-clinica/notas/{nota.id}/zonas/")
        self.assertEqual(resp.status_code, 200)
        diagrama_ids = [d["id"] for d in resp.json()["diagramas"]]
        self.assertEqual(diagrama_ids, [str(diagrama.id)])

    def test_marcar_completada_sin_lista_registra_todos_los_procedimientos(self):
        self._firmar("consent-a")
        self._firmar("consent-b")

        resp = self.client.post(
            f"/api/v1/protocolos/sesiones/{self.sesion1.id}/marcar_completada/",
            {"cita": str(self.cita.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.sesion1.refresh_from_db()
        self.assertEqual(self.sesion1.estado, SesionProcedimiento.Estado.COMPLETADO)
        self.assertEqual(self.sesion1.cita_id, self.cita.id)
        ejecutados = sorted(self.sesion1.procedimientos_ejecutados.values_list("nombre", flat=True))
        self.assertEqual(ejecutados, ["Contorno mandibular", "Limpieza facial"])
