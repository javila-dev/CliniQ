from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()


class SuperadminEditaSuPropioPerfilTests(TestCase):
    """
    Un superadmin no pertenece a ninguna clinica (clinica=None). Mientras
    impersona una clinica (X-Active-Clinica), el queryset de UserViewSet
    filtraba solo por esa clinica y excluia al propio superadmin -- un 404
    falso al intentar editar su propio perfil desde /usuarios/<id>/.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-perfil@example.com",
            password="secret123",
            first_name="Root",
            last_name="Perfil",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Perfil", nit="901888999")

    def test_superadmin_puede_editar_su_perfil_mientras_impersona_una_clinica(self):
        response = self.client.patch(
            f"/api/v1/usuarios/{self.superadmin.id}/",
            {"first_name": "Nuevo Nombre"},
            format="json",
            HTTP_X_ACTIVE_CLINICA=str(self.clinica.id),
        )

        self.assertEqual(response.status_code, 200)
        self.superadmin.refresh_from_db()
        self.assertEqual(self.superadmin.first_name, "Nuevo Nombre")

    def test_no_se_puede_cambiar_el_rol_de_un_superadmin(self):
        response = self.client.patch(
            f"/api/v1/usuarios/{self.superadmin.id}/",
            {"rol": "admin"},
            format="json",
            HTTP_X_ACTIVE_CLINICA=str(self.clinica.id),
        )

        self.assertEqual(response.status_code, 400)
        self.superadmin.refresh_from_db()
        self.assertEqual(self.superadmin.rol, User.Role.SUPERADMIN)

    def test_superadmin_no_puede_editar_usuario_de_otra_clinica_impersonada(self):
        otra_clinica = Clinica.objects.create(nombre="Otra Clinica Perfil", nit="901889000")
        otro_usuario = User.objects.create_user(
            email="otro-usuario@example.com",
            password="secret123",
            first_name="Otro",
            last_name="Usuario",
            rol=User.Role.ADMIN,
            clinica=otra_clinica,
        )

        response = self.client.patch(
            f"/api/v1/usuarios/{otro_usuario.id}/",
            {"first_name": "Hackeado"},
            format="json",
            HTTP_X_ACTIVE_CLINICA=str(self.clinica.id),
        )

        self.assertEqual(response.status_code, 404)
        otro_usuario.refresh_from_db()
        self.assertEqual(otro_usuario.first_name, "Otro")
