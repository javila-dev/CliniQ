"""Preparar mi clínica: el estado se calcula desde los datos reales y nunca afirma de más."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Sede, Servicio, TratamientoCatalogo
from apps.colaboradores.models import Colaborador
from apps.pacientes.models import Paciente


User = get_user_model()

HORARIO = {"lunes": ["08:00", "18:00"], "martes": ["08:00", "18:00"]}


class PreparacionBase(TestCase):
    URL = "/api/v1/clinicas/mi-clinica/setup-checklist/"
    PREPARACION = "/api/v1/clinicas/mi-clinica/preparacion/"
    YO_ATIENDO = "/api/v1/clinicas/mi-clinica/preparacion/yo-atiendo/"

    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Preparar", nit="900888001")
        # Crear el admin dispara la señal que le genera un Colaborador (sin ser profesional).
        self.admin = User.objects.create_user(
            email="admin-preparar@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)

    def _sede(self, horario=None):
        return Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 100 #15-20",
            telefono="3000000000", horario=dict(HORARIO) if horario is None else horario,
        )

    def _profesional(self, sede, *, es_profesional=True, activo=True, email="prof-preparar@example.com"):
        # User.save() fuerza es_profesional=True para el rol PROFESIONAL; quien no atiende usa otro rol.
        user = User.objects.create_user(
            email=email, password="secret123", first_name="Laura", last_name="Ramirez",
            rol=User.Role.PROFESIONAL if es_profesional else User.Role.RECEPCION,
            clinica=self.clinica, es_profesional=es_profesional,
        )
        if not activo:
            user.activo = False
            user.save(update_fields=["activo", "updated_at"])
        colaborador = Colaborador.objects.create(
            user=user, sede_principal=sede, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(), numero_documento=f"doc-{email}",
        )
        colaborador.sedes.add(sede)
        return colaborador

    def _procedimiento(self, nombre="Limpieza"):
        return Servicio.objects.create(clinica=self.clinica, nombre=nombre, duracion_min=30)

    def _estado(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def _pasos(self):
        return {p["key"]: p for p in self._estado()["items"]}


class EstadoDeLaPreparacionTests(PreparacionBase):
    def test_clinica_recien_creada(self):
        estado = self._estado()

        self.assertEqual(estado["nivel"], "sin_empezar")
        self.assertFalse(estado["todo_listo"])
        self.assertEqual(estado["completados"], 0)
        self.assertEqual(
            [p["key"] for p in estado["items"]],
            ["sede", "equipo", "procedimientos", "consentimientos", "recepcion", "tratamientos", "primera_cita"],
        )

    def test_cada_paso_explica_para_que_sirve_y_como_resolverlo(self):
        for paso in self._estado()["items"]:
            self.assertTrue(paso["por_que"], paso["key"])
            self.assertTrue(paso["resumen"], paso["key"])
            self.assertTrue(paso["href"].startswith("/"), paso["key"])
            self.assertTrue(paso["accion"], paso["key"])

    def test_la_sede_es_el_primer_paso(self):
        self.assertEqual(self._estado()["items"][0]["key"], "sede")

    def test_sede_sin_horario_no_cuenta(self):
        self._sede(horario={})

        paso = self._pasos()["sede"]

        self.assertFalse(paso["completado"])
        self.assertIn("no tiene horario", paso["resumen"])

    def test_sede_con_horario_da_los_datos_basicos(self):
        self._sede()

        estado = self._estado()

        self.assertTrue(self._pasos()["sede"]["completado"])
        self.assertEqual(estado["nivel"], "datos_basicos")

    def test_el_colaborador_automatico_del_admin_no_cuenta_como_profesional(self):
        self._sede()

        self.assertTrue(Colaborador.objects.filter(user=self.admin).exists())
        self.assertFalse(self._pasos()["equipo"]["completado"])

    def test_colaborador_que_no_atiende_pacientes_no_cuenta(self):
        self._profesional(self._sede(), es_profesional=False)

        self.assertFalse(self._pasos()["equipo"]["completado"])

    def test_profesional_sin_sede_no_cuenta(self):
        colaborador = self._profesional(self._sede())
        colaborador.sedes.clear()

        self.assertFalse(self._pasos()["equipo"]["completado"])

    def test_lista_para_agendar_exige_sede_profesional_y_procedimiento(self):
        sede = self._sede()
        self._profesional(sede)
        self.assertEqual(self._estado()["nivel"], "datos_basicos")

        self._procedimiento()

        self.assertEqual(self._estado()["nivel"], "lista_para_agendar")

    def test_solo_hay_dos_niveles(self):
        self.assertEqual(
            [n["key"] for n in self._estado()["niveles"]], ["datos_basicos", "lista_para_agendar"]
        )

    def test_la_invitacion_pendiente_no_bloquea_pero_se_avisa(self):
        sede = self._sede()
        self._profesional(sede, activo=False)
        self._procedimiento()

        estado = self._estado()

        self.assertEqual(estado["nivel"], "lista_para_agendar")
        paso = {p["key"]: p for p in estado["items"]}["equipo"]
        self.assertTrue(paso["completado"])
        self.assertIn("aún no acepta su invitación", paso["resumen"])

    def test_cualquier_rol_con_el_indicador_de_atender_cuenta(self):
        sede = self._sede()
        self._procedimiento()
        self.client.post(self.YO_ATIENDO)  # el administrador se marca como profesional

        self.assertEqual(self._estado()["nivel"], "lista_para_agendar")

    def test_con_el_filtro_un_procedimiento_sin_profesional_no_cuenta(self):
        sede = self._sede()
        self._profesional(sede)
        self._procedimiento()
        self.clinica.filtrar_profesionales_por_procedimiento = True
        self.clinica.save(update_fields=["filtrar_profesionales_por_procedimiento", "updated_at"])

        paso = self._pasos()["procedimientos"]

        self.assertFalse(paso["completado"])
        self.assertIn("no tiene profesional asignado", paso["resumen"])
        self.assertEqual(self._estado()["nivel"], "datos_basicos")

    def _whatsapp(self, habilitado):
        self.clinica.whatsapp_override = habilitado
        self.clinica.save(update_fields=["whatsapp_override", "updated_at"])

    def test_recepcion_muestra_el_flujo_efectivo(self):
        self._whatsapp(False)

        paso = self._pasos()["recepcion"]

        self.assertTrue(paso["completado"])
        self.assertFalse(paso["requerido"])
        self.assertIn("Pago", paso["resumen"])
        self.assertIn("Firma de asistencia", paso["resumen"])
        # La verificación de llegada depende del add-on de WhatsApp.
        self.assertNotIn("Verificación de llegada", paso["resumen"])

    def test_recepcion_incluye_la_verificacion_de_llegada_con_el_addon(self):
        self._whatsapp(True)

        self.assertIn("Verificación de llegada", self._pasos()["recepcion"]["resumen"])

    def test_la_primera_cita_se_detecta_desde_los_datos(self):
        sede = self._sede()
        profesional = self._profesional(sede)
        servicio = self._procedimiento()
        paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="1010",
            nombres="Juan", apellidos="Perez", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.assertFalse(self._pasos()["primera_cita"]["completado"])
        inicio = timezone.now() + timedelta(days=1)

        Cita.objects.create(
            paciente=paciente, sede=sede, servicio=servicio, profesional=profesional.user,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=Cita.Estado.CONFIRMADA,
            estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO,
            canal_confirmacion=paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
            created_by=self.admin,
        )

        estado = self._estado()
        self.assertTrue(self._pasos()["primera_cita"]["completado"])
        self.assertTrue(estado["todo_listo"])

    def test_migrar_solo_aparece_si_el_superadmin_activo_el_modo(self):
        self.assertNotIn("migrar", self._pasos())

        self.clinica.modo_puesta_en_marcha = True
        self.clinica.save(update_fields=["modo_puesta_en_marcha", "updated_at"])

        paso = self._pasos()["migrar"]
        self.assertFalse(paso["requerido"])
        self.assertEqual(paso["href"], "/puesta-en-marcha")


class PreferenciasTests(PreparacionBase):
    def test_elegir_procedimientos_oculta_los_tratamientos(self):
        self.assertIn("tratamientos", self._pasos())

        response = self.client.post(self.PREPARACION, {"modelo": "procedimientos"}, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn("tratamientos", {p["key"] for p in response.json()["items"]})
        self.assertEqual(response.json()["modelo"], "procedimientos")

    def test_elegir_ambos_los_muestra(self):
        self.client.post(self.PREPARACION, {"modelo": "ambos"}, format="json")

        self.assertIn("tratamientos", self._pasos())

    def test_un_modelo_invalido_es_400(self):
        response = self.client.post(self.PREPARACION, {"modelo": "otra-cosa"}, format="json")

        self.assertEqual(response.status_code, 400)

    def test_se_omite_y_se_restaura_un_paso_opcional(self):
        response = self.client.post(self.PREPARACION, {"omitir": "consentimientos"}, format="json")
        self.assertTrue({p["key"]: p for p in response.json()["items"]}["consentimientos"]["omitido"])

        response = self.client.post(self.PREPARACION, {"restaurar": "consentimientos"}, format="json")
        self.assertFalse({p["key"]: p for p in response.json()["items"]}["consentimientos"]["omitido"])

    def test_no_se_puede_omitir_un_paso_requerido(self):
        response = self.client.post(self.PREPARACION, {"omitir": "sede"}, format="json")

        self.assertEqual(response.status_code, 400)

    def test_un_paso_opcional_ya_completo_no_figura_como_omitido(self):
        self.client.post(self.PREPARACION, {"omitir": "recepcion"}, format="json")

        self.assertFalse(self._pasos()["recepcion"]["omitido"])

    def test_omitir_no_altera_el_progreso_requerido(self):
        self.client.post(self.PREPARACION, {"omitir": "consentimientos"}, format="json")

        self.assertEqual(self._estado()["total"], 4)

    def test_las_preferencias_se_guardan_en_la_clinica(self):
        self.client.post(self.PREPARACION, {"modelo": "tratamientos", "omitir": "migrar"}, format="json")

        self.clinica.refresh_from_db()
        self.assertEqual(self.clinica.preparacion["modelo"], "tratamientos")
        self.assertEqual(self.clinica.preparacion["omitidos"], ["migrar"])


class YoAtiendoPacientesTests(PreparacionBase):
    def test_el_admin_se_marca_como_profesional_y_queda_en_la_sede(self):
        self._sede()
        self.assertTrue(self._pasos()["equipo"]["puede_marcarse_profesional"])

        response = self.client.post(self.YO_ATIENDO)

        self.assertEqual(response.status_code, 200, response.content)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.es_profesional)
        pasos = {p["key"]: p for p in response.json()["items"]}
        self.assertTrue(pasos["equipo"]["completado"])
        self.assertFalse(pasos["equipo"]["puede_marcarse_profesional"])

    def test_sin_sede_queda_marcado_pero_aun_no_cuenta(self):
        response = self.client.post(self.YO_ATIENDO)

        self.assertEqual(response.status_code, 200, response.content)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.es_profesional)
        self.assertFalse({p["key"]: p for p in response.json()["items"]}["equipo"]["completado"])

    def test_quien_no_es_admin_no_puede_marcarse(self):
        recepcion = User.objects.create_user(
            email="recepcion-preparar@example.com", password="secret123", first_name="Rita", last_name="Recepcion",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)

        response = self.client.post(self.YO_ATIENDO)

        self.assertIn(response.status_code, (400, 403))
        recepcion.refresh_from_db()
        self.assertFalse(recepcion.es_profesional)
