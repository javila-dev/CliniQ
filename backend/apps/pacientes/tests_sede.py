import importlib
from datetime import date, timedelta

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.colaboradores.models import Colaborador
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente
from apps.pacientes.sedes import sede_por_defecto


User = get_user_model()


class SedePacienteBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="root-sede@example.com", password="secret123", first_name="Root", last_name="Sede",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.admin)
        self.clinica = Clinica.objects.create(nombre="Clinica Sedes", nit="900777888")
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.norte = self._sede("Norte")
        self.sur = self._sede("Sur")
        self.servicio = Servicio.objects.create(
            clinica=self.clinica, nombre="Toxina", descripcion="", duracion_min=30, precio="100000.00",
        )
        self.profesional = User.objects.create_user(
            email="prof-sede@example.com", password="secret123", first_name="Ana", last_name="Prof",
            rol=User.Role.PROFESIONAL, es_profesional=True, clinica=self.clinica,
        )
        self._doc = 1000

    def _sede(self, nombre, clinica=None):
        return Sede.objects.create(
            clinica=clinica or self.clinica, nombre=nombre, ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario={},
        )

    def _paciente(self, nombres="Ana", sede_registro=None, fecha_nacimiento=None, clinica=None):
        self._doc += 1
        return Paciente.objects.create(
            clinica=clinica or self.clinica, sede_registro=sede_registro,
            tipo_documento=Paciente.TipoDocumento.CC, numero_documento=str(self._doc),
            nombres=nombres, apellidos="Prueba",
            fecha_nacimiento=fecha_nacimiento or date(1990, 1, 15), sexo=Paciente.Sexo.FEMENINO,
            telefono="3001112233", autoriza_datos=True,
        )

    def _cita(self, paciente, sede, dias, estado=Cita.Estado.COMPLETADA):
        inicio = timezone.now() + timedelta(days=dias)
        return Cita.objects.create(
            paciente=paciente, sede=sede, servicio=self.servicio, profesional=self.profesional,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=estado,
            canal_confirmacion=paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
            created_by=self.admin,
        )

    def _datos_nuevo(self, **extra):
        self._doc += 1
        return {
            "tipo_documento": "CC", "numero_documento": str(self._doc), "nombres": "Nuevo",
            "apellidos": "Paciente", "fecha_nacimiento": "1991-03-04", "sexo": "F",
            "telefono": "3005556677", "autoriza_datos": True, **extra,
        }


class SedeRegistroAlCrearTests(SedePacienteBase):
    def test_guarda_la_sede_elegida(self):
        response = self.client.post("/api/v1/pacientes/", self._datos_nuevo(sede_registro=str(self.sur.id)), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["sede_registro"], self.sur.id)
        self.assertEqual(response.data["sede_registro_nombre"], "Sur")
        self.assertEqual(Paciente.objects.get(id=response.data["id"]).sede_registro, self.sur)

    def test_rechaza_una_sede_de_otra_clinica(self):
        otra = Clinica.objects.create(nombre="Otra", nit="900111000")
        ajena = self._sede("Ajena", clinica=otra)
        response = self.client.post("/api/v1/pacientes/", self._datos_nuevo(sede_registro=str(ajena.id)), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("sede_registro", response.data)

    def test_sin_sede_y_con_varias_sedes_queda_vacia(self):
        response = self.client.post("/api/v1/pacientes/", self._datos_nuevo(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data["sede_registro"])

    def test_sin_sede_y_con_una_sola_sede_activa_usa_esa(self):
        self.sur.activo = False
        self.sur.save(update_fields=["activo"])
        response = self.client.post("/api/v1/pacientes/", self._datos_nuevo(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["sede_registro"], self.norte.id)

    def test_por_defecto_la_sede_principal_de_quien_lo_crea(self):
        recepcion = User.objects.create_user(
            email="recep-sede@example.com", password="secret123", first_name="Rita", last_name="Recep",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        Colaborador.objects.create(
            user=recepcion, sede_principal=self.sur, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(), numero_documento="col-1",
        )
        self.assertEqual(sede_por_defecto(self.clinica, recepcion), self.sur)
        # Sin perfil de colaborador y con dos sedes: no hay cómo saberlo.
        self.assertIsNone(sede_por_defecto(self.clinica, self.admin))


class SedeHabitualTests(SedePacienteBase):
    def test_es_la_de_la_ultima_cita_no_cancelada(self):
        paciente = self._paciente(sede_registro=self.norte)
        self._cita(paciente, self.norte, dias=-30)
        self._cita(paciente, self.sur, dias=-5)
        self._cita(paciente, self.norte, dias=-1, estado=Cita.Estado.CANCELADA)

        response = self.client.get(f"/api/v1/pacientes/{paciente.id}/")
        self.assertEqual(response.data["sede_habitual"], str(self.sur.id))
        self.assertEqual(response.data["sede_habitual_nombre"], "Sur")
        self.assertEqual(response.data["sede_registro_nombre"], "Norte")

    def test_sin_citas_usa_la_cotizacion_y_luego_la_de_registro(self):
        cotizado = self._paciente(sede_registro=self.norte)
        Cotizacion.objects.create(clinica=self.clinica, paciente=cotizado, sede=self.sur)
        solo_registro = self._paciente(sede_registro=self.norte)

        self.assertEqual(self.client.get(f"/api/v1/pacientes/{cotizado.id}/").data["sede_habitual"], str(self.sur.id))
        self.assertEqual(self.client.get(f"/api/v1/pacientes/{solo_registro.id}/").data["sede_habitual"], str(self.norte.id))

    def test_el_listado_filtra_por_sede_habitual(self):
        en_sur = self._paciente(nombres="EnSur", sede_registro=self.norte)
        self._cita(en_sur, self.sur, dias=-2)
        en_norte = self._paciente(nombres="EnNorte", sede_registro=self.norte)
        self._paciente(nombres="SinSede")

        response = self.client.get("/api/v1/pacientes/", {"sede": str(self.sur.id)})
        ids = [p["id"] for p in response.data["results"]]
        self.assertEqual(ids, [str(en_sur.id)])

        response = self.client.get("/api/v1/pacientes/", {"sede": str(self.norte.id)})
        self.assertEqual([p["id"] for p in response.data["results"]], [str(en_norte.id)])

        # Sin filtro salen todos, con su sede.
        response = self.client.get("/api/v1/pacientes/")
        self.assertEqual(response.data["count"], 3)

    def test_resumen_cuenta_cada_paciente_en_una_sola_sede(self):
        paciente = self._paciente(sede_registro=self.norte)
        self._cita(paciente, self.sur, dias=-2)
        self._paciente(sede_registro=self.norte)

        sur = self.client.get("/api/v1/pacientes/resumen/", {"sede": str(self.sur.id)}).data
        norte = self.client.get("/api/v1/pacientes/resumen/", {"sede": str(self.norte.id)}).data
        todos = self.client.get("/api/v1/pacientes/resumen/").data
        self.assertEqual((sur["total"], norte["total"], todos["total"]), (1, 1, 2))

    def test_un_valor_de_sede_invalido_se_ignora(self):
        self._paciente()
        response = self.client.get("/api/v1/pacientes/", {"sede": "no-es-uuid"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)


class CumpleanosPorSedeTests(SedePacienteBase):
    def test_incluye_registrados_y_atendidos_en_la_sede(self):
        hoy = timezone.localdate()
        cumple = date(1990, hoy.month, min(hoy.day, 28))
        registrado_sur = self._paciente(nombres="RegSur", sede_registro=self.sur, fecha_nacimiento=cumple)
        atendido_en_ambas = self._paciente(nombres="Ambas", sede_registro=self.norte, fecha_nacimiento=cumple)
        self._cita(atendido_en_ambas, self.sur, dias=-10)
        solo_norte = self._paciente(nombres="Norte", sede_registro=self.norte, fecha_nacimiento=cumple)
        cancelado_sur = self._paciente(nombres="Cancelo", sede_registro=self.norte, fecha_nacimiento=cumple)
        self._cita(cancelado_sur, self.sur, dias=-3, estado=Cita.Estado.CANCELADA)

        params = {"dias": 31}
        sur = {p["id"] for p in self.client.get("/api/v1/pacientes/cumpleanos/", {**params, "sede": str(self.sur.id)}).data}
        norte = {p["id"] for p in self.client.get("/api/v1/pacientes/cumpleanos/", {**params, "sede": str(self.norte.id)}).data}
        todos = self.client.get("/api/v1/pacientes/cumpleanos/", params).data

        self.assertEqual(sur, {str(registrado_sur.id), str(atendido_en_ambas.id)})
        self.assertEqual(norte, {str(atendido_en_ambas.id), str(solo_norte.id), str(cancelado_sur.id)})
        self.assertEqual(len(todos), 4)


class LlenadoSedeRegistroTests(SedePacienteBase):
    def test_llena_desde_primera_cita_cotizacion_o_sede_unica(self):
        con_cita = self._paciente()
        self._cita(con_cita, self.sur, dias=-20)
        self._cita(con_cita, self.norte, dias=-2)
        con_cotizacion = self._paciente()
        Cotizacion.objects.create(clinica=self.clinica, paciente=con_cotizacion, sede=self.norte)
        sin_nada = self._paciente()
        ya_tenia = self._paciente(sede_registro=self.norte)
        self._cita(ya_tenia, self.sur, dias=-30)

        una_sede = Clinica.objects.create(nombre="Una sede", nit="900222333")
        unica = self._sede("Unica", clinica=una_sede)
        de_una_sede = self._paciente(clinica=una_sede)

        migracion = importlib.import_module("apps.pacientes.migrations.0012_paciente_sede_registro")
        migracion.llenar_sede_registro(django_apps, None)

        for paciente in (con_cita, con_cotizacion, sin_nada, ya_tenia, de_una_sede):
            paciente.refresh_from_db()
        self.assertEqual(con_cita.sede_registro, self.sur)
        self.assertEqual(con_cotizacion.sede_registro, self.norte)
        self.assertIsNone(sin_nada.sede_registro)
        self.assertEqual(ya_tenia.sede_registro, self.norte)
        self.assertEqual(de_una_sede.sede_registro, unica)
