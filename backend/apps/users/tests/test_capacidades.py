from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.users.models import Rol
from apps.users.permissions_catalog import (
    ALL_PERMISSION_KEYS,
    CAPABILITY_CATALOG,
    CAPABILITY_PERMISSIONS,
    PROFESSIONAL_PERMISSION_KEYS,
    role_is_professional_from_keys,
)
from apps.users.rbac import ensure_default_roles_for_clinica

User = get_user_model()


class CapabilityCatalogIntegrityTests(TestCase):
    def test_every_capability_permission_exists_in_catalog(self):
        huerfanas = {}
        for area in CAPABILITY_CATALOG:
            for cap in area["capacidades"]:
                faltantes = set(cap["permisos"]) - ALL_PERMISSION_KEYS
                if faltantes:
                    huerfanas[cap["clave"]] = sorted(faltantes)
        self.assertEqual(huerfanas, {}, f"Capacidades con permisos inexistentes: {huerfanas}")

    def test_capability_claves_are_unique(self):
        claves = [
            cap["clave"]
            for area in CAPABILITY_CATALOG
            for cap in area["capacidades"]
        ]
        self.assertEqual(len(claves), len(set(claves)))

    def test_professional_keys_are_subset_of_catalog(self):
        self.assertTrue(PROFESSIONAL_PERMISSION_KEYS)
        self.assertTrue(PROFESSIONAL_PERMISSION_KEYS <= ALL_PERMISSION_KEYS)

    def test_role_is_professional_from_keys(self):
        self.assertFalse(role_is_professional_from_keys(["agenda.citas.ver", "cobros.ver"]))
        una_clinica = next(iter(PROFESSIONAL_PERMISSION_KEYS))
        self.assertTrue(role_is_professional_from_keys(["cobros.ver", una_clinica]))


class CapacidadEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Cap Clinic", nit="900123123")
        ensure_default_roles_for_clinica(self.clinica)
        self.admin = User.objects.create_user(
            email="admin-cap@example.com",
            password="Secret123!",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.recepcion = User.objects.create_user(
            email="recep-cap@example.com",
            password="Secret123!",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )

    def test_devuelve_areas_y_permisos_tecnicos(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/v1/usuarios/capacidades/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("areas", data)
        self.assertIn("permisos_tecnicos", data)
        self.assertTrue(len(data["areas"]) >= 10)

        cap = data["areas"][0]["capacidades"][0]
        self.assertEqual(
            set(cap.keys()), {"clave", "titulo", "descripcion", "permisos", "profesional"}
        )

        claves_tecnicas = {
            p["clave"]
            for grupo in data["permisos_tecnicos"]
            for p in grupo["permisos"]
        }
        # El modo avanzado expone tambien permisos que antes eran no-asignables.
        self.assertIn("cartera.aprobar_excepcion", claves_tecnicas)

    def test_requiere_permiso_roles_ver(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/usuarios/capacidades/")
        self.assertEqual(res.status_code, 403)


class RolPermisosProfesionalDerivationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Deriv Clinic", nit="900456456")
        ensure_default_roles_for_clinica(self.clinica)
        self.admin = User.objects.create_user(
            email="admin-deriv@example.com",
            password="Secret123!",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.rol = Rol.objects.create(
            clinica=self.clinica, slug="cosmetologas", nombre="Cosmetologas", es_sistema=False
        )
        self.miembro = User.objects.create_user(
            email="miembro-deriv@example.com",
            password="Secret123!",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
            rol_dinamico=self.rol,
            es_profesional=False,
        )

    def _put(self, keys):
        return self.client.put(
            f"/api/v1/usuarios/roles/{self.rol.id}/permisos/",
            {"permission_keys": keys},
            format="json",
        )

    def test_capacidad_clinica_activa_es_profesional_y_propaga(self):
        res = self._put(["pacientes.ver", "historia.notas.crear", "pacientes.antecedentes.editar"])
        self.assertEqual(res.status_code, 200, res.content)
        self.rol.refresh_from_db()
        self.miembro.refresh_from_db()
        self.assertTrue(self.rol.es_profesional)
        self.assertTrue(self.miembro.es_profesional)

    def test_quitar_capacidad_clinica_revierte_es_profesional(self):
        self._put(["historia.notas.crear", "pacientes.antecedentes.editar"])
        res = self._put(["pacientes.ver", "cobros.ver"])
        self.assertEqual(res.status_code, 200, res.content)
        self.rol.refresh_from_db()
        self.miembro.refresh_from_db()
        self.assertFalse(self.rol.es_profesional)
        self.assertFalse(self.miembro.es_profesional)

    def test_acepta_permiso_antes_no_asignable(self):
        res = self._put(["cartera.ver", "cartera.aprobar_excepcion", "cartera.modificar_plazo"])
        self.assertEqual(res.status_code, 200, res.content)
        self.rol.refresh_from_db()
        self.assertCountEqual(
            self.rol.permission_keys if hasattr(self.rol, "permission_keys") else
            list(self.rol.permisos.values_list("clave", flat=True)),
            ["cartera.ver", "cartera.aprobar_excepcion", "cartera.modificar_plazo"],
        )
