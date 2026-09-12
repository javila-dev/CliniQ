import tempfile

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.ayuda.models import ArticuloAyuda, CategoriaAyuda
from apps.ayuda.videos import parse_video, thumbnail_url
from apps.core.models import ConfiguracionGlobal

User = get_user_model()


@override_settings(
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class CentroAyudaTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # La migración de seed también corre en la BD de test; partimos de cero
        # para que las aserciones de conteo/igualdad sean deterministas.
        ArticuloAyuda.objects.all().delete()
        CategoriaAyuda.objects.all().delete()

        # Estos tests cubren las reglas de contenido (borrador/publicado, filtros, etc.),
        # no el flag global — lo dejamos habilitado acá; el flag en sí se prueba aparte
        # en CentroAyudaFeatureFlagTests.
        ConfiguracionGlobal.objects.update_or_create(pk=1, defaults={"centro_ayuda_habilitado": True})

        self.superadmin = User.objects.create_user(
            email="root-ayuda@example.com", password="secret123",
            first_name="Root", last_name="Ayuda", rol=User.Role.SUPERADMIN,
        )
        self.interno = User.objects.create_user(
            email="interno-ayuda@example.com", password="secret123",
            first_name="Equipo", last_name="Interno", rol=User.Role.RECEPCION,
            is_staff=True,
        )
        self.recepcion = User.objects.create_user(
            email="recepcion-ayuda@example.com", password="secret123",
            first_name="Recep", last_name="Cion", rol=User.Role.RECEPCION,
        )

        self.categoria = CategoriaAyuda.objects.create(nombre="Agenda", orden=0)
        self.publicado = ArticuloAyuda.objects.create(
            categoria=self.categoria, titulo="Agendar una cita",
            resumen="Cómo agendar", contenido="Pasos...", area="agenda",
            estado=ArticuloAyuda.Estado.PUBLICADO, destacado=True,
        )
        self.borrador = ArticuloAyuda.objects.create(
            categoria=self.categoria, titulo="Artículo en progreso",
            contenido="wip", estado=ArticuloAyuda.Estado.BORRADOR,
        )

    # ── Lectura ──────────────────────────────────────────────────────────

    def test_usuario_normal_ve_solo_publicados(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/ayuda/articulos/")
        self.assertEqual(res.status_code, 200)
        slugs = {a["slug"] for a in res.data["results"]}
        self.assertIn(self.publicado.slug, slugs)
        self.assertNotIn(self.borrador.slug, slugs)

    def test_usuario_normal_no_accede_a_borrador_por_slug(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.get(f"/api/v1/ayuda/articulos/{self.borrador.slug}/")
        self.assertEqual(res.status_code, 404)

    def test_anonimo_no_puede_leer(self):
        res = self.client.get("/api/v1/ayuda/articulos/")
        self.assertEqual(res.status_code, 401)

    def test_retrieve_incrementa_vistas_solo_en_publicado_real(self):
        self.client.force_authenticate(self.recepcion)
        self.client.get(f"/api/v1/ayuda/articulos/{self.publicado.slug}/")
        self.publicado.refresh_from_db()
        self.assertEqual(self.publicado.vistas, 1)

    def test_gestor_ve_borrador_y_preview_no_suma_vistas(self):
        self.client.force_authenticate(self.interno)
        res = self.client.get(f"/api/v1/ayuda/articulos/{self.borrador.slug}/?preview=1")
        self.assertEqual(res.status_code, 200)
        self.borrador.refresh_from_db()
        self.assertEqual(self.borrador.vistas, 0)

    def test_filtros_categoria_y_destacado(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/ayuda/articulos/?destacado=true")
        self.assertEqual({a["slug"] for a in res.data["results"]}, {self.publicado.slug})
        res = self.client.get("/api/v1/ayuda/articulos/?categoria=agenda")
        self.assertEqual(res.status_code, 200)

    def test_categorias_traen_conteo_de_publicados(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/ayuda/categorias/")
        cat = next(c for c in res.data["results"] if c["slug"] == "agenda")
        self.assertEqual(cat["articulos_count"], 1)
        self.assertEqual(cat["articulos_total"], 2)

    # ── Escritura ────────────────────────────────────────────────────────

    def test_usuario_normal_no_puede_crear(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.post("/api/v1/ayuda/articulos/", {
            "categoria": str(self.categoria.id), "titulo": "Hack", "contenido": "x",
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_interno_puede_crear_y_setea_publicado_at(self):
        self.client.force_authenticate(self.interno)
        res = self.client.post("/api/v1/ayuda/articulos/", {
            "categoria": str(self.categoria.id),
            "titulo": "Nuevo artículo",
            "contenido": "cuerpo",
            "estado": "publicado",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["slug"], "nuevo-articulo")
        art = ArticuloAyuda.objects.get(slug="nuevo-articulo")
        self.assertIsNotNone(art.publicado_at)
        self.assertEqual(art.actualizado_por, self.interno)

    def test_superadmin_puede_crear(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.post("/api/v1/ayuda/articulos/", {
            "categoria": str(self.categoria.id), "titulo": "Desde superadmin", "contenido": "x",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)

    def test_video_url_invalida_es_rechazada(self):
        self.client.force_authenticate(self.interno)
        res = self.client.patch(
            f"/api/v1/ayuda/articulos/{self.publicado.slug}/",
            {"video_url": "https://example.com/no-es-video"}, format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_video_url_valida_devuelve_thumbnail_y_embed(self):
        self.client.force_authenticate(self.interno)
        res = self.client.patch(
            f"/api/v1/ayuda/articulos/{self.publicado.slug}/",
            {"video_url": "https://youtu.be/dQw4w9WgXcQ"}, format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["video_provider"], "youtube")
        self.assertEqual(res.data["video_id"], "dQw4w9WgXcQ")
        self.assertIn("dQw4w9WgXcQ", res.data["thumbnail_url"])
        self.assertIn("youtube-nocookie.com", res.data["video_embed_url"])

    def test_reordenar_articulos(self):
        self.client.force_authenticate(self.interno)
        otro = ArticuloAyuda.objects.create(
            categoria=self.categoria, titulo="Otro", estado=ArticuloAyuda.Estado.PUBLICADO,
        )
        res = self.client.post("/api/v1/ayuda/articulos/reordenar/", {
            "categoria": str(self.categoria.id),
            "orden": [str(otro.id), str(self.publicado.id), str(self.borrador.id)],
        }, format="json")
        self.assertEqual(res.status_code, 200)
        otro.refresh_from_db()
        self.publicado.refresh_from_db()
        self.assertEqual(otro.orden, 0)
        self.assertEqual(self.publicado.orden, 1)

    def test_feedback_incrementa_contadores(self):
        self.client.force_authenticate(self.recepcion)
        self.client.post(f"/api/v1/ayuda/articulos/{self.publicado.slug}/feedback/", {"util": True}, format="json")
        self.client.post(f"/api/v1/ayuda/articulos/{self.publicado.slug}/feedback/", {"util": False}, format="json")
        self.publicado.refresh_from_db()
        self.assertEqual(self.publicado.util_si, 1)
        self.assertEqual(self.publicado.util_no, 1)

    def test_duplicar_crea_borrador(self):
        self.client.force_authenticate(self.interno)
        res = self.client.post(f"/api/v1/ayuda/articulos/{self.publicado.slug}/duplicar/")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["estado"], "borrador")
        self.assertTrue(res.data["titulo"].endswith("(copia)"))

    def test_subir_imagen_rechaza_no_gestor(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.post("/api/v1/ayuda/imagenes/", {}, format="multipart")
        self.assertEqual(res.status_code, 403)

    # ── is_staff expuesto ────────────────────────────────────────────────

    def test_me_expone_is_staff(self):
        self.client.force_authenticate(self.interno)
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_staff"])

    def test_login_payload_incluye_is_staff(self):
        res = self.client.post("/api/v1/auth/login/", {
            "email": "interno-ayuda@example.com", "password": "secret123",
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["user"]["is_staff"])


class CentroAyudaFeatureFlagTests(TestCase):
    """El centro de ayuda nace apagado; solo un superadmin lo activa globalmente."""

    def setUp(self):
        self.client = APIClient()
        ConfiguracionGlobal.objects.all().delete()  # vuelve al default: apagado

        self.superadmin = User.objects.create_user(
            email="root-flag@example.com", password="secret123",
            first_name="Root", last_name="Flag", rol=User.Role.SUPERADMIN,
        )
        self.interno = User.objects.create_user(
            email="interno-flag@example.com", password="secret123",
            first_name="Equipo", last_name="Interno", rol=User.Role.RECEPCION,
            is_staff=True,
        )
        self.recepcion = User.objects.create_user(
            email="recepcion-flag@example.com", password="secret123",
            first_name="Recep", last_name="Cion", rol=User.Role.RECEPCION,
        )
        self.categoria = CategoriaAyuda.objects.create(nombre="General", orden=0)
        self.articulo = ArticuloAyuda.objects.create(
            categoria=self.categoria, titulo="Artículo público",
            contenido="x", estado=ArticuloAyuda.Estado.PUBLICADO,
        )

    def test_flag_nace_apagado_por_default(self):
        self.assertFalse(ConfiguracionGlobal.get_solo().centro_ayuda_habilitado)

    def test_usuario_normal_bloqueado_mientras_esta_apagado(self):
        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/ayuda/articulos/")
        self.assertEqual(res.status_code, 403)
        res = self.client.get(f"/api/v1/ayuda/articulos/{self.articulo.slug}/")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/api/v1/ayuda/categorias/")
        self.assertEqual(res.status_code, 403)

    def test_gestor_ve_el_contenido_aunque_este_apagado(self):
        for user in (self.superadmin, self.interno):
            self.client.force_authenticate(user)
            res = self.client.get("/api/v1/ayuda/articulos/")
            self.assertEqual(res.status_code, 200)

    def test_usuario_normal_ve_el_contenido_una_vez_activado(self):
        ConfiguracionGlobal.objects.update_or_create(pk=1, defaults={"centro_ayuda_habilitado": True})
        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/ayuda/articulos/")
        self.assertEqual(res.status_code, 200)

    def test_solo_superadmin_puede_activar(self):
        for user, esperado in ((self.recepcion, 403), (self.interno, 403), (self.superadmin, 200)):
            self.client.force_authenticate(user)
            res = self.client.patch(
                "/api/v1/core/configuracion-global/", {"centro_ayuda_habilitado": True}, format="json",
            )
            self.assertEqual(res.status_code, esperado, (user.email, res.data))

    def test_activar_queda_expuesto_en_auth_me(self):
        self.client.force_authenticate(self.superadmin)
        self.client.patch("/api/v1/core/configuracion-global/", {"centro_ayuda_habilitado": True}, format="json")

        self.client.force_authenticate(self.recepcion)
        res = self.client.get("/api/v1/auth/me/")
        self.assertTrue(res.data["centro_ayuda_habilitado"])

    def test_anonimo_no_puede_leer_ni_activar(self):
        res = self.client.get("/api/v1/ayuda/articulos/")
        self.assertEqual(res.status_code, 401)
        res = self.client.patch("/api/v1/core/configuracion-global/", {"centro_ayuda_habilitado": True}, format="json")
        self.assertEqual(res.status_code, 401)


class ParseVideoTests(TestCase):
    def test_youtube_variantes(self):
        casos = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        ]
        for url in casos:
            self.assertEqual(parse_video(url), ("youtube", "dQw4w9WgXcQ"), url)

    def test_vimeo(self):
        self.assertEqual(parse_video("https://vimeo.com/123456789"), ("vimeo", "123456789"))
        self.assertEqual(parse_video("https://player.vimeo.com/video/123456789"), ("vimeo", "123456789"))

    def test_no_reconocido(self):
        self.assertEqual(parse_video("https://example.com/x"), (None, None))
        self.assertEqual(parse_video(""), (None, None))

    def test_thumbnail_solo_youtube(self):
        self.assertIn("abc", thumbnail_url("youtube", "abc"))
        self.assertIsNone(thumbnail_url("vimeo", "123"))
