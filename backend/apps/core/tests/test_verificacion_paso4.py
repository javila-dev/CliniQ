"""Regresiones del paso 4 de la verificación transversal: roles personalizados y permisos."""

import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import BloqueoAgenda
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.views import user_can_manage_order_templates
from apps.users.authorization import get_user_permission_keys
from apps.users.models import Permiso, Rol, RolPermiso
from apps.users.permissions_catalog import CAPABILITY_PERMISSIONS, PERMISSION_CATALOG, ROLE_PERMISSION_DEFAULTS


class VerificacionPaso4Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()

    def _con_rol(self, claves, *, email="custom@test.com", es_profesional=False):
        """Usuario con un rol personalizado (rol fijo oculto: recepcion)."""
        rol = Rol.objects.create(clinica=self.clinica, slug=f"rol-{uuid.uuid4().hex[:6]}", nombre="Personalizado")
        for clave in claves:
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        user = User.objects.create_user(
            email=email, password="Secret123!", first_name="Cu", last_name="Stom",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol, es_profesional=es_profesional,
        )
        self.client.force_authenticate(user)
        return user

    # ── T-03: chequeos por rol fijo ─────────────────────────────────────────
    def test_m004_editar_clinica_guarda_los_ajustes_de_configuracion(self):
        self._con_rol(["clinicas.ver", "clinicas.editar"])
        for url in ("/api/v1/configuracion/wizard/", "/api/v1/configuracion/cartera/", "/api/v1/configuracion/registro-publico/"):
            response = self.client.patch(url, {}, format="json")
            self.assertEqual(response.status_code, 200, (url, response.content))

    def test_m005_solo_ver_la_agenda_no_crea_tratamientos(self):
        self._con_rol(["agenda.citas.ver"])
        response = self.client.post("/api/v1/protocolos/tratamientos/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_m003_antecedentes_con_el_permiso_aunque_el_rol_sea_personalizado(self):
        self._con_rol(["pacientes.ver", "pacientes.antecedentes.ver"])
        response = self.client.get(f"/api/v1/pacientes/{self.paciente.id}/antecedentes/")
        # 404 = "Sin antecedentes registrados": el permiso pasó (antes era 403).
        self.assertIn(response.status_code, {200, 404}, response.content)
        self.assertNotEqual(response.json().get("code"), "FORBIDDEN")

    def test_m023_plantillas_de_ordenes_con_editar_clinica(self):
        usuario = self._con_rol(["clinicas.editar"])
        self.assertTrue(user_can_manage_order_templates(usuario))

    def test_m025_el_selector_de_roles_no_exige_gestionar_roles(self):
        self._con_rol(["colaboradores.ver", "colaboradores.gestionar"])
        self.assertEqual(self.client.get("/api/v1/usuarios/roles/").status_code, 200)

    def test_m607_quien_registra_gastos_consulta_la_caja_abierta(self):
        self._con_rol(["caja.gastos.ver", "caja.gastos.registrar"])
        response = self.client.get(f"/api/v1/caja/sesiones/actual/?sede={self.sede.id}")
        self.assertNotEqual(response.status_code, 403)

    # ── Decisiones del usuario ──────────────────────────────────────────────
    def test_revertir_una_carga_exige_permiso(self):
        self.clinica.modo_puesta_en_marcha = True
        self.clinica.save(update_fields=["modo_puesta_en_marcha"])
        self._con_rol(["agenda.citas.ver"])
        response = self.client.post(f"/api/v1/migracion/lotes/{uuid.uuid4()}/revertir/")
        self.assertEqual(response.status_code, 403)

    def test_el_profesional_de_sistema_no_ve_reportes_financieros(self):
        self.assertNotIn("reportes.ver_financieros", ROLE_PERMISSION_DEFAULTS["profesional"])
        self.assertNotIn("reportes.ver_financieros", get_user_permission_keys(self.profesional))

    # ── T-06: catálogo ──────────────────────────────────────────────────────
    def test_cada_capacidad_de_gestionar_incluye_su_ver(self):
        self.assertIn("servicios.ver", CAPABILITY_PERMISSIONS["servicios.gestionar"])
        self.assertIn("configuracion.formas_pago.ver", CAPABILITY_PERMISSIONS["config.formas_pago"])
        self.assertIn("pacientes.ver", CAPABILITY_PERMISSIONS["pacientes.gestionar"])

    def test_permisos_sin_efecto_eliminados(self):
        claves = {p[0] for p in PERMISSION_CATALOG}
        for clave in ("caja.gastos.aprobar", "notificaciones.email.enviar", "agenda.citas.confirmar_manual"):
            self.assertNotIn(clave, claves)
            self.assertFalse(Permiso.objects.filter(clave=clave).exists())

    def test_m317_crear_bloqueo_no_alcanza_para_borrar_uno_aprobado(self):
        inicio = timezone.now() + timedelta(days=3)
        bloqueo = BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, fecha_inicio=inicio, fecha_fin=inicio + timedelta(hours=1),
            estado=BloqueoAgenda.Estado.APROBADO, creado_por=self.admin,
        )
        self._con_rol(["agenda.citas.ver", "agenda.crear_bloqueo"])
        self.assertEqual(self.client.delete(f"/api/v1/agenda/bloqueos/{bloqueo.id}/").status_code, 403)
        self.assertTrue(BloqueoAgenda.objects.filter(pk=bloqueo.pk).exists())

    # ── M0-18: contraseña ───────────────────────────────────────────────────
    def test_m018_cambiar_la_propia_pide_la_actual_y_una_clave_fuerte(self):
        self.client.force_authenticate(self.admin)
        url = f"/api/v1/usuarios/{self.admin.id}/cambiar_password/"
        self.assertEqual(self.client.post(url, {"nueva_password": "Nueva*Clave1"}, format="json").status_code, 400)
        self.assertEqual(
            self.client.post(url, {"nueva_password": "12345678", "password_actual": "Secret123!"}, format="json").status_code,
            400,
        )
        ok = self.client.post(url, {"nueva_password": "Nueva*Clave1", "password_actual": "Secret123!"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)

    # ── M5-27 ───────────────────────────────────────────────────────────────
    def test_m527_me_dice_si_ve_solo_su_actividad(self):
        self.client.force_authenticate(self.profesional)
        self.assertTrue(self.client.get("/api/v1/auth/me/").json()["ve_solo_su_actividad_comercial"])
        self.client.force_authenticate(self.admin)
        self.assertFalse(self.client.get("/api/v1/auth/me/").json()["ve_solo_su_actividad_comercial"])
