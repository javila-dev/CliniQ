"""Permisos adicionales por usuario, por fuera de su rol (solo suman)."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.core.models import LogAccion
from apps.users.authorization import get_user_permission_keys, user_has_permission
from apps.users.models import Permiso, Rol, RolPermiso, UsuarioPermisoExtra
from apps.users.rbac import ensure_default_roles_for_clinica

User = get_user_model()


class PermisosExtraTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Extra Clinic", nit="900555111")
        ensure_default_roles_for_clinica(self.clinica)
        self.admin = User.objects.create_user(
            email="admin-extra@example.com", password="Secret123!",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.rol = Rol.objects.create(clinica=self.clinica, slug="caja", nombre="Caja", es_sistema=False)
        self._dar_al_rol(self.rol, ["pacientes.ver"])
        self.miembro = User.objects.create_user(
            email="miembro-extra@example.com", password="Secret123!",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=self.rol,
        )

    def _dar_al_rol(self, rol, claves):
        for permiso in Permiso.objects.filter(clave__in=claves):
            RolPermiso.objects.get_or_create(rol=rol, permiso=permiso)

    def _put(self, usuario, claves, como=None):
        self.client.force_authenticate(como or self.admin)
        return self.client.put(
            f"/api/v1/usuarios/{usuario.id}/permisos-extra/",
            {"permission_keys": claves},
            format="json",
        )

    def _gestor(self, claves_rol):
        """Usuario que gestiona usuarios y permisos sin ser administrador."""
        rol = Rol.objects.create(clinica=self.clinica, slug="gestor", nombre="Gestor", es_sistema=False)
        self._dar_al_rol(rol, ["usuarios.ver", "usuarios.editar", "roles.ver", "roles.asignar_permisos", *claves_rol])
        return User.objects.create_user(
            email="gestor-extra@example.com", password="Secret123!",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )

    def test_otorgar_suma_al_rol_y_se_refleja_en_la_respuesta(self):
        self.assertFalse(user_has_permission(self.miembro, "cobros.ver"))
        res = self._put(self.miembro, ["cobros.ver"])
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual(data["permisos_extra"], ["cobros.ver"])
        self.assertIn("cobros.ver", data["permissions"])
        self.assertIn("pacientes.ver", data["permissions"])
        self.miembro.refresh_from_db()
        self.assertTrue(user_has_permission(self.miembro, "cobros.ver"))
        self.assertEqual(UsuarioPermisoExtra.objects.get(usuario=self.miembro).otorgado_por, self.admin)

    def test_el_permiso_extra_abre_el_endpoint(self):
        self.client.force_authenticate(self.miembro)
        self.assertEqual(self.client.get("/api/v1/usuarios/").status_code, 403)
        self._put(self.miembro, ["usuarios.ver"])
        self.client.force_authenticate(self.miembro)
        self.assertEqual(self.client.get("/api/v1/usuarios/").status_code, 200)

    def test_reemplaza_la_lista_y_quita_los_que_no_vienen(self):
        self._put(self.miembro, ["cobros.ver", "cartera.ver"])
        res = self._put(self.miembro, ["cartera.ver"])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["permisos_extra"], ["cartera.ver"])
        self.assertNotIn("cobros.ver", get_user_permission_keys(self.miembro))

    def test_no_quita_lo_que_da_el_rol(self):
        res = self._put(self.miembro, [])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("pacientes.ver", get_user_permission_keys(self.miembro))

    def test_rol_desactivado_anula_tambien_los_extra(self):
        self._put(self.miembro, ["cobros.ver"])
        self.rol.activo = False
        self.rol.save(update_fields=["activo"])
        self.miembro.refresh_from_db()
        self.assertEqual(get_user_permission_keys(self.miembro), set())

    def test_permisos_de_atencion_no_se_otorgan_sueltos(self):
        res = self._put(self.miembro, ["cobros.ver", "historia.notas.crear"])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["permisos_extra"], ["cobros.ver"])

    def test_clave_inexistente_da_400(self):
        res = self._put(self.miembro, ["no.existe"])
        self.assertEqual(res.status_code, 400, res.content)

    def test_registra_la_accion(self):
        self._put(self.miembro, ["cobros.ver"])
        log = LogAccion.objects.filter(accion="usuario.permisos_extra").get()
        self.assertEqual(log.detalle["agregados"], ["cobros.ver"])
        self.assertEqual(log.detalle["quitados"], [])

    def test_sin_cambios_no_registra(self):
        self._put(self.miembro, [])
        self.assertFalse(LogAccion.objects.filter(accion="usuario.permisos_extra").exists())

    def test_nadie_se_da_permisos_a_si_mismo(self):
        gestor = self._gestor(["cobros.ver"])
        res = self._put(gestor, ["cobros.ver"], como=gestor)
        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(res.json()["code"], "PERMISOS_PROPIOS")

    def test_al_admin_no_se_le_asignan(self):
        otro_admin = User.objects.create_user(
            email="admin2-extra@example.com", password="Secret123!",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        res = self._put(otro_admin, ["cobros.ver"])
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "ADMIN_TIENE_TODO")

    def test_gestor_no_otorga_lo_que_no_tiene(self):
        gestor = self._gestor(["cartera.ver"])
        res = self._put(self.miembro, ["cartera.ver", "cobros.ver"], como=gestor)
        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(res.json()["code"], "PERMISO_NO_PROPIO")
        self.assertEqual(res.json()["permission_keys"], ["cobros.ver"])
        self.assertFalse(UsuarioPermisoExtra.objects.filter(usuario=self.miembro).exists())

    def test_gestor_otorga_lo_que_si_tiene_y_quita_cualquiera(self):
        UsuarioPermisoExtra.objects.create(
            usuario=self.miembro, permiso=Permiso.objects.get(clave="cobros.ver"), otorgado_por=self.admin,
        )
        gestor = self._gestor(["cartera.ver"])
        res = self._put(self.miembro, ["cartera.ver"], como=gestor)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["permisos_extra"], ["cartera.ver"])

    def test_gestor_no_toca_a_un_admin(self):
        gestor = self._gestor([])
        res = self._put(self.admin, [], como=gestor)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["code"], "SOLO_ADMIN")

    def test_sin_asignar_permisos_no_entra(self):
        rol = Rol.objects.create(clinica=self.clinica, slug="solo_usuarios", nombre="Solo usuarios", es_sistema=False)
        self._dar_al_rol(rol, ["usuarios.ver", "usuarios.editar"])
        editor = User.objects.create_user(
            email="editor-extra@example.com", password="Secret123!",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        res = self._put(self.miembro, [], como=editor)
        self.assertEqual(res.status_code, 403, res.content)

    def test_usuario_de_otra_clinica_da_404(self):
        otra = Clinica.objects.create(nombre="Otra", nit="900555222")
        ajeno = User.objects.create_user(
            email="ajeno-extra@example.com", password="Secret123!",
            rol=User.Role.RECEPCION, clinica=otra,
        )
        res = self._put(ajeno, ["cobros.ver"])
        self.assertEqual(res.status_code, 404, res.content)

    def test_listado_de_colaboradores_marca_los_extra(self):
        import datetime

        from apps.clinicas.models import Sede
        from apps.colaboradores.models import Colaborador

        sede = Sede.objects.create(clinica=self.clinica, nombre="Principal")
        Colaborador.objects.create(user=self.miembro, sede_principal=sede, fecha_ingreso=datetime.date.today())
        self._put(self.miembro, ["cobros.ver", "cartera.ver"])
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/v1/colaboradores/")
        self.assertEqual(res.status_code, 200, res.content)
        filas = res.json()["results"] if isinstance(res.json(), dict) else res.json()
        fila = next(f for f in filas if f["user"] == str(self.miembro.id))
        self.assertEqual(fila["permisos_extra_count"], 2)

    def test_listado_trae_los_extra_sin_consultas_por_usuario(self):
        self._put(self.miembro, ["cobros.ver"])
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/v1/usuarios/")
        self.assertEqual(res.status_code, 200, res.content)
        filas = res.json()["results"] if isinstance(res.json(), dict) else res.json()
        fila = next(f for f in filas if f["id"] == str(self.miembro.id))
        self.assertEqual(fila["permisos_extra"], ["cobros.ver"])
        fila_admin = next(f for f in filas if f["id"] == str(self.admin.id))
        self.assertEqual(fila_admin["permisos_extra"], [])
