"""Regresiones del paso 3 de la verificación transversal: legal y seguridad."""

import base64
import io
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, FormaDePago, Sede
from apps.cobros.models import Cobro
from apps.consentimientos.models import Consentimiento
from apps.consentimientos.services import validar_firma_dibujada
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import ConsentimientoInformado
from apps.inventario.models import Insumo
from apps.pacientes.models import Paciente
from apps.users.models import Permiso, Rol, RolPermiso


def png_firma():
    """PNG mínimo válido (1x1) en data URI, del tamaño de una firma real."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGBA", (300, 120), (255, 255, 255, 0)).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


class VerificacionPaso3Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        cache.clear()
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        # Otra clínica, para las pruebas de aislamiento.
        self.otra = Clinica.objects.create(nombre="Otra", nit="900000999")
        self.sede_otra = Sede.objects.create(
            clinica=self.otra, nombre="Ajena", ciudad="Cali", direccion="Calle 9", telefono="3000000099",
        )

    def _recepcion(self, email="rece@test.com"):
        return User.objects.create_user(
            email=email, password="Secret123!", first_name="Re", last_name="Ce",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )

    def _rol(self, slug, claves):
        rol = Rol.objects.create(clinica=self.clinica, slug=slug, nombre=slug, es_sistema=False)
        for clave in claves:
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        return rol

    # ── M4-01 ──────────────────────────────────────────────────────────────
    def test_m401_un_consentimiento_no_se_marca_firmado_por_patch(self):
        consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="general", documenso_template_token="tpl",
        )
        response = self.client.patch(
            f"/api/v1/historia-clinica/consentimientos/{consentimiento.id}/",
            {"firmado": True, "fecha_firma": str(date.today())},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        consentimiento.refresh_from_db()
        self.assertFalse(consentimiento.firmado)
        self.assertIsNone(consentimiento.fecha_firma)

    def test_m401_firmado_no_se_desfirma_para_borrarlo(self):
        consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="general", documenso_template_token="tpl",
            firmado=True, fecha_firma=date.today(),
        )
        url = f"/api/v1/historia-clinica/consentimientos/{consentimiento.id}/"
        self.client.patch(url, {"firmado": False}, format="json")
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertTrue(ConsentimientoInformado.objects.filter(pk=consentimiento.pk).exists())

    # ── M4-05 ──────────────────────────────────────────────────────────────
    def test_m405_completar_firma_sin_confirmacion_de_documenso(self):
        consentimiento = ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="general", documenso_template_token="tpl",
            documenso_document_id="doc-1",
        )
        url = f"/api/v1/historia-clinica/consentimientos/{consentimiento.id}/completar_firma/"
        with mock.patch("apps.consentimientos.services.ESPERA_CONFIRMAR_FIRMA_SEG", 0), mock.patch(
            "apps.historia_clinica.views.verificar_firma_consentimiento_en_documenso", return_value=False,
        ):
            response = self.client.patch(url, {"documenso_document_id": "doc-1"}, format="json")
        self.assertEqual(response.status_code, 409)
        consentimiento.refresh_from_db()
        self.assertFalse(consentimiento.firmado)

    # ── M4-04 ──────────────────────────────────────────────────────────────
    def test_m404_la_firma_dibujada_es_obligatoria_y_valida(self):
        self.assertTrue(validar_firma_dibujada(png_firma()).startswith("data:image/png;base64,"))
        for mala in ("", "hola", "data:image/png;base64,no-es-base64!", "data:image/png;base64," + base64.b64encode(b"x" * 200).decode()):
            with self.assertRaises(ValueError):
                validar_firma_dibujada(mala)

    def test_m404_firmar_por_enlace_sin_firma_se_rechaza(self):
        inicio = timezone.now() + timedelta(days=1)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=self.servicio, profesional=self.profesional,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=Cita.Estado.PENDIENTE,
            canal_confirmacion=self.paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        Consentimiento.objects.create(
            cita=cita, paciente=self.paciente, contenido_snapshot="<p>Texto</p>", hash_contenido="x" * 64,
            token="tok-firma", token_expira=timezone.now() + timedelta(days=1),
        )
        anonimo = APIClient()
        response = anonimo.post("/api/v1/consentimientos/firmar/tok-firma/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Consentimiento.objects.get(token="tok-firma").estado, Consentimiento.Estado.PENDIENTE)

    # ── M7-04 ──────────────────────────────────────────────────────────────
    def test_m704_ya_no_hay_envio_libre_de_correos(self):
        response = self.client.post(
            "/api/v1/notificaciones/emails/enviar/",
            {"to": ["externo@x.com"], "subject": "x", "body": "x", "from_email": "ceo@otra.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    # ── M0-06 ──────────────────────────────────────────────────────────────
    def test_m006_quien_no_es_admin_no_nombra_administradores(self):
        rol = self._rol("gestor-usuarios", ["usuarios.ver", "usuarios.editar", "usuarios.crear"])
        gestor = User.objects.create_user(
            email="gestor@test.com", password="Secret123!", first_name="Ge", last_name="Stor",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        otro = self._recepcion()
        self.client.force_authenticate(gestor)
        # Ni a sí mismo ni a otro.
        self.assertEqual(self.client.patch(f"/api/v1/usuarios/{gestor.id}/", {"rol": "admin"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/v1/usuarios/{otro.id}/", {"rol": "admin"}, format="json").status_code, 400)
        # Tampoco toca a un administrador.
        self.assertEqual(self.client.patch(f"/api/v1/usuarios/{self.admin.id}/", {"first_name": "X"}, format="json").status_code, 400)
        gestor.refresh_from_db()
        self.assertNotEqual(gestor.rol_dinamico.slug, "admin")

    def test_m006_quien_no_es_admin_no_edita_su_propio_rol(self):
        rol = self._rol("gestor-roles", ["roles.ver", "roles.editar", "roles.asignar_permisos"])
        gestor = User.objects.create_user(
            email="gestor2@test.com", password="Secret123!", first_name="Ge", last_name="Stor",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(gestor)
        response = self.client.put(
            f"/api/v1/usuarios/roles/{rol.id}/permisos/",
            {"permission_keys": ["usuarios.editar", "cobros.anular"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    # ── M0-02 ──────────────────────────────────────────────────────────────
    def test_m002_un_usuario_desactivado_no_puede_entrar(self):
        recepcion = self._recepcion()
        response = self.client.post(f"/api/v1/usuarios/{recepcion.id}/desactivar/")
        self.assertEqual(response.status_code, 200, response.content)
        recepcion.refresh_from_db()
        self.assertFalse(recepcion.is_active)
        login = APIClient().post(
            "/api/v1/auth/login/", {"email": "rece@test.com", "password": "Secret123!"}, format="json",
        )
        self.assertNotEqual(login.status_code, 200)
        self.client.post(f"/api/v1/usuarios/{recepcion.id}/activar/")
        recepcion.refresh_from_db()
        self.assertTrue(recepcion.is_active)

    # ── M7-11 ──────────────────────────────────────────────────────────────
    def test_m711_el_registro_publico_tiene_limite(self):
        anonimo = APIClient()
        codigos = [anonimo.post("/api/v1/registro-clinica/", {}, format="json").status_code for _ in range(6)]
        self.assertEqual(codigos[-1], 429)

    # ── T-05: aislamiento entre clínicas ───────────────────────────────────
    def test_t05_un_paciente_no_se_crea_ni_mueve_a_otra_clinica(self):
        response = self.client.patch(
            f"/api/v1/pacientes/{self.paciente.id}/", {"clinica": str(self.otra.id)}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.clinica_id, self.clinica.id)
        nuevo = self.client.post(
            "/api/v1/pacientes/",
            {
                "clinica": str(self.otra.id), "tipo_documento": "CC", "numero_documento": "55555",
                "nombres": "Ana", "apellidos": "Ruiz", "fecha_nacimiento": "1990-01-01", "sexo": "F",
                "telefono": "+573001234567", "canal_confirmacion": "whatsapp", "autoriza_datos": True,
            },
            format="json",
        )
        self.assertEqual(nuevo.status_code, 201, nuevo.content)
        self.assertEqual(Paciente.objects.get(id=nuevo.json()["id"]).clinica_id, self.clinica.id)

    def test_t05_no_se_agenda_en_la_sede_de_otra_clinica(self):
        inicio = self.proximo_dia_habil_10am()
        response = self.client.post(
            "/api/v1/agenda/citas/",
            {
                "paciente": str(self.paciente.id), "sede": str(self.sede_otra.id), "servicio": str(self.servicio.id),
                "profesional": str(self.profesional.id), "fecha_inicio": inicio.isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("sede", response.json())

    def test_t05_no_se_paga_con_un_medio_de_otra_clinica(self):
        cobro = Cobro.objects.create(
            origen=Cobro.Origen.LIBRE, paciente=self.paciente, sede=self.sede, created_by=self.admin,
        )
        medio_ajeno = FormaDePago.objects.filter(clinica=self.otra).first() or FormaDePago.objects.create(
            clinica=self.otra, nombre="Efectivo ajeno", tipo_base="efectivo",
        )
        response = self.client.post(
            f"/api/v1/cobros/cobros/{cobro.id}/registrar_pago/",
            {"medio_pago": str(medio_ajeno.id), "valor": "1000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("medio_pago", response.json())

    def test_t05_no_se_ajusta_stock_en_sede_de_otra_clinica(self):
        insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gasa", unidad_medida="unidad")
        response = self.client.post(
            f"/api/v1/inventario/insumos/{insumo.id}/ajustar_stock/",
            {"sede": str(self.sede_otra.id), "cantidad_nueva": "10", "motivo": "Prueba"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_m410_recepcion_no_registra_mediciones_clinicas(self):
        self.client.force_authenticate(self._recepcion())
        response = self.client.post(
            "/api/v1/obesidad/mediciones/",
            {"paciente": str(self.paciente.id), "peso_kg": "80"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
