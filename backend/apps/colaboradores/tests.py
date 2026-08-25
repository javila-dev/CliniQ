from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.colaboradores.models import Colaborador, HorarioColaborador
from apps.colaboradores.services import ensure_admin_colaborador
from apps.core.tests.factories import ClinicaFixtureMixin, HORARIO_LUN_VIE
from apps.users.models import Rol

User = get_user_model()


class ColaboradoresBaseTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        suffix = uuid4().hex[:8]
        self.crear_clinica_base(nit=f"91{suffix[:8]}", nombre="Clinica Colaboradores")
        self.crear_superadmin(email=f"super-colab-{suffix}@test.com")
        self.admin = User.objects.create_user(
            email=f"admin-colab-{suffix}@test.com",
            password="Secret123!",
            first_name="Admin",
            last_name="Colab",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.admin.rol_dinamico = Rol.objects.get(clinica=self.clinica, slug="admin")
        self.admin.save(update_fields=["rol_dinamico"])
        self.rol_profesional = Rol.objects.get(clinica=self.clinica, slug="profesional")
        self.servicio_extra = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Peeling",
            descripcion="Facial",
            duracion_min=45,
            precio="200000.00",
        )

    def _payload_crear_profesional(self, *, email=None):
        email = email or f"nuevo.prof.{uuid4().hex[:8]}@test.com"
        return {
            "email": email,
            "first_name": "Nuevo",
            "last_name": "Profesional",
            "telefono": "3005550001",
            "rol": "profesional",
            "sede_principal": str(self.sede.id),
            "sedes_ids": [str(self.sede.id)],
            "tipo_contrato": Colaborador.TipoContrato.EMPLEADO,
            "fecha_ingreso": date.today().isoformat(),
            "numero_documento": "99887766",
            "especialidades": [str(self.servicio.id)],
        }

    def _crear_colaborador_profesional(self, *, email="prof.colab@test.com"):
        user = User.objects.create_user(
            email=email,
            password="Secret123!",
            first_name="Prof",
            last_name="Colab",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
            es_profesional=True,
            rol_dinamico=self.rol_profesional,
        )
        colaborador = Colaborador.objects.create(
            user=user,
            sede_principal=self.sede,
            tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(),
            numero_documento="11223344",
        )
        colaborador.sedes.add(self.sede)
        colaborador.especialidades.add(self.servicio)
        return colaborador


class ColaboradorApiTests(ColaboradoresBaseTests):
    @patch("apps.colaboradores.serializers.send_invitation_email")
    def test_crear_colaborador_profesional(self, mocked_invite):
        self.client.force_authenticate(self.admin)

        payload = self._payload_crear_profesional()
        response = self.client.post(
            "/api/v1/colaboradores/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["nombre_completo"], "Nuevo Profesional")
        self.assertEqual(body["rol"], "profesional")
        self.assertEqual(body["role_nombre"], "Profesional")
        self.assertEqual(body["sede_principal"], str(self.sede.id))
        self.assertEqual(len(body["sedes_detalle"]), 1)
        self.assertEqual(len(body["especialidades_detalle"]), 1)
        mocked_invite.assert_called_once()

        colaborador = Colaborador.objects.get(user__email=payload["email"])
        self.assertTrue(colaborador.user.es_profesional)
        self.assertTrue(colaborador.sedes.filter(id=self.sede.id).exists())
        self.assertFalse(colaborador.user.is_active)

    @patch("apps.colaboradores.serializers.send_invitation_email")
    def test_crear_rechaza_email_duplicado_en_misma_clinica(self, _mocked_invite):
        self.client.force_authenticate(self.admin)
        self._crear_colaborador_profesional(email="dup@test.com")

        response = self.client.post(
            "/api/v1/colaboradores/",
            self._payload_crear_profesional(email="dup@test.com"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_list_solo_muestra_colaboradores_de_la_clinica_del_admin(self):
        otra = Clinica.objects.create(nombre="Otra Clinica", nit=f"92{uuid4().hex[:8]}")
        otra_sede = Sede.objects.create(
            clinica=otra,
            nombre="Sede Otra",
            ciudad="Medellin",
            direccion="Calle 9",
            telefono="3000000001",
            horario=dict(HORARIO_LUN_VIE),
        )
        otro_user = User.objects.create_user(
            email="prof.otra@test.com",
            password="Secret123!",
            first_name="Otro",
            last_name="Prof",
            rol=User.Role.PROFESIONAL,
            clinica=otra,
            es_profesional=True,
        )
        Colaborador.objects.create(
            user=otro_user,
            sede_principal=otra_sede,
            tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(),
            numero_documento="55667788",
        )
        self._crear_colaborador_profesional(email="local@test.com")
        self.client.force_authenticate(self.admin)

        response = self.client.get("/api/v1/colaboradores/")

        self.assertEqual(response.status_code, 200)
        emails = {item["email"] for item in response.json()["results"]}
        self.assertIn("local@test.com", emails)
        self.assertNotIn("prof.otra@test.com", emails)

    def test_profesionales_lista_solo_activos_con_especialidades(self):
        activo = self._crear_colaborador_profesional(email="activo@test.com")
        inactivo = self._crear_colaborador_profesional(email="inactivo@test.com")
        inactivo.activo = False
        inactivo.save(update_fields=["activo"])
        self.client.force_authenticate(self.superadmin)

        response = self.client.get("/api/v1/colaboradores/profesionales/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.json()}
        self.assertIn(str(activo.user_id), ids)
        self.assertNotIn(str(inactivo.user_id), ids)
        profesional = next(item for item in response.json() if item["id"] == str(activo.user_id))
        self.assertEqual(profesional["especialidades"][0]["nombre"], self.servicio.nombre)

    def test_profesionales_filtra_por_sede_id(self):
        sede_secundaria = Sede.objects.create(
            clinica=self.clinica,
            nombre="Secundaria",
            ciudad="Bogota",
            direccion="Calle 99",
            telefono="3000000002",
            horario=dict(HORARIO_LUN_VIE),
        )
        en_principal = self._crear_colaborador_profesional(email="principal@test.com")
        en_secundaria = self._crear_colaborador_profesional(email="secundaria@test.com")
        en_secundaria.sedes.add(sede_secundaria)
        self.client.force_authenticate(self.superadmin)

        response = self.client.get(
            "/api/v1/colaboradores/profesionales/",
            {"sede_id": str(sede_secundaria.id)},
        )

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.json()}
        self.assertIn(str(en_secundaria.user_id), ids)
        self.assertNotIn(str(en_principal.user_id), ids)

    def test_no_desactivar_colaborador_con_citas_futuras(self):
        colaborador = self._crear_colaborador_profesional()
        inicio = timezone.now() + timedelta(days=2)
        Cita.objects.create(
            paciente=self.paciente,
            sede=self.sede,
            servicio=self.servicio,
            profesional=colaborador.user,
            fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30,
            servicio_nombre=self.servicio.nombre,
            canal_confirmacion=self.paciente.canal_confirmacion,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"/api/v1/colaboradores/{colaborador.id}/",
            {"activo": False},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("activo", response.json())
        colaborador.refresh_from_db()
        self.assertTrue(colaborador.activo)

    def test_actualizar_especialidades(self):
        colaborador = self._crear_colaborador_profesional()
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"/api/v1/colaboradores/{colaborador.id}/",
            {"especialidades": [str(self.servicio.id), str(self.servicio_extra.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["especialidades_detalle"]), 2)


class HorarioColaboradorApiTests(ColaboradoresBaseTests):
    def setUp(self):
        super().setUp()
        self.colaborador = self._crear_colaborador_profesional()
        self.client.force_authenticate(self.admin)

    def test_crear_horario_valido(self):
        response = self.client.post(
            "/api/v1/colaboradores/horarios/",
            {
                "colaborador": str(self.colaborador.id),
                "sede": str(self.sede.id),
                "dia_semana": HorarioColaborador.DiaSemana.LUNES,
                "hora_inicio": "09:00:00",
                "hora_fin": "13:00:00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["sede_nombre"], self.sede.nombre)
        self.assertEqual(HorarioColaborador.objects.count(), 1)

    def test_rechaza_hora_fin_menor_o_igual_inicio(self):
        response = self.client.post(
            "/api/v1/colaboradores/horarios/",
            {
                "colaborador": str(self.colaborador.id),
                "sede": str(self.sede.id),
                "dia_semana": HorarioColaborador.DiaSemana.MARTES,
                "hora_inicio": "14:00:00",
                "hora_fin": "14:00:00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("hora_fin", response.json())

    def test_rechaza_sede_no_asignada_al_colaborador(self):
        sede_extra = Sede.objects.create(
            clinica=self.clinica,
            nombre="No asignada",
            ciudad="Bogota",
            direccion="Calle 50",
            telefono="3000000003",
            horario=dict(HORARIO_LUN_VIE),
        )
        response = self.client.post(
            "/api/v1/colaboradores/horarios/",
            {
                "colaborador": str(self.colaborador.id),
                "sede": str(sede_extra.id),
                "dia_semana": HorarioColaborador.DiaSemana.MIERCOLES,
                "hora_inicio": "08:00:00",
                "hora_fin": "12:00:00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("sede", response.json())

    def test_rechaza_horario_duplicado_mismo_dia_y_sede(self):
        payload = {
            "colaborador": str(self.colaborador.id),
            "sede": str(self.sede.id),
            "dia_semana": HorarioColaborador.DiaSemana.JUEVES,
            "hora_inicio": "08:00:00",
            "hora_fin": "12:00:00",
        }
        first = self.client.post("/api/v1/colaboradores/horarios/", payload, format="json")
        self.assertEqual(first.status_code, 201)

        duplicate = self.client.post("/api/v1/colaboradores/horarios/", payload, format="json")

        self.assertEqual(duplicate.status_code, 400)
        errors = duplicate.json()
        self.assertTrue(
            "dia_semana" in errors or any("único" in str(v).lower() for v in errors.values()),
            msg=errors,
        )

    def test_list_horarios_requiere_filtro_colaborador(self):
        response = self.client.get("/api/v1/colaboradores/horarios/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_profesional_solo_ve_sus_propios_horarios(self):
        otro = self._crear_colaborador_profesional(email="otro.prof@test.com")
        HorarioColaborador.objects.create(
            colaborador=self.colaborador,
            sede=self.sede,
            dia_semana=HorarioColaborador.DiaSemana.VIERNES,
            hora_inicio="09:00",
            hora_fin="12:00",
        )
        HorarioColaborador.objects.create(
            colaborador=otro,
            sede=self.sede,
            dia_semana=HorarioColaborador.DiaSemana.VIERNES,
            hora_inicio="13:00",
            hora_fin="17:00",
        )
        self.colaborador.user.rol_dinamico = self.rol_profesional
        self.colaborador.user.save(update_fields=["rol_dinamico"])
        self.client.force_authenticate(self.colaborador.user)

        response = self.client.get(
            "/api/v1/colaboradores/horarios/",
            {"colaborador": str(self.colaborador.id)},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["colaborador"], str(self.colaborador.id))


class ColaboradorServicesTests(ColaboradoresBaseTests):
    def test_ensure_admin_colaborador_crea_perfil_con_sede(self):
        admin_sin_colab = User.objects.create_user(
            email="admin-nuevo@test.com",
            password="Secret123!",
            first_name="Nuevo",
            last_name="Admin",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
            rol_dinamico=Rol.objects.get(clinica=self.clinica, slug="admin"),
        )

        colaborador = ensure_admin_colaborador(admin_sin_colab, force=True)

        self.assertIsNotNone(colaborador)
        self.assertEqual(colaborador.user_id, admin_sin_colab.id)
        self.assertEqual(colaborador.sede_principal_id, self.sede.id)
        self.assertTrue(colaborador.sedes.filter(id=self.sede.id).exists())

    def test_ensure_admin_colaborador_no_crea_para_superadmin(self):
        colaborador = ensure_admin_colaborador(self.superadmin)

        self.assertIsNone(colaborador)
