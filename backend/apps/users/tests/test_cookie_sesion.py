"""El token de renovación viaja en una cookie HttpOnly, no en el cuerpo (16/10/2026)."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()
COOKIE = "cliniq_refresh"


class CookieSesionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.clinica = Clinica.objects.create(nombre="Clinica Cookie", nit="901333555")
        User.objects.create_user(
            email="cookie@example.com", password="Secret123!", first_name="Co", last_name="Okie",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.cliente = APIClient()

    def tearDown(self):
        cache.clear()

    def _login(self):
        r = self.cliente.post("/api/v1/auth/login/", {"email": "cookie@example.com", "password": "Secret123!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:200])
        return r

    def test_login_pone_la_cookie_httponly_y_no_devuelve_el_token(self):
        r = self._login()
        self.assertIn("access", r.json())
        self.assertNotIn("refresh", r.json())
        cookie = r.cookies[COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], "/")

    def test_cerrar_sesion_revoca_el_token_y_borra_la_cookie(self):
        refresh = self._login().cookies[COOKIE].value
        r = self.cliente.post("/api/v1/auth/logout/", {}, format="json")
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r.cookies[COOKIE].value, "")
        # El token revocado ya no renueva, aunque alguien lo hubiera copiado.
        otro = APIClient()
        self.assertEqual(otro.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json").status_code, 401)

    def test_sin_cookie_no_se_renueva(self):
        r = APIClient().post("/api/v1/auth/refresh/", {}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_dos_pestanas_que_renuevan_a_la_vez_no_pierden_la_sesion(self):
        """La pestaña que llega tarde manda el token ya rotado: recibe 401, pero
        no borra la cookie nueva que dejó la otra (que es la misma del navegador)."""
        viejo = self._login().cookies[COOKIE].value
        pestana_a = self.cliente.post("/api/v1/auth/refresh/", {}, format="json")
        self.assertEqual(pestana_a.status_code, 200)
        nuevo = pestana_a.cookies[COOKIE].value

        tarde = APIClient()
        tarde.cookies[COOKIE] = viejo
        r = tarde.post("/api/v1/auth/refresh/", {}, format="json")
        self.assertEqual(r.status_code, 401)
        self.assertNotIn(COOKIE, r.cookies)
        # La cookie nueva sigue sirviendo.
        self.cliente.cookies[COOKIE] = nuevo
        self.assertEqual(self.cliente.post("/api/v1/auth/refresh/", {}, format="json").status_code, 200)

    def test_el_limite_de_renovaciones_es_por_sesion_no_por_ip(self):
        """Varios equipos de la misma clínica salen por la misma IP."""
        clientes = []
        for i in range(4):
            User.objects.create_user(
                email=f"eq{i}@example.com", password="Secret123!", first_name="E", last_name=str(i),
                rol=User.Role.ADMIN, clinica=self.clinica,
            )
            c = APIClient()
            c.post("/api/v1/auth/login/", {"email": f"eq{i}@example.com", "password": "Secret123!"}, format="json")
            clientes.append(c)
        # 4 equipos x 10 recargas = 40 renovaciones desde la misma IP en un minuto.
        for _ in range(10):
            for c in clientes:
                self.assertEqual(c.post("/api/v1/auth/refresh/", {}, format="json").status_code, 200)

    def test_sesion_vieja_del_localstorage_se_migra_a_la_cookie(self):
        refresh = self._login().cookies[COOKIE].value
        # Un navegador con la versión anterior: el token en el cuerpo, sin cookie.
        navegador_viejo = APIClient()
        r = navegador_viejo.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("refresh", r.json())
        self.assertTrue(r.cookies[COOKIE].value)
