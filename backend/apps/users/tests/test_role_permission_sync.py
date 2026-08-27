import importlib

from django.apps import apps as dj_apps
from django.test import TestCase

from apps.clinicas.models import Clinica
from apps.users.models import Rol, RolPermiso
from apps.users.permissions_catalog import ALL_PERMISSION_KEYS
from apps.users.rbac import ensure_default_roles_for_clinica

_mig = importlib.import_module("apps.users.migrations.0012_sync_system_role_permissions")


class SyncSystemRolePermissionsTests(TestCase):
    """La data migration 0012 debe rellenar los permisos que le falten al rol
    `admin` de tenants creados antes de que se ampliara el catalogo."""

    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Stale Clinic", nit="900999111")
        ensure_default_roles_for_clinica(self.clinica)
        self.admin = Rol.objects.get(clinica=self.clinica, slug="admin")
        # Simula el estado "stale": rol admin sin permisos agregados despues.
        self.stale_keys = {
            "agenda.crear_bloqueo",
            "agenda.aprobar_bloqueo",
            "servicios.gestionar",
        }
        RolPermiso.objects.filter(
            rol=self.admin, permiso__clave__in=self.stale_keys
        ).delete()

    def _claves(self, rol):
        return set(rol.rol_permisos.values_list("permiso__clave", flat=True))

    def test_reconciled_admin_gets_all_permission_keys(self):
        self.assertFalse(self.stale_keys & self._claves(self.admin))

        _mig.sync_system_role_permissions(dj_apps, None)

        self.admin.refresh_from_db()
        claves = self._claves(self.admin)
        self.assertTrue(self.stale_keys.issubset(claves))
        self.assertEqual(claves, set(ALL_PERMISSION_KEYS))

    def test_is_idempotent(self):
        _mig.sync_system_role_permissions(dj_apps, None)
        primera = self._claves(Rol.objects.get(pk=self.admin.pk))
        _mig.sync_system_role_permissions(dj_apps, None)
        segunda = self._claves(Rol.objects.get(pk=self.admin.pk))
        self.assertEqual(primera, segunda)

    def test_non_system_role_is_untouched(self):
        custom = Rol.objects.create(
            clinica=self.clinica, slug="custom", nombre="Custom", es_sistema=False
        )
        _mig.sync_system_role_permissions(dj_apps, None)
        self.assertEqual(self._claves(custom), set())
