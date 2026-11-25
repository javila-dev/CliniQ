"""Condiciones de compra promocional (docs/plan-consentimiento-compra-promocional.md).

Si la clínica lo activa, toda venta lleva esa sección en el documento de
aceptación de la cotización, firmada por el paciente (Documenso) y por quien
cotizó (su firma guardada en el perfil).
"""
import io
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, FormaDePago, Sede
from apps.configuracion.models import ConfiguracionCartera
from apps.consentimientos.models import Consentimiento
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente

User = get_user_model()
Alcance = Consentimiento.AlcanceAceptacion


def _png() -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (60, 20), (10, 10, 120)).save(buffer, format="PNG")
    return buffer.getvalue()


@override_settings(
    DOCUMENSO_API_URL="",
    MINIO_PUBLIC_BUCKET="",
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT=tempfile.gettempdir(),
)
class CondicionesCompraPromocionalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Promo", nit="900765999")
        Sede.objects.create(clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000")
        self.vendedora = User.objects.create_user(
            email="vende@example.com", password="x", first_name="Lina", last_name="Mora",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self._dar_firma(self.vendedora)
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="55443322",
            nombres="Carla", apellidos="Rueda", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3001234567", email="carla@example.com",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.config = ConfiguracionCartera.objects.create(
            clinica=self.clinica, exige_condiciones_compra_promocional=True,
        )

    def _dar_firma(self, user):
        user.firma_digital.save(f"firma-{user.pk}.png", ContentFile(_png()), save=True)

    def _crear(self, como=None, valor="350000.00"):
        self.client.force_authenticate(como or self.vendedora)
        forma = FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia")
        payload = {
            "paciente": str(self.paciente.id),
            "validez_dias": 30,
            "items": [{"descripcion": "Depilación láser piernas", "num_citas": 6, "valor_unitario": "100000.00",
                       "descuento_porcentaje": "0.00"}],
            "formas_pago": [{"tipo": str(forma.id), "valor": "600000.00"}],
        }
        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content[:400])
        return response.json()["id"]

    def _aceptar(self, cotizacion_id, como=None):
        self.client.force_authenticate(como or self.vendedora)
        return self.client.post(
            f"/api/v1/cotizaciones/{cotizacion_id}/cambiar_estado/", {"estado": "aceptada"}, format="json",
        )

    # ── Qué documento sale ────────────────────────────────────────────────

    def test_solo_promocional_genera_el_documento_y_espera_la_firma(self):
        cotizacion_id = self._crear()
        response = self._aceptar(cotizacion_id)

        self.assertEqual(response.status_code, 200, response.content[:400])
        data = response.json()
        self.assertTrue(data["requiere_firma_compromiso"])
        self.assertEqual(data["compromiso_pago"]["alcance_aceptacion"], Alcance.PROMOCIONAL)
        self.assertEqual(data["compromiso_pago"]["titulo_documento"], "Consentimiento de compra promocional")
        self.assertEqual(Cotizacion.objects.get(id=cotizacion_id).estado, Cotizacion.Estado.BORRADOR)

        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)
        html = doc.contenido_snapshot
        self.assertIn("Consentimiento de compra promocional", html)
        # Nombre e identificación van en el encabezado del PDF; aquí lo demás.
        self.assertIn("3001234567", html)
        self.assertIn("carla@example.com", html)
        self.assertIn("Depilación láser piernas (6 sesiones)", html)
        self.assertIn("$600.000", html)
        self.assertIn("90 días", html)
        self.assertIn("Lina Mora", html)
        self.assertIn("Administrador", html)
        self.assertIn('src="data:image/png;base64,', html)
        # Sin compromiso de pago ni comparación de precios.
        self.assertNotIn("Forma de pago acordada", html)
        self.assertNotIn("precio normal", html.lower())

    def test_con_compromiso_son_dos_documentos_en_un_sobre_cada_uno_con_su_firma(self):
        import io as _io

        import pdfplumber

        from apps.agenda.pdf_coords import extraer_coordenadas_firmas
        from apps.consentimientos.services import _crear_envelope_documenso, generar_pdf_para_firma_documenso

        self.config.requiere_consentimiento_promocional = True
        self.config.save()
        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)

        # Un solo registro (un sobre), con las dos partes.
        [doc] = Consentimiento.objects.filter(cotizacion_id=cotizacion_id)
        self.assertEqual(doc.alcance_aceptacion, Alcance.AMBOS)
        self.assertIn("Forma de pago acordada", doc.contenido_snapshot)
        self.assertIn("Consentimiento de compra promocional", doc.contenido_snapshot)

        # En el PDF son dos documentos: cada uno con su encabezado y su firma del paciente.
        pdf = generar_pdf_para_firma_documenso(doc)
        recuadros = extraer_coordenadas_firmas(pdf)
        self.assertEqual(len(recuadros), 2)
        with pdfplumber.open(_io.BytesIO(pdf)) as archivo:
            textos = [pagina.extract_text() or "" for pagina in archivo.pages]
        primera, segunda = (textos[r["pageNumber"] - 1] for r in recuadros)
        self.assertLess(recuadros[0]["pageNumber"], recuadros[1]["pageNumber"])
        self.assertIn("FIRMA DEL PACIENTE", primera)
        self.assertIn("FIRMA DEL PACIENTE", segunda)
        texto = " ".join(textos)
        self.assertIn("#ACEP-", texto)
        self.assertIn("#PROMO-", texto)
        self.assertEqual(texto.count("DATOS DEL PACIENTE"), 2)
        # La firma del asesor va solo en el de compra promocional.
        self.assertNotIn("ASESOR(A)", primera)
        self.assertIn("ASESOR(A)", segunda)

        # El sobre lleva un campo de firma del paciente por documento.
        with patch("apps.consentimientos.services._requests.post") as post, override_settings(
            DOCUMENSO_API_URL="https://documenso.test", DOCUMENSO_API_KEY="k",
        ):
            post.return_value.json.return_value = {"id": "env-1"}
            _crear_envelope_documenso(pdf, "x.pdf", "Carla", "c@example.com", recuadros)
        import json as _json

        campos = _json.loads(post.call_args.kwargs["data"]["payload"])["recipients"][0]["fields"]
        self.assertEqual([c["page"] for c in campos], [r["pageNumber"] for r in recuadros])

    def test_solo_compromiso_queda_como_antes(self):
        self.config.requiere_consentimiento_promocional = True
        self.config.exige_condiciones_compra_promocional = False
        self.config.save()
        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)

        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)
        self.assertEqual(doc.alcance_aceptacion, Alcance.COMPROMISO)
        self.assertNotIn("compra promocional", doc.contenido_snapshot)

    def test_sin_ningun_requisito_se_acepta_directo(self):
        self.config.exige_condiciones_compra_promocional = False
        self.config.save()
        cotizacion_id = self._crear()
        response = self._aceptar(cotizacion_id)

        self.assertFalse(response.json()["requiere_firma_compromiso"])
        self.assertEqual(Cotizacion.objects.get(id=cotizacion_id).estado, Cotizacion.Estado.ACEPTADA)
        self.assertFalse(Consentimiento.objects.filter(cotizacion_id=cotizacion_id).exists())

    def test_datos_migrados_no_lo_generan(self):
        cotizacion_id = self._crear()
        Cotizacion.objects.filter(id=cotizacion_id).update(es_migracion=True)
        self._aceptar(cotizacion_id)

        self.assertFalse(Consentimiento.objects.filter(cotizacion_id=cotizacion_id).exists())

    def test_el_plazo_es_el_de_la_clinica(self):
        self.config.plazo_inicio_promocional_dias = 45
        self.config.save()
        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)

        self.assertIn("45 días", Consentimiento.objects.get(cotizacion_id=cotizacion_id).contenido_snapshot)

    # ── Aviso antes de aceptar ───────────────────────────────────────────

    def test_el_borrador_avisa_que_documento_pedira_y_si_hay_firma(self):
        cotizacion_id = self._crear()
        requisitos = self.client.get(f"/api/v1/cotizaciones/{cotizacion_id}/").json()["requisitos_aceptacion"]

        self.assertEqual(requisitos["alcance"], Alcance.PROMOCIONAL)
        self.assertEqual(requisitos["titulo"], "Consentimiento de compra promocional")
        self.assertEqual(requisitos["vendedor_nombre"], "Lina Mora")
        self.assertTrue(requisitos["vendedor_tiene_firma"])
        self.assertTrue(requisitos["vendedor_es_usted"])

        # Otra persona la mira y la vendedora no tiene firma.
        self.vendedora.firma_digital = None
        self.vendedora.save()
        otra = User.objects.create_user(email="mira@example.com", password="x", rol=User.Role.ADMIN, clinica=self.clinica)
        self.client.force_authenticate(otra)
        requisitos = self.client.get(f"/api/v1/cotizaciones/{cotizacion_id}/").json()["requisitos_aceptacion"]
        self.assertFalse(requisitos["vendedor_tiene_firma"])
        self.assertFalse(requisitos["vendedor_es_usted"])

    def test_guardar_el_borrador_devuelve_los_requisitos(self):
        cotizacion_id = self._crear()
        forma = FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia")
        data = self.client.patch(f"/api/v1/cotizaciones/{cotizacion_id}/", {
            "items": [{"descripcion": "Axilas", "num_citas": 6, "valor_unitario": "50000.00", "descuento_porcentaje": "0.00"}],
            "formas_pago": [{"tipo": str(forma.id), "valor": "300000.00"}],
        }, format="json").json()
        self.assertEqual(data["requisitos_aceptacion"]["alcance"], Alcance.PROMOCIONAL)
        self.assertIn("compromiso_pago", data)

    def test_sin_requisitos_o_ya_aceptada_no_avisa_nada(self):
        self.config.exige_condiciones_compra_promocional = False
        self.config.save()
        cotizacion_id = self._crear()
        self.assertIsNone(self.client.get(f"/api/v1/cotizaciones/{cotizacion_id}/").json()["requisitos_aceptacion"])
        self._aceptar(cotizacion_id)
        self.assertIsNone(self.client.get(f"/api/v1/cotizaciones/{cotizacion_id}/").json()["requisitos_aceptacion"])

    # ── Firma de quien vende ─────────────────────────────────────────────

    def test_sin_firma_quien_cotizo_debe_dibujarla(self):
        self.vendedora.firma_digital = None
        self.vendedora.save()
        cotizacion_id = self._crear()
        response = self._aceptar(cotizacion_id)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "FIRMA_VENDEDOR_REQUERIDA")
        self.assertFalse(Consentimiento.objects.filter(cotizacion_id=cotizacion_id).exists())

    def test_si_acepta_otra_persona_avisa_que_falta_la_firma_del_vendedor(self):
        self.vendedora.firma_digital = None
        self.vendedora.save()
        otra = User.objects.create_user(
            email="otra@example.com", password="x", rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self._dar_firma(otra)
        cotizacion_id = self._crear()
        response = self._aceptar(cotizacion_id, como=otra)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "FIRMA_VENDEDOR_DE_OTRO")
        self.assertIn("Lina Mora", response.json()["error"])

    def test_vendedor_inactivo_firma_quien_acepta(self):
        otra = User.objects.create_user(
            email="relevo@example.com", password="x", first_name="Ruth", last_name="Paz",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self._dar_firma(otra)
        cotizacion_id = self._crear()
        User.objects.filter(pk=self.vendedora.pk).update(is_active=False)
        response = self._aceptar(cotizacion_id, como=otra)

        self.assertEqual(response.status_code, 200, response.content[:400])
        html = Consentimiento.objects.get(cotizacion_id=cotizacion_id).contenido_snapshot
        self.assertIn("Ruth Paz", html)
        self.assertNotIn("Lina Mora", html)

    # ── Firma del paciente y cambios ─────────────────────────────────────

    def test_firmar_acepta_la_venta_aunque_no_haya_compromiso_de_pago(self):
        from apps.consentimientos.services import confirmar_firma_compromiso_pago

        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)
        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)

        with patch("apps.consentimientos.services.recuperar_pdf_compromiso_pago"):
            confirmar_firma_compromiso_pago(doc)

        self.assertEqual(Cotizacion.objects.get(id=cotizacion_id).estado, Cotizacion.Estado.ACEPTADA)

    def test_cambiar_la_cotizacion_re_emite_el_documento_pendiente(self):
        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)
        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)
        hash_antes = doc.hash_contenido

        forma = FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia")
        response = self.client.patch(f"/api/v1/cotizaciones/{cotizacion_id}/", {
            "items": [{"descripcion": "Depilación láser axilas", "num_citas": 6, "valor_unitario": "50000.00",
                       "descuento_porcentaje": "0.00"}],
            "formas_pago": [{"tipo": str(forma.id), "valor": "300000.00"}],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content[:400])

        doc.refresh_from_db()
        self.assertNotEqual(doc.hash_contenido, hash_antes)
        self.assertEqual(doc.alcance_aceptacion, Alcance.PROMOCIONAL)
        self.assertIn("Depilación láser axilas", doc.contenido_snapshot)
        self.assertIn("$300.000", doc.contenido_snapshot)

    def test_apagarlo_con_un_pendiente_no_lo_vuelve_compromiso_y_al_aceptar_se_anula(self):
        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)
        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)
        self.config.exige_condiciones_compra_promocional = False
        self.config.save()

        # Editar la cotización re-emite el pendiente con las mismas secciones.
        forma = FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia")
        self.client.patch(f"/api/v1/cotizaciones/{cotizacion_id}/", {
            "items": [{"descripcion": "Depilación láser axilas", "num_citas": 6, "valor_unitario": "50000.00",
                       "descuento_porcentaje": "0.00"}],
            "formas_pago": [{"tipo": str(forma.id), "valor": "300000.00"}],
        }, format="json")
        doc.refresh_from_db()
        self.assertEqual(doc.alcance_aceptacion, Alcance.PROMOCIONAL)
        self.assertIn("Consentimiento de compra promocional", doc.contenido_snapshot)
        self.assertNotIn("Forma de pago acordada", doc.contenido_snapshot)

        # Aceptar ya no lo exige: la venta se acepta y el pendiente se anula.
        response = self._aceptar(cotizacion_id)
        self.assertFalse(response.json()["requiere_firma_compromiso"])
        self.assertEqual(Cotizacion.objects.get(id=cotizacion_id).estado, Cotizacion.Estado.ACEPTADA)
        doc.refresh_from_db()
        self.assertEqual(doc.estado, Consentimiento.Estado.REVOCADO)
        self.assertIn("dejó de exigir", doc.motivo_revocacion)

    def test_la_firma_del_vendedor_va_junto_a_la_del_paciente(self):
        from apps.consentimientos.services import separar_firma_vendedor

        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)
        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)

        # Es parte de lo firmado (entra al hash)...
        self.assertIn("<!--FIRMA_VENDEDOR-->", doc.contenido_snapshot)
        # ...pero en el PDF sale del contenido y va al bloque de firmas.
        contenido, firma = separar_firma_vendedor(doc.contenido_snapshot)
        self.assertIn("Lina Mora", firma)
        self.assertIn("data:image/png;base64,", firma)
        self.assertNotIn("Lina Mora", contenido)
        self.assertIn("No se puede transferir", contenido)
        self.assertEqual(separar_firma_vendedor("<p>sin marcas</p>"), ("<p>sin marcas</p>", ""))

    def test_el_pdf_lleva_el_titulo_segun_las_secciones(self):
        from apps.consentimientos.services import _documento_tipo_consentimiento, titulo_documento

        cotizacion_id = self._crear()
        self._aceptar(cotizacion_id)
        doc = Consentimiento.objects.get(cotizacion_id=cotizacion_id)

        self.assertEqual(titulo_documento(doc), "Consentimiento de compra promocional")
        self.assertEqual(_documento_tipo_consentimiento(doc), "consentimiento de compra promocional")
        doc.alcance_aceptacion = Alcance.AMBOS
        self.assertEqual(titulo_documento(doc), "Compromiso de pago y consentimiento de compra promocional")


class ConfiguracionCompraPromocionalTests(TestCase):
    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Config Promo", nit="900765998")
        self.admin = User.objects.create_user(
            email="admin-promo@example.com", password="x", rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_se_activa_y_se_fija_el_plazo(self):
        response = self.client.patch("/api/v1/configuracion/cartera/", {
            "exige_condiciones_compra_promocional": True, "plazo_inicio_promocional_dias": 60,
        }, format="json")

        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertTrue(response.json()["exige_condiciones_compra_promocional"])
        self.assertEqual(response.json()["plazo_inicio_promocional_dias"], 60)
        self.assertFalse(response.json()["requiere_consentimiento_promocional"])

    def test_el_plazo_debe_estar_entre_1_y_365(self):
        for valor in (0, 366):
            response = self.client.patch(
                "/api/v1/configuracion/cartera/", {"plazo_inicio_promocional_dias": valor}, format="json",
            )
            self.assertEqual(response.status_code, 400, valor)
