"""Regresiones de la QA por perfiles (docs/verificacion/qa-perfiles.md)."""

import uuid
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.caja.models import Caja, SesionCaja
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.cotizaciones.models import Cotizacion
from apps.users.models import Permiso, Rol, RolPermiso


class QAPerfilesTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.clinica.modo_puesta_en_marcha = True
        self.clinica.save(update_fields=["modo_puesta_en_marcha"])
        self.client = APIClient()

    def _con_rol(self, claves, *, email=None, es_profesional=False):
        rol = Rol.objects.create(clinica=self.clinica, slug=f"rol-{uuid.uuid4().hex[:6]}", nombre="Personalizado")
        for clave in claves:
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        user = User.objects.create_user(
            email=email or f"{uuid.uuid4().hex[:8]}@test.com", password="Secret123!", first_name="Cu",
            last_name="Stom", rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
            es_profesional=es_profesional,
        )
        self.client.force_authenticate(user)
        return user

    def _cita(self, profesional, *, estado=Cita.Estado.PENDIENTE, minutos=30):
        inicio = timezone.now() + timedelta(minutes=minutos)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=profesional, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=estado, canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )

    # ── QA-03: puesta en marcha, solo quien crea cotizaciones ──────────────
    def test_qa03_sin_cotizar_no_ve_ni_carga_la_puesta_en_marcha(self):
        self._con_rol(["agenda.citas.ver"])
        self.assertEqual(self.client.get("/api/v1/migracion/lotes/").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/migracion/paciente-en-curso/", {}, format="json").status_code, 403)

    def test_qa03_quien_cotiza_ve_la_puesta_en_marcha(self):
        self._con_rol(["cotizaciones.ver", "cotizaciones.gestionar"])
        self.assertEqual(self.client.get("/api/v1/migracion/lotes/").status_code, 200)

    # ── QA-04: registrar gastos abre la caja; cerrarla no ──────────────────
    def test_qa04_quien_registra_gastos_abre_la_caja_pero_no_la_cierra(self):
        self._con_rol(["caja.gastos.ver", "caja.gastos.registrar", "caja.categorias.ver"])
        caja = Caja.objects.create(sede=self.sede, saldo_inicial=Decimal("0"))
        abrir = self.client.post("/api/v1/caja/sesiones/abrir/", {"caja": str(caja.id)}, format="json")
        self.assertEqual(abrir.status_code, 201, abrir.content)
        sesion = SesionCaja.objects.get(caja=caja)
        cerrar = self.client.post(f"/api/v1/caja/sesiones/{sesion.id}/cerrar/", {"efectivo_contado": 0}, format="json")
        self.assertEqual(cerrar.status_code, 403)

    # ── QA-09: antecedentes, como las evoluciones: quien atiende los lee y los
    # edita en cualquier paciente de la clínica, sin cita con él (29/10/2026) ──
    def test_qa09_quien_atiende_lee_y_edita_antecedentes_de_paciente_sin_cita(self):
        self._con_rol(["pacientes.ver"], es_profesional=True)
        leer = self.client.get(f"/api/v1/pacientes/{self.paciente.id}/antecedentes/")
        self.assertIn(leer.status_code, {200, 404}, leer.content)
        editar = self.client.patch(
            f"/api/v1/pacientes/{self.paciente.id}/antecedentes/", {"alergias": "Latex"}, format="json",
        )
        self.assertEqual(editar.status_code, 200, editar.content)

    def test_qa09_sin_el_check_ni_el_permiso_no_edita_antecedentes(self):
        self._con_rol(["pacientes.ver", "pacientes.antecedentes.ver"])
        editar = self.client.patch(f"/api/v1/pacientes/{self.paciente.id}/antecedentes/", {}, format="json")
        self.assertEqual(editar.status_code, 403)

    # ── QA-02: el asistente de llegada para quien atiende su cita ──────────
    def test_qa02_quien_atiende_hace_el_checkin_de_su_cita_y_no_de_otra(self):
        user = self._con_rol(["agenda.citas.ver"], es_profesional=True)
        propia = self._cita(user, estado=Cita.Estado.CONFIRMADA)
        ajena = self._cita(self.profesional, estado=Cita.Estado.CONFIRMADA)
        r_propia = self.client.post(f"/api/v1/agenda/citas/{propia.id}/iniciar_checkin/", {}, format="json")
        r_ajena = self.client.post(f"/api/v1/agenda/citas/{ajena.id}/iniciar_checkin/", {}, format="json")
        # La propia pasa el permiso (sin webhook configurado responde 400, no 403).
        self.assertNotEqual(r_propia.status_code, 403, r_propia.content)
        self.assertEqual(r_ajena.status_code, 403)

    # ── QA-06: quien atiende sin "Ver la agenda" ve solo sus citas ─────────
    def test_qa06_quien_atiende_sin_ver_agenda_lista_solo_sus_citas(self):
        user = self._con_rol(["pacientes.ver"], es_profesional=True)
        propia = self._cita(user)
        self._cita(self.profesional, minutos=90)
        r = self.client.get("/api/v1/agenda/citas/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([c["id"] for c in r.json()["results"]], [str(propia.id)])

    def test_qa07_el_profesional_que_no_agenda_ve_solo_su_agenda(self):
        # Rol de sistema Profesional: ve la agenda pero no agenda.
        self.client.force_authenticate(self.profesional)
        otro = self._con_rol(["agenda.citas.ver"], es_profesional=True)
        propia = self._cita(self.profesional)
        ajena = self._cita(otro, minutos=90)
        self.client.force_authenticate(self.profesional)
        ids = [c["id"] for c in self.client.get("/api/v1/agenda/citas/").json()["results"]]
        self.assertEqual(ids, [str(propia.id)])
        # En las pantallas del paciente ve todo su historial, y abre la cita de un colega.
        del_paciente = self.client.get("/api/v1/agenda/citas/", {"paciente": str(self.paciente.id)}).json()["results"]
        self.assertEqual({c["id"] for c in del_paciente}, {str(propia.id), str(ajena.id)})
        self.assertEqual(self.client.get(f"/api/v1/agenda/citas/{ajena.id}/").status_code, 200)

    def test_qa07_quien_agenda_ve_todas_las_citas_aunque_atienda(self):
        propia = self._cita(self.profesional)
        user = self._con_rol(["agenda.citas.ver", "agenda.citas.crear"], es_profesional=True)
        mia = self._cita(user, minutos=90)
        ids = {c["id"] for c in self.client.get("/api/v1/agenda/citas/").json()["results"]}
        self.assertEqual(ids, {str(propia.id), str(mia.id)})

    def test_qa06_sin_ver_agenda_ni_atender_no_lista_citas(self):
        self._con_rol(["pacientes.ver"])
        self.assertEqual(self.client.get("/api/v1/agenda/citas/").status_code, 403)

    def test_qa06_quien_agenda_ve_los_paquetes_vendidos_del_paciente(self):
        vendida = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.profesional, sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        self._con_rol(["agenda.citas.ver", "agenda.citas.crear"], es_profesional=True)
        r = self.client.get("/api/v1/cotizaciones/", {"paciente": str(self.paciente.id), "estado": "aceptada"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([c["id"] for c in r.json()["results"]], [str(vendida.id)])
        self.assertEqual(self.client.get(f"/api/v1/cotizaciones/{vendida.id}/sesiones/").status_code, 200)
        # El listado comercial sigue cerrado sin "ver cotizaciones".
        self.assertEqual(self.client.get("/api/v1/cotizaciones/").status_code, 403)

    def test_qa06_quien_cotiza_lista_insumos_para_obsequios(self):
        self._con_rol(["cotizaciones.ver", "cotizaciones.gestionar"])
        self.assertEqual(self.client.get("/api/v1/inventario/insumos/").status_code, 200)

    # ── QA-01: una URL de archivo rota no tumba la respuesta ───────────────
    def test_qa01_url_de_archivo_rota_devuelve_vacio(self):
        from apps.core.storage import ArchivosS3Storage

        storage = ArchivosS3Storage()
        with mock.patch("storages.backends.s3boto3.S3Boto3Storage.url", side_effect=ValueError("Invalid endpoint: ")):
            self.assertEqual(storage.url("pacientes/foto.jpg"), "")
