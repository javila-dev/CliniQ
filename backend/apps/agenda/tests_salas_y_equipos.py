"""Salas y equipos en la agenda (docs/plan-salas-y-equipos.md)."""
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda import recursos
from apps.agenda.models import BloqueoAgenda, Cita, CitaRecurso
from apps.clinicas.models import Clinica, HorarioRecurso, Recurso, Sede, Servicio
from apps.pacientes.models import Paciente

User = get_user_model()

HORARIO = {dia: ["08:00", "18:00"] for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")}
TZ = timezone.get_current_timezone()


def proximo_lunes():
    hoy = timezone.localdate()
    return hoy + timedelta(days=(0 - hoy.weekday()) % 7 or 7)


def a_las(fecha, hora, minuto=0):
    return timezone.make_aware(datetime.combine(fecha, time(hora, minuto)), TZ)


class SalasYEquiposBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Centro Laser", nit="900888001")
        self.sede = self._sede("Principal")
        self.admin = User.objects.create_user(
            email="admin-salas@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.profs = [self._profesional(i) for i in range(4)]
        self.pacientes = [self._paciente(i) for i in range(5)]

        self.cabina1 = self._recurso("Cabina 1", Recurso.Tipo.SALA, orden=1)
        self.cabina2 = self._recurso("Cabina 2", Recurso.Tipo.SALA, orden=2)
        self.soprano = self._recurso("Soprano", Recurso.Tipo.EQUIPO)

        self.depilacion = Servicio.objects.create(
            clinica=self.clinica, nombre="Depilacion axilas", duracion_min=30,
            necesita_sala=Servicio.NecesitaSala.CUALQUIERA,
        )
        self.depilacion.equipos.set([self.soprano])
        self.facial = Servicio.objects.create(
            clinica=self.clinica, nombre="Limpieza facial", duracion_min=30,
            necesita_sala=Servicio.NecesitaSala.CUALQUIERA,
        )
        self.valoracion = Servicio.objects.create(clinica=self.clinica, nombre="Valoracion", duracion_min=30)
        self.lunes = proximo_lunes()

    # ── helpers ──
    def _sede(self, nombre):
        return Sede.objects.create(
            clinica=self.clinica, nombre=nombre, ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario=dict(HORARIO),
        )

    def _profesional(self, i):
        return User.objects.create_user(
            email=f"prof{i}-salas@example.com", password="secret123", first_name=f"Prof{i}", last_name="Laser",
            rol=User.Role.PROFESIONAL, es_profesional=True, clinica=self.clinica,
        )

    def _paciente(self, i):
        return Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento=f"77{i}",
            nombres=f"Paciente{i}", apellidos="Prueba",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono=f"30011122{i}",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )

    def _recurso(self, nombre, tipo, *, sede=None, orden=1):
        return Recurso.objects.create(clinica=self.clinica, sede=sede or self.sede, nombre=nombre, tipo=tipo, orden=orden)

    def _crear(self, n, servicio, *, inicio=None, sede=None, **extra):
        payload = {
            "paciente": str(self.pacientes[n].id),
            "sede": str((sede or self.sede).id),
            "profesional": str(self.profs[n].id),
            "servicio": str(servicio.id),
            "fecha_inicio": (inicio or a_las(self.lunes, 10)).isoformat(),
            "canal_origen": "presencial",
        }
        payload.update(extra)
        return self.client.post("/api/v1/agenda/citas/", payload, format="json")

    def _asignados(self, cita_id):
        return {
            (a.recurso.nombre, a.elegido_a_mano)
            for a in CitaRecurso.objects.filter(cita_id=cita_id).select_related("recurso")
        }

    def _slots(self, n, servicio, fecha, **extra):
        return self.client.get("/api/v1/agenda/citas/slots_disponibles/", {
            "profesional_id": str(self.profs[n].id), "sede_id": str(self.sede.id),
            "fecha": fecha.isoformat(), "servicio_id": str(servicio.id), **extra,
        })


class SinConfiguracionTests(SalasYEquiposBase):
    def test_sede_sin_salas_ni_equipos_agenda_como_siempre(self):
        otra = self._sede("Norte")
        for n in range(3):
            response = self._crear(n, self.depilacion, sede=otra)
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(response.json()["recursos"], [])
            self.assertEqual(response.json()["falta"], [])

    def test_procedimiento_que_no_necesita_nada_se_agenda_con_cabinas_llenas(self):
        self.assertEqual(self._crear(0, self.facial).status_code, 201)
        self.assertEqual(self._crear(1, self.facial).status_code, 201)
        response = self._crear(2, self.valoracion)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["recursos"], [])


class EquipoCompartidoTests(SalasYEquiposBase):
    def test_asigna_sala_y_equipo_solos(self):
        response = self._crear(0, self.depilacion)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 1", False), ("Soprano", False)})
        nombres = [r["nombre"] for r in response.json()["recursos"]]
        self.assertEqual(nombres, ["Cabina 1", "Soprano"])

    def test_dos_profesionales_no_usan_el_mismo_equipo_a_la_vez(self):
        self.assertEqual(self._crear(0, self.depilacion).status_code, 201)
        response = self._crear(1, self.depilacion)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_OCUPADO")
        self.assertEqual(response.json()["error"], "Soprano está ocupado a esa hora.")
        # Los horarios de la segunda ya no ofrecen las 10:00, pero sí las 10:30.
        horarios = self._slots(1, self.depilacion, self.lunes).json()
        self.assertNotIn(a_las(self.lunes, 10).isoformat(), horarios)
        self.assertIn(a_las(self.lunes, 10, 30).isoformat(), horarios)

    def test_dos_equipos_que_sirven_para_lo_mismo(self):
        diodo = self._recurso("Diodo", Recurso.Tipo.EQUIPO, orden=2)
        self.depilacion.equipos.add(diodo)
        self.assertEqual(self._crear(0, self.depilacion).status_code, 201)
        response = self._crear(1, self.depilacion)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 2", False), ("Diodo", False)})

    def test_cancelar_libera_el_equipo(self):
        primera = self._crear(0, self.depilacion).json()
        Cita.objects.filter(id=primera["id"]).update(estado=Cita.Estado.CANCELADA)
        self.assertEqual(self._crear(1, self.depilacion).status_code, 201)

    def test_cita_en_curso_ocupa_desde_el_inicio_real(self):
        primera = self._crear(0, self.depilacion).json()
        Cita.objects.filter(id=primera["id"]).update(
            estado=Cita.Estado.EN_CURSO, fecha_inicio_real=a_las(self.lunes, 10, 20),
        )
        response = self._crear(1, self.depilacion, inicio=a_las(self.lunes, 10, 30))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_OCUPADO")


class SalasTests(SalasYEquiposBase):
    def test_cualquier_sala_con_dos_cabinas(self):
        self.assertEqual(self._crear(0, self.facial).status_code, 201)
        self.assertEqual(self._crear(1, self.facial).status_code, 201)
        response = self._crear(2, self.facial)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "No hay una sala libre a esa hora.")

    def test_no_asistio_libera_la_sala(self):
        primera = self._crear(0, self.facial).json()
        self._crear(1, self.facial)
        Cita.objects.filter(id=primera["id"]).update(estado=Cita.Estado.NO_ASISTIO)
        self.assertEqual(self._crear(2, self.facial).status_code, 201)

    def test_solo_estas_salas(self):
        self.facial.necesita_sala = Servicio.NecesitaSala.ALGUNAS
        self.facial.save()
        self.facial.salas.set([self.cabina2])
        response = self._crear(0, self.facial)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 2", False)})
        # Con la Cabina 2 ocupada no recibe la 1, aunque esté libre.
        response = self._crear(1, self.facial)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Cabina 2 está ocupada a esa hora.")

    def test_salas_de_otra_sede_no_cuentan(self):
        norte = self._sede("Norte")
        sala_norte = self._recurso("Consultorio Norte", Recurso.Tipo.SALA, sede=norte)
        self.facial.necesita_sala = Servicio.NecesitaSala.ALGUNAS
        self.facial.save()
        self.facial.salas.set([sala_norte])
        # En la principal ninguna de sus salas está en la lista: sirve cualquiera.
        response = self._crear(0, self.facial)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 1", False)})


class ElegidoAManoTests(SalasYEquiposBase):
    def test_consulta_que_no_necesita_sala_puede_reservar_una(self):
        response = self._crear(0, self.valoracion, sala=str(self.cabina1.id))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 1", True)})
        # Bloquea la Cabina 1 para lo que la necesita.
        response = self._crear(1, self.facial)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 2", False)})
        self.assertEqual(self._crear(2, self.facial).status_code, 400)

    def test_elegir_una_sala_ocupada_falla_con_opcion_de_quitarla(self):
        self._crear(0, self.valoracion, sala=str(self.cabina1.id))
        response = self._crear(1, self.valoracion, sala=str(self.cabina1.id))
        self.assertEqual(response.status_code, 400)
        datos = response.json()
        self.assertEqual(datos["code"], "RECURSO_OCUPADO")
        self.assertIn("recurso_a_mano", datos)
        self.assertIn("quítala", datos["error"])

    def test_error_de_lo_pedido_por_el_procedimiento_no_dice_a_mano(self):
        self._crear(0, self.depilacion)
        datos = self._crear(1, self.depilacion).json()
        self.assertNotIn("recurso_a_mano", datos)

    def test_elegir_la_sala_del_procedimiento(self):
        response = self._crear(0, self.facial, sala=str(self.cabina2.id))
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 2", False)})

    def test_sala_que_no_sirve_para_el_procedimiento(self):
        self.facial.necesita_sala = Servicio.NecesitaSala.ALGUNAS
        self.facial.save()
        self.facial.salas.set([self.cabina2])
        response = self._crear(0, self.facial, sala=str(self.cabina1.id))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_INVALIDO")


class EdicionTests(SalasYEquiposBase):
    def _mover(self, cita_id, inicio, **extra):
        return self.client.patch(
            f"/api/v1/agenda/citas/{cita_id}/", {"fecha_inicio": inicio.isoformat(), **extra}, format="json",
        )

    def test_mover_conserva_la_sala_si_esta_libre(self):
        cita = self._crear(0, self.facial, sala=str(self.cabina2.id)).json()
        response = self._mover(cita["id"], a_las(self.lunes, 11))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita["id"]), {("Cabina 2", False)})

    def test_mover_reasigna_si_la_sala_esta_ocupada(self):
        cita = self._crear(0, self.facial).json()  # Cabina 1
        self._crear(1, self.facial, inicio=a_las(self.lunes, 11))  # Cabina 1 a las 11
        response = self._mover(cita["id"], a_las(self.lunes, 11))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita["id"]), {("Cabina 2", False)})

    def test_mover_falla_si_no_hay_ninguna(self):
        cita = self._crear(0, self.facial).json()
        self._crear(1, self.facial, inicio=a_las(self.lunes, 11))
        self._crear(2, self.facial, inicio=a_las(self.lunes, 11))
        response = self._mover(cita["id"], a_las(self.lunes, 11))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_OCUPADO")

    def test_cambiar_a_un_procedimiento_sin_sala_la_suelta(self):
        cita = self._crear(0, self.facial).json()
        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita['id']}/", {"servicio": str(self.valoracion.id)}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita["id"]), set())

    def test_quitar_la_sala_elegida_a_mano(self):
        cita = self._crear(0, self.valoracion, sala=str(self.cabina1.id)).json()
        response = self.client.patch(f"/api/v1/agenda/citas/{cita['id']}/", {"sala": None}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita["id"]), set())

    def test_editar_una_nota_de_una_cita_con_falta_no_falla(self):
        # Se agendaron dos a la vez antes de pedir sala; la segunda queda con falta.
        self.facial.necesita_sala = Servicio.NecesitaSala.NO
        self.facial.save()
        primera = self._crear(0, self.facial).json()
        segunda = self._crear(1, self.facial).json()
        self._crear(2, self.facial)
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.facial.id}/", {"necesita_sala": "cualquiera"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        sin_sala = [
            c for c in (primera, segunda)
            if not CitaRecurso.objects.filter(cita_id=c["id"]).exists()
        ]
        self.assertEqual(len(sin_sala), 0)
        tercera = Cita.objects.exclude(id__in=[primera["id"], segunda["id"]]).get()
        detalle = self.client.get(f"/api/v1/agenda/citas/{tercera.id}/").json()
        self.assertEqual(detalle["falta"], [{"tipo": "sala", "recursos": ["Cabina 1", "Cabina 2"]}])
        response = self.client.patch(
            f"/api/v1/agenda/citas/{tercera.id}/", {"notas_internas": "Llamar"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)


class HorarioYBloqueosTests(SalasYEquiposBase):
    def test_equipo_que_no_viene_los_lunes(self):
        HorarioRecurso.objects.create(recurso=self.soprano, dia_semana="lunes", no_disponible=True)
        response = self._crear(0, self.depilacion)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_FUERA_DE_HORARIO")
        self.assertEqual(response.json()["error"], "Soprano no está disponible ese día o a esa hora.")
        datos = self._slots(0, self.depilacion, self.lunes, detalle="1").json()
        self.assertEqual(datos["horarios"], [])
        self.assertEqual(datos["motivo"]["causa"], "fuera_de_horario")
        self.assertEqual(datos["motivo"]["recursos"], ["Soprano"])
        martes = self.lunes + timedelta(days=1)
        self.assertEqual(datos["proximo"], a_las(martes, 8).isoformat())

    def test_horario_propio_del_equipo(self):
        HorarioRecurso.objects.create(
            recurso=self.soprano, dia_semana="lunes", hora_inicio=time(14, 0), hora_fin=time(18, 0),
        )
        self.assertEqual(self._crear(0, self.depilacion).status_code, 400)
        self.assertEqual(self._crear(1, self.depilacion, inicio=a_las(self.lunes, 14)).status_code, 201)

    def test_no_disponible_bloquea_solo_ese_equipo(self):
        response = self.client.post(
            f"/api/v1/clinicas/recursos/{self.soprano.id}/no_disponible/",
            {
                "fecha_inicio": a_las(self.lunes, 8).isoformat(),
                "fecha_fin": a_las(self.lunes, 12).isoformat(),
                "motivo": "Mantenimiento",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["bloqueo"]["estado"], "aprobado")
        response = self._crear(0, self.depilacion)
        self.assertEqual(response.json()["code"], "RECURSO_BLOQUEADO")
        # No cierra la sede: lo que no usa el Soprano se agenda.
        self.assertEqual(self._crear(1, self.facial).status_code, 201)
        # Y la agenda no lo lista como bloqueo de la sede.
        bloqueos = self.client.get("/api/v1/agenda/bloqueos/", {"sede": str(self.sede.id)}).json()
        filas = bloqueos["results"] if isinstance(bloqueos, dict) else bloqueos
        self.assertEqual(filas, [])

    def test_bloqueo_pendiente_no_bloquea(self):
        BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, recurso=self.soprano,
            fecha_inicio=a_las(self.lunes, 8), fecha_fin=a_las(self.lunes, 12),
            estado=BloqueoAgenda.Estado.PENDIENTE,
        )
        self.assertEqual(self._crear(0, self.depilacion).status_code, 201)


class ReacomodoTests(SalasYEquiposBase):
    def test_previsualizar_no_guarda_y_guardar_reacomoda(self):
        self.facial.necesita_sala = Servicio.NecesitaSala.NO
        self.facial.save()
        for n in range(3):
            self.assertEqual(self._crear(n, self.facial).status_code, 201)

        response = self.client.post(
            "/api/v1/clinicas/recursos/previsualizar/",
            {"procedimiento_id": str(self.facial.id), "procedimiento": {"necesita_sala": "cualquiera"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["citas_revisadas"], 3)
        self.assertEqual(response.json()["total_sin_lugar"], 1)
        # No guardó nada.
        self.facial.refresh_from_db()
        self.assertEqual(self.facial.necesita_sala, Servicio.NecesitaSala.NO)
        self.assertFalse(CitaRecurso.objects.exists())

        self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.facial.id}/", {"necesita_sala": "cualquiera"}, format="json",
        )
        self.assertEqual(CitaRecurso.objects.count(), 2)

    def test_las_citas_de_migracion_no_ocupan(self):
        Cita.objects.create(
            paciente=self.pacientes[0], sede=self.sede, profesional=self.profs[0], servicio=self.facial,
            fecha_inicio=a_las(self.lunes, 10), fecha_fin=a_las(self.lunes, 10, 30), duracion_min=30,
            canal_confirmacion="whatsapp", es_migracion=True,
        )
        recursos.reasignar_citas_futuras([self.sede])
        self.assertFalse(CitaRecurso.objects.exists())

    def test_crear_una_sala_reacomoda_lo_agendado(self):
        self.cabina2.delete()
        self.assertEqual(self._crear(0, self.facial).status_code, 201)
        self.facial.necesita_sala = Servicio.NecesitaSala.NO
        self.facial.save()
        self.assertEqual(self._crear(1, self.facial).status_code, 201)  # sin sala
        self.facial.necesita_sala = Servicio.NecesitaSala.CUALQUIERA
        self.facial.save()
        response = self.client.post(
            "/api/v1/clinicas/recursos/",
            {"sede": str(self.sede.id), "nombre": "Cabina 2", "tipo": "sala", "orden": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(CitaRecurso.objects.filter(recurso__tipo="sala").count(), 2)


class ExigenciasTests(SalasYEquiposBase):
    def test_sesion_con_dos_procedimientos_de_equipos_distintos(self):
        radiofrecuencia = self._recurso("Radiofrecuencia", Recurso.Tipo.EQUIPO, orden=2)
        rf = Servicio.objects.create(clinica=self.clinica, nombre="RF", duracion_min=30)
        rf.equipos.set([radiofrecuencia])
        exigencias = recursos.exigencias_de([self.depilacion, rf], recursos.recursos_activos(self.sede))
        tipos = sorted((e.tipo, len(e.candidatos)) for e in exigencias)
        self.assertEqual(tipos, [("equipo", 1), ("equipo", 1), ("sala", 2)])

    def test_intersecion_de_salas(self):
        a = Servicio.objects.create(
            clinica=self.clinica, nombre="A", duracion_min=30, necesita_sala=Servicio.NecesitaSala.ALGUNAS,
        )
        a.salas.set([self.cabina1, self.cabina2])
        b = Servicio.objects.create(
            clinica=self.clinica, nombre="B", duracion_min=30, necesita_sala=Servicio.NecesitaSala.ALGUNAS,
        )
        b.salas.set([self.cabina2])
        exigencias = recursos.exigencias_de([a, b], recursos.recursos_activos(self.sede))
        self.assertEqual(exigencias, [recursos.Exigencia("sala", (self.cabina2.id,))])


class ApiRecursosTests(SalasYEquiposBase):
    def test_crear_equipo_con_dias_y_procedimientos(self):
        response = self.client.post(
            "/api/v1/clinicas/recursos/",
            {
                "sede": str(self.sede.id), "nombre": "  Diodo  ", "tipo": "equipo",
                "horarios": [{"dia_semana": "lunes", "no_disponible": True}],
                "procedimientos": [str(self.depilacion.id)],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        diodo = Recurso.objects.get(nombre="Diodo")
        self.assertIn(diodo, self.depilacion.equipos.all())
        self.assertTrue(HorarioRecurso.objects.filter(recurso=diodo, dia_semana="lunes", no_disponible=True).exists())
        self.assertEqual(response.json()["total_procedimientos"], 1)

    def test_nombre_repetido_en_la_sede(self):
        response = self.client.post(
            "/api/v1/clinicas/recursos/",
            {"sede": str(self.sede.id), "nombre": "cabina 1", "tipo": "sala"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_profesional_lista_pero_no_crea(self):
        self.client.force_authenticate(self.profs[0])
        self.assertEqual(self.client.get("/api/v1/clinicas/recursos/").status_code, 200)
        response = self.client.post(
            "/api/v1/clinicas/recursos/",
            {"sede": str(self.sede.id), "nombre": "Cabina 9", "tipo": "sala"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_no_se_elimina_con_citas(self):
        self._crear(0, self.facial)
        response = self.client.delete(f"/api/v1/clinicas/recursos/{self.cabina1.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_CON_CITAS")

    def test_procedimiento_solo_algunas_salas_exige_elegir(self):
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.facial.id}/", {"necesita_sala": "algunas"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.facial.id}/",
            {"necesita_sala": "algunas", "salas": [str(self.cabina2.id)]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([s["nombre"] for s in response.json()["salas_detalle"]], ["Cabina 2"])

    def test_recursos_libres(self):
        self._crear(0, self.depilacion)
        response = self.client.get("/api/v1/agenda/citas/recursos_libres/", {
            "sede_id": str(self.sede.id), "fecha_inicio": a_las(self.lunes, 10).isoformat(),
            "servicio_id": str(self.facial.id),
        })
        self.assertEqual(response.status_code, 200, response.content)
        datos = response.json()
        self.assertEqual(len(datos["necesarios"]), 1)
        self.assertEqual([r["nombre"] for r in datos["necesarios"][0]["libres"]], ["Cabina 2"])
        self.assertEqual(datos["necesarios"][0]["sugerido"], str(self.cabina2.id))
        # El Soprano está ocupado: no aparece entre los otros libres.
        self.assertEqual(datos["otros"], [])
