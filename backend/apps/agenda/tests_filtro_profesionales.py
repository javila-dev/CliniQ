"""Filtro opcional por clínica: solo ofrecer profesionales asociados al procedimiento."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import (
    Clinica, Sede, Servicio, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo,
)
from apps.colaboradores.models import Colaborador
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.pacientes.models import Paciente
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente


User = get_user_model()

HORARIO = {dia: ["08:00", "18:00"] for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")}


def proximo_lunes(hora):
    hoy = timezone.localdate()
    dias = (0 - hoy.weekday()) % 7 or 7
    return timezone.make_aware(
        datetime.combine(hoy + timedelta(days=dias), time(hora, 0)), timezone.get_current_timezone()
    )


class FiltroProfesionalesBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Filtro", nit="900777001")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario=dict(HORARIO),
        )
        self.admin = User.objects.create_user(
            email="admin-filtro@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.limpieza = Servicio.objects.create(clinica=self.clinica, nombre="Limpieza", duracion_min=30)
        self.laser = Servicio.objects.create(clinica=self.clinica, nombre="Laser", duracion_min=30)
        self.prof_limpieza = self._profesional("limpieza@example.com", [self.limpieza])
        self.prof_laser = self._profesional("laser@example.com", [self.laser])
        self.prof_ambos = self._profesional("ambos@example.com", [self.limpieza, self.laser])
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="1010",
            nombres="Juan", apellidos="Perez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )

    def _profesional(self, email, procedimientos):
        user = User.objects.create_user(
            email=email, password="secret123", first_name=email.split("@")[0].title(), last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica,
        )
        colaborador = Colaborador.objects.create(
            user=user, sede_principal=self.sede, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(), numero_documento=f"doc-{email}",
        )
        colaborador.sedes.add(self.sede)
        colaborador.especialidades.set(procedimientos)
        return user

    def _activar_filtro(self):
        self.clinica.filtrar_profesionales_por_procedimiento = True
        self.clinica.save(update_fields=["filtrar_profesionales_por_procedimiento", "updated_at"])

    def _crear_cita(self, profesional, *, hora=10, **extra):
        payload = {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "profesional": str(profesional.id),
            "fecha_inicio": proximo_lunes(hora).isoformat(),
            "canal_origen": "presencial",
        }
        payload.update(extra)
        return self.client.post("/api/v1/agenda/citas/", payload, format="json")

    def _ids_profesionales(self, **params):
        response = self.client.get(
            "/api/v1/colaboradores/profesionales/", {"sede_id": str(self.sede.id), **params}
        )
        self.assertEqual(response.status_code, 200, response.content)
        return {item["id"] for item in response.json()}


class ListadoDeProfesionalesTests(FiltroProfesionalesBase):
    def test_apagado_ignora_el_procedimiento(self):
        ids = self._ids_profesionales(servicio_ids=str(self.limpieza.id))

        self.assertEqual(ids, {str(self.prof_limpieza.id), str(self.prof_laser.id), str(self.prof_ambos.id)})

    def test_encendido_solo_lista_a_quienes_realizan_el_procedimiento(self):
        self._activar_filtro()

        ids = self._ids_profesionales(servicio_ids=str(self.limpieza.id))

        self.assertEqual(ids, {str(self.prof_limpieza.id), str(self.prof_ambos.id)})

    def test_con_varios_procedimientos_basta_con_realizar_uno(self):
        self._activar_filtro()

        ids = self._ids_profesionales(servicio_ids=f"{self.limpieza.id},{self.laser.id}")

        self.assertEqual(ids, {str(self.prof_limpieza.id), str(self.prof_laser.id), str(self.prof_ambos.id)})

    def test_encendido_sin_procedimiento_lista_a_todos(self):
        self._activar_filtro()

        self.assertEqual(len(self._ids_profesionales()), 3)

    def test_id_de_procedimiento_invalido_es_400(self):
        response = self.client.get(
            "/api/v1/colaboradores/profesionales/", {"sede_id": str(self.sede.id), "servicio_ids": "no-es-uuid"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("servicio_ids", response.json())


class ListadoPorCotizacionTests(FiltroProfesionalesBase):
    """En modo cotización el modal no conoce los ids de los procedimientos: envía el ítem o la sesión."""

    def test_un_item_de_procedimiento_filtra_por_ese_procedimiento(self):
        self._activar_filtro()
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        item = ItemCotizacion.objects.create(
            cotizacion=cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.laser,
            descripcion="Laser", num_citas=2, valor_unitario=Decimal("100000"),
        )

        ids = self._ids_profesionales(item_cotizacion_id=str(item.id))

        self.assertEqual(ids, {str(self.prof_laser.id), str(self.prof_ambos.id)})

    def test_una_sesion_combinada_lista_a_quien_realice_al_menos_uno(self):
        self._activar_filtro()
        catalogo = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="Combinado")
        tipo = TipoSesion.objects.create(tratamiento=catalogo, nombre="Limpieza + laser", cantidad=1)
        TipoSesionProcedimiento.objects.create(tipo_sesion=tipo, procedimiento=self.limpieza, orden=1)
        tratamiento = TratamientoPaciente.objects.create(
            paciente=self.paciente, servicio=self.limpieza, tratamiento_catalogo=catalogo,
            fecha_inicio=date.today(),
        )
        sesion = SesionProcedimiento.objects.create(
            tratamiento=tratamiento, tipo_sesion=tipo, numero=1, procedimiento=self.limpieza,
        )

        ids = self._ids_profesionales(sesion_ejecutada_id=str(sesion.id))
        self.assertEqual(ids, {str(self.prof_limpieza.id), str(self.prof_ambos.id)})

        TipoSesionProcedimiento.objects.create(tipo_sesion=tipo, procedimiento=self.laser, orden=2)
        ids = self._ids_profesionales(sesion_ejecutada_id=str(sesion.id))
        self.assertEqual(ids, {str(self.prof_limpieza.id), str(self.prof_laser.id), str(self.prof_ambos.id)})

    def test_un_item_de_otra_clinica_no_filtra(self):
        self._activar_filtro()
        otra = Clinica.objects.create(nombre="Otra", nit="900777002")
        paciente_otra = Paciente.objects.create(
            clinica=otra, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="2020",
            nombres="Ana", apellidos="Gomez", fecha_nacimiento=date(1990, 1, 1),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 3", telefono="3009998877",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        servicio_otra = Servicio.objects.create(clinica=otra, nombre="Ajeno", duracion_min=20)
        cotizacion = Cotizacion.objects.create(
            clinica=otra, paciente=paciente_otra, profesional=self.admin, estado=Cotizacion.Estado.ACEPTADA
        )
        item = ItemCotizacion.objects.create(
            cotizacion=cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=servicio_otra,
            descripcion="Ajeno", num_citas=1, valor_unitario=Decimal("1000"),
        )

        ids = self._ids_profesionales(item_cotizacion_id=str(item.id))

        self.assertEqual(len(ids), 3)


class CreacionDeCitasTests(FiltroProfesionalesBase):
    def test_apagado_cualquier_profesional_puede_agendar_cualquier_procedimiento(self):
        response = self._crear_cita(self.prof_laser, servicio=str(self.limpieza.id))

        self.assertEqual(response.status_code, 201, response.content)

    def test_encendido_rechaza_a_un_profesional_que_no_realiza_el_procedimiento(self):
        self._activar_filtro()

        response = self._crear_cita(self.prof_laser, servicio=str(self.limpieza.id))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PROFESIONAL_NO_REALIZA_PROCEDIMIENTO")
        self.assertFalse(Cita.objects.exists())

    def test_encendido_acepta_a_un_profesional_que_lo_realiza(self):
        self._activar_filtro()

        response = self._crear_cita(self.prof_limpieza, servicio=str(self.limpieza.id))

        self.assertEqual(response.status_code, 201, response.content)

    def test_encendido_la_consulta_libre_no_se_restringe(self):
        self._activar_filtro()

        response = self._crear_cita(self.prof_laser, duracion_min=30)

        self.assertEqual(response.status_code, 201, response.content)


class EdicionDeCitasTests(FiltroProfesionalesBase):
    def _cita_existente(self):
        inicio = proximo_lunes(10)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=self.limpieza, profesional=self.prof_laser,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=Cita.Estado.CONFIRMADA,
            estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO,
            canal_confirmacion=self.paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
            created_by=self.admin,
        )

    def test_no_es_retroactivo_editar_otros_campos_de_una_cita_existente(self):
        cita = self._cita_existente()
        self._activar_filtro()

        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita.id}/", {"notas_internas": "Llamar antes"}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.content)

    def test_no_es_retroactivo_reenviar_el_mismo_profesional_y_procedimiento(self):
        cita = self._cita_existente()
        self._activar_filtro()

        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita.id}/",
            {"profesional": str(self.prof_laser.id), "servicio": str(self.limpieza.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)

    def test_cambiar_a_un_profesional_que_no_realiza_el_procedimiento_se_rechaza(self):
        cita = self._cita_existente()
        cita.profesional = self.prof_limpieza
        cita.save(update_fields=["profesional", "updated_at"])
        self._activar_filtro()

        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita.id}/", {"profesional": str(self.prof_laser.id)}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], ["PROFESIONAL_NO_REALIZA_PROCEDIMIENTO"])
        self.assertEqual(response.json()["profesional"], ["Este profesional no realiza el procedimiento elegido."])

    def test_cambiar_a_un_profesional_que_si_lo_realiza_se_acepta(self):
        cita = self._cita_existente()
        self._activar_filtro()

        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita.id}/", {"profesional": str(self.prof_ambos.id)}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.content)


class ActivacionDelFiltroTests(FiltroProfesionalesBase):
    RESUMEN = "/api/v1/clinicas/mi-clinica/procedimientos-sin-profesional/"
    ASIGNAR = "/api/v1/clinicas/mi-clinica/asignar-profesionales-a-procedimientos/"
    CHECKLIST = "/api/v1/clinicas/mi-clinica/setup-checklist/"

    def _sin_asignar(self):
        return Servicio.objects.create(clinica=self.clinica, nombre="Nuevo sin profesional", duracion_min=20)

    def test_el_resumen_lista_los_procedimientos_sin_profesional(self):
        sin_asignar = self._sin_asignar()

        response = self.client.get(self.RESUMEN)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([p["id"] for p in response.json()["procedimientos"]], [str(sin_asignar.id)])
        self.assertEqual(response.json()["total_profesionales"], 3)

    def test_asignar_da_todos_los_profesionales_solo_a_los_procedimientos_sin_ninguno(self):
        sin_asignar = self._sin_asignar()

        response = self.client.post(self.ASIGNAR)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["procedimientos_actualizados"], 1)
        self.assertEqual(sin_asignar.colaboradores.count(), 3)
        # Los que ya tenían profesionales no se tocan.
        self.assertEqual(self.limpieza.colaboradores.count(), 2)
        self.assertEqual(self.laser.colaboradores.count(), 2)

    def test_asignar_sin_profesionales_activos_es_400(self):
        Colaborador.objects.filter(user__es_profesional=True).update(activo=False)
        self._sin_asignar()

        response = self.client.post(self.ASIGNAR)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SIN_PROFESIONALES")

    def test_el_checklist_con_filtro_exige_un_procedimiento_con_profesional(self):
        Colaborador.objects.filter(user__es_profesional=True).update(activo=False)
        items = {i["key"]: i for i in self.client.get(self.CHECKLIST).json()["items"]}
        self.assertTrue(items["procedimientos"]["completado"])

        self._activar_filtro()
        items = {i["key"]: i for i in self.client.get(self.CHECKLIST).json()["items"]}

        self.assertFalse(items["procedimientos"]["completado"])

    def test_el_parametro_se_puede_encender_por_la_api_de_la_clinica(self):
        response = self.client.patch(
            f"/api/v1/clinicas/clinicas/{self.clinica.id}/",
            {"filtrar_profesionales_por_procedimiento": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.clinica.refresh_from_db()
        self.assertTrue(self.clinica.filtrar_profesionales_por_procedimiento)
