"""Regresiones del paso 6 de la verificación transversal: agenda."""

import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import BloqueoAgenda, Cita
from apps.clinicas.models import Servicio
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.users.models import Permiso, Rol, RolPermiso


class VerificacionPaso6Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.inicio = self.proximo_dia_habil_10am()

    def _cita(self, *, inicio=None, estado=Cita.Estado.PENDIENTE, duracion=30, servicio=None, **extra):
        inicio = inicio or self.inicio
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional,
            servicio=servicio, servicio_nombre=servicio.nombre if servicio else "",
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=duracion), duracion_min=duracion,
            estado=estado, canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL, **extra,
        )

    def _bloqueo(self, inicio, fin, **alcance):
        return BloqueoAgenda.objects.create(
            clinica=self.clinica, fecha_inicio=inicio, fecha_fin=fin,
            estado=BloqueoAgenda.Estado.APROBADO, **alcance,
        )

    def _slots(self, fecha):
        return self.client.get("/api/v1/agenda/citas/slots_disponibles/", {
            "profesional_id": self.profesional.id, "sede_id": self.sede.id,
            "fecha": fecha.isoformat(), "duracion_min": 30,
        })

    # ── M3-02: bloqueos por rango de fechas ────────────────────────────────
    def test_m302_los_bloqueos_nuevos_aparecen_aunque_haya_muchos_antiguos(self):
        viejo = self.inicio - timedelta(days=200)
        for i in range(30):
            self._bloqueo(viejo + timedelta(days=i), viejo + timedelta(days=i, hours=1), sede=self.sede)
        nuevo = self._bloqueo(self.inicio, self.inicio + timedelta(hours=2), sede=self.sede)
        dia = self.inicio.date().isoformat()
        response = self.client.get("/api/v1/agenda/bloqueos/", {"desde": dia, "hasta": dia})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([b["id"] for b in response.json()["results"]], [str(nuevo.id)])

    def test_m302_el_rango_incluye_bloqueos_de_varios_dias_que_empezaron_antes(self):
        largo = self._bloqueo(self.inicio - timedelta(days=3), self.inicio + timedelta(days=3))
        dia = self.inicio.date().isoformat()
        response = self.client.get("/api/v1/agenda/bloqueos/", {"desde": dia, "hasta": dia})
        self.assertIn(str(largo.id), [b["id"] for b in response.json()["results"]])

    def test_m302_fecha_mal_escrita_responde_400(self):
        self.assertEqual(self.client.get("/api/v1/agenda/bloqueos/", {"desde": "ayer"}).status_code, 400)

    # ── M3-03: los bloqueos de sede, clínica y varios días sí bloquean ─────
    def test_m303_bloqueo_de_toda_la_sede_quita_los_horarios(self):
        self._bloqueo(self.inicio, self.inicio + timedelta(hours=1), sede=self.sede)
        slots = self._slots(self.inicio.date()).json()
        self.assertNotIn(self.inicio.isoformat(), slots)
        self.assertIn((self.inicio + timedelta(hours=1)).isoformat(), slots)

    def test_m303_el_segundo_dia_de_un_cierre_de_la_clinica_no_tiene_horarios(self):
        self._bloqueo(self.inicio - timedelta(days=1), self.inicio + timedelta(days=1))
        self.assertEqual(self._slots(self.inicio.date()).json(), [])

    def test_m303_no_se_crea_una_cita_dentro_de_un_bloqueo_de_sede(self):
        self._bloqueo(self.inicio - timedelta(hours=2), self.inicio + timedelta(hours=2), sede=self.sede)
        response = self.client.post("/api/v1/agenda/citas/", {
            "paciente": self.paciente.id, "sede": self.sede.id, "profesional": self.profesional.id,
            "servicio": self.servicio.id, "fecha_inicio": self.inicio.isoformat(), "canal_origen": "presencial",
        }, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json().get("code"), "HORARIO_BLOQUEADO")

    def test_m303_no_se_mueve_una_cita_dentro_de_un_bloqueo_de_la_clinica(self):
        cita = self._cita()
        destino = self.inicio + timedelta(hours=3)
        self._bloqueo(destino, destino + timedelta(hours=1))
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"fecha_inicio": destino.isoformat()}, format="json")
        self.assertEqual(response.status_code, 400, response.content)

    # ── M3-05: reprogramar citas confirmadas, libres y de paquete ──────────
    def test_m305_se_reprograma_una_cita_confirmada_de_consulta_libre(self):
        cita = self._cita(estado=Cita.Estado.CONFIRMADA, duracion=45)
        destino = self.inicio + timedelta(hours=2)
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"fecha_inicio": destino.isoformat()}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        cita.refresh_from_db()
        self.assertEqual(cita.fecha_inicio, destino)
        self.assertEqual(cita.duracion_min, 45)
        self.assertEqual(cita.estado, Cita.Estado.CONFIRMADA)

    # ── M3-06: el estado no se cambia por PATCH ────────────────────────────
    def test_m306_patch_no_cambia_el_estado(self):
        cita = self._cita()
        self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"estado": "completada"}, format="json")
        cita.refresh_from_db()
        self.assertEqual(cita.estado, Cita.Estado.PENDIENTE)

    def test_m306_una_cita_cerrada_no_se_edita(self):
        cita = self._cita(estado=Cita.Estado.CANCELADA)
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"notas_internas": "x"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get("code"), "CITA_CERRADA")

    # ── M3-11: zona horaria ────────────────────────────────────────────────
    def test_m311_cambiar_profesional_en_una_cita_de_la_noche(self):
        dia = self.inicio.strftime("%A")
        horario = {k: ["08:00", "21:00"] for k in ("lunes", "martes", "miercoles", "jueves", "viernes")}
        self.sede.horario = horario
        self.sede.save(update_fields=["horario"])
        otro = User.objects.create_user(
            email="otro@test.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        noche = self.inicio.replace(hour=19, minute=30)
        cita = self._cita(inicio=noche, estado=Cita.Estado.CONFIRMADA)
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"profesional": str(otro.id)}, format="json")
        self.assertEqual(response.status_code, 200, (dia, response.content))

    # ── M3-12 y M3-13: recordatorio y nombre al editar ─────────────────────
    def test_m312_reprogramar_reinicia_el_recordatorio(self):
        cita = self._cita(
            recordatorio_enviado=True, recordatorio_manual_pendiente=True,
            estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO,
        )
        destino = self.inicio + timedelta(hours=2)
        self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"fecha_inicio": destino.isoformat()}, format="json")
        cita.refresh_from_db()
        self.assertFalse(cita.recordatorio_enviado)
        self.assertFalse(cita.recordatorio_manual_pendiente)
        self.assertEqual(cita.estado_confirmacion, Cita.EstadoConfirmacion.SIN_ENVIAR)

    def test_m312_editar_otra_cosa_no_toca_el_recordatorio(self):
        cita = self._cita(recordatorio_enviado=True)
        self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"notas_internas": "trae exámenes"}, format="json")
        cita.refresh_from_db()
        self.assertTrue(cita.recordatorio_enviado)

    def test_m313_cambiar_el_procedimiento_cambia_el_nombre(self):
        cita = self._cita(servicio=self.servicio)
        otro = Servicio.objects.create(
            clinica=self.clinica, nombre="Peeling", descripcion="", duracion_min=30, precio="1000.00",
        )
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"servicio": str(otro.id)}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["servicio_nombre"], "Peeling")

    # ── Confirmar es parte de gestionar la agenda ──────────────────────────
    def test_quien_agenda_puede_confirmar_sin_permiso_de_estados(self):
        rol = Rol.objects.create(clinica=self.clinica, slug=f"rol-{uuid.uuid4().hex[:6]}", nombre="Agendador")
        for clave in ("agenda.citas.ver", "agenda.citas.crear"):
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        usuario = User.objects.create_user(
            email="agenda@test.com", password="Secret123!", first_name="Ag", last_name="Enda",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(usuario)
        cita = self._cita()
        confirmar = self.client.post(f"/api/v1/agenda/citas/{cita.id}/cambiar_estado/", {"estado": "confirmada"}, format="json")
        self.assertEqual(confirmar.status_code, 200, confirmar.content)
        cancelar = self.client.post(
            f"/api/v1/agenda/citas/{cita.id}/cambiar_estado/",
            {"estado": "cancelada", "motivo_cancelacion": "x"}, format="json",
        )
        self.assertEqual(cancelar.status_code, 403)

    # ── Editar una cita nunca corre su hora (revisión del 13/10/2026) ──────
    def _horas(self, cita):
        cita.refresh_from_db()
        return cita.fecha_inicio, cita.fecha_fin

    def test_editar_una_nota_no_cambia_las_horas(self):
        cita = self._cita(duracion=45)
        antes = self._horas(cita)
        self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"notas_internas": "trae exámenes"}, format="json")
        self.assertEqual(self._horas(cita), antes)

    def test_cita_vieja_sin_duracion_no_queda_con_fin_igual_al_inicio(self):
        cita = self._cita(duracion=40)
        Cita.objects.filter(pk=cita.pk).update(duracion_min=None)
        antes = self._horas(cita)
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"notas_internas": "x"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._horas(cita), antes)

    def test_reprogramar_una_cita_sin_duracion_conserva_lo_que_dura(self):
        cita = self._cita(duracion=40)
        Cita.objects.filter(pk=cita.pk).update(duracion_min=None)
        destino = self.inicio + timedelta(hours=2)
        self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"fecha_inicio": destino.isoformat()}, format="json")
        self.assertEqual(self._horas(cita), (destino, destino + timedelta(minutes=40)))

    def test_cambiar_profesional_no_cambia_las_horas(self):
        otro = User.objects.create_user(
            email="otro2@test.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        cita = self._cita(estado=Cita.Estado.CONFIRMADA)
        antes = self._horas(cita)
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"profesional": str(otro.id)}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._horas(cita), antes)

    def test_reenviar_la_hora_que_devuelve_la_api_no_la_corre(self):
        # El formulario de edición reenvía la hora tal como llega ("...-05:00").
        cita = self._cita(servicio=self.servicio)
        antes = self._horas(cita)
        detalle = self.client.get(f"/api/v1/agenda/citas/{cita.id}/").json()
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {
            "sede": detalle["sede"], "profesional": detalle["profesional"], "servicio": detalle["servicio"],
            "fecha_inicio": detalle["fecha_inicio"], "canal_origen": detalle["canal_origen"],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._horas(cita), antes)

    def test_cambiar_la_duracion_del_catalogo_no_mueve_citas_ya_agendadas(self):
        cita = self._cita(servicio=self.servicio, duracion=30)
        antes = self._horas(cita)
        self.servicio.duracion_min = 90
        self.servicio.save(update_fields=["duracion_min"])
        self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {
            "servicio": str(self.servicio.id), "notas_internas": "x",
        }, format="json")
        self.assertEqual(self._horas(cita), antes)

    # ── M3-25: quien ve la agenda solicita bloqueos, no los aprueba ─────────
    def _solo_ver_agenda(self):
        rol = Rol.objects.create(clinica=self.clinica, slug=f"rol-{uuid.uuid4().hex[:6]}", nombre="Solo agenda")
        RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave="agenda.citas.ver"))
        usuario = User.objects.create_user(
            email="ver@test.com", password="Secret123!", first_name="Ve", last_name="Agenda",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(usuario)
        return usuario

    def test_m325_quien_ve_la_agenda_solicita_un_bloqueo_pendiente(self):
        self._solo_ver_agenda()
        response = self.client.post("/api/v1/agenda/bloqueos/", {
            "sede": str(self.sede.id), "profesional": str(self.profesional.id),
            "fecha_inicio": self.inicio.isoformat(), "fecha_fin": (self.inicio + timedelta(hours=4)).isoformat(),
            "motivo": "Cita médica",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["estado"], "pendiente")
        # La solicitud no bloquea la agenda mientras no se apruebe.
        self.assertIn(self.inicio.isoformat(), self._slots(self.inicio.date()).json())
        # Ve su propia solicitud aunque no tenga "ver bloqueos".
        ids = [b["id"] for b in self.client.get("/api/v1/agenda/bloqueos/").json()["results"]]
        self.assertIn(response.json()["id"], ids)

    def test_m325_quien_solo_ve_la_agenda_no_aprueba_ni_borra_bloqueos_aprobados(self):
        aprobado = self._bloqueo(self.inicio, self.inicio + timedelta(hours=1), sede=self.sede)
        pendiente = BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, fecha_inicio=self.inicio,
            fecha_fin=self.inicio + timedelta(hours=1), creado_por=self.admin,
        )
        self._solo_ver_agenda()
        self.assertEqual(self.client.post(f"/api/v1/agenda/bloqueos/{pendiente.id}/aprobar/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/agenda/bloqueos/{aprobado.id}/").status_code, 403)

    # ── M3-18: bloqueo encima de citas (paso 7b) ───────────────────────────
    def _crear_bloqueo(self, **extra):
        return self.client.post("/api/v1/agenda/bloqueos/", {
            "sede": str(self.sede.id), "fecha_inicio": (self.inicio - timedelta(hours=1)).isoformat(),
            "fecha_fin": (self.inicio + timedelta(hours=2)).isoformat(), "motivo": "Fumigación", **extra,
        }, format="json")

    def test_m318_crear_un_bloqueo_sobre_citas_las_muestra_y_pide_confirmar(self):
        cita = self._cita()
        response = self._crear_bloqueo()
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["code"], "BLOQUEO_CON_CITAS")
        self.assertEqual([c["id"] for c in response.json()["citas"]], [str(cita.id)])
        self.assertFalse(BloqueoAgenda.objects.exists())
        confirmado = self._crear_bloqueo(confirmar_citas_afectadas=True)
        self.assertEqual(confirmado.status_code, 201, confirmado.content)
        cita.refresh_from_db()
        self.assertEqual(cita.estado, Cita.Estado.PENDIENTE)

    def test_m318_sin_citas_el_bloqueo_se_crea_directo(self):
        self.assertEqual(self._crear_bloqueo().status_code, 201)

    # ── M3-21: confirmación por enlace (paso 7b) ───────────────────────────
    def test_m321_no_se_confirma_por_enlace_una_cita_cancelada(self):
        from apps.agenda.confirmacion import generar_token

        token = generar_token(self._cita(estado=Cita.Estado.CANCELADA))
        self.client.force_authenticate(None)
        response = self.client.get(f"/api/v1/agenda/confirmar/{token.token}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("ya no está activa", response.json()["error"])

    def test_m321_una_cita_sin_procedimiento_se_confirma_sin_error(self):
        from apps.agenda.confirmacion import generar_token

        cita = self._cita()
        token = generar_token(cita)
        self.client.force_authenticate(None)
        response = self.client.get(f"/api/v1/agenda/confirmar/{token.token}/")
        self.assertEqual(response.status_code, 200, response.content)
        cita.refresh_from_db()
        self.assertEqual(cita.estado, Cita.Estado.CONFIRMADA)

    # ── M3-29 ──────────────────────────────────────────────────────────────
    def test_m329_slots_con_fecha_mal_escrita_responde_400(self):
        response = self.client.get("/api/v1/agenda/citas/slots_disponibles/", {
            "profesional_id": self.profesional.id, "sede_id": self.sede.id, "fecha": "mal", "duracion_min": 30,
        })
        self.assertEqual(response.status_code, 400)
