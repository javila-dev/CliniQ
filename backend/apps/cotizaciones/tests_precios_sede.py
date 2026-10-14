"""Precios por sede: precio propio o general, cotización y promociones."""

import uuid
from decimal import Decimal

from django.test import TestCase

from apps.clinicas.models import CampanaItem, PrecioSede, Sede
from apps.clinicas.precios import precio_lista
# Import del módulo (no de la clase) para que el runner no repita esas pruebas aquí.
from apps.cotizaciones import tests as base


class PreciosPorSedeTests(TestCase):
    setUp_base = base.CotizacionPrecioCampanaTests.setUp

    def setUp(self):
        self.setUp_base()
        self.norte = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 9", telefono="3000000001",
        )
        # Norte cobra menos que el precio general (350.000).
        PrecioSede.objects.create(sede=self.norte, procedimiento=self.procedimiento, precio=Decimal("300000"))

    def _cotizar(self, sede, valor, usuario=None):
        if usuario:
            self.client.force_authenticate(usuario)
        return self.client.post(
            "/api/v1/cotizaciones/",
            {
                "paciente": str(self.paciente.id),
                "sede": str(sede.id),
                "items": [{"tipo": "procedimiento", "procedimiento": str(self.procedimiento.id), "valor_unitario": valor}],
                "formas_pago": [{"tipo": base.forma_pago_id(self.clinica, "transferencia"), "descripcion": "Total", "valor": valor}],
            },
            format="json",
        )

    def _sin_permiso_de_precio(self):
        from apps.users.models import User

        return User.objects.create_user(
            email=f"prof-{uuid.uuid4().hex[:8]}@test.com", password="Secret123!", first_name="Pro", last_name="Fe",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )

    def test_precio_de_la_sede_o_el_general(self):
        self.assertEqual(precio_lista(self.procedimiento, self.norte), Decimal("300000"))
        self.assertEqual(precio_lista(self.procedimiento, self.sede), Decimal("350000"))
        self.assertEqual(precio_lista(self.procedimiento, None), Decimal("350000"))

    def test_la_cotizacion_usa_el_precio_de_su_sede(self):
        usuario = self._sin_permiso_de_precio()
        # En Norte, 300.000 es el precio de lista: no es "bajar el precio".
        response = self._cotizar(self.norte, "300000.00", usuario)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["items"][0]["precio_lista"], "300000.00")
        # En la sede principal (lista 350.000, promoción 280.000) se acepta un
        # valor entre la promoción y la lista (M5-03), pero no uno por debajo
        # de la promoción.
        response = self._cotizar(self.sede, "300000.00", usuario)
        self.assertEqual(response.status_code, 201, response.content)
        response = self._cotizar(self.sede, "270000.00", usuario)
        self.assertEqual(response.status_code, 400)

    def test_promocion_fija_no_se_ofrece_si_la_sede_ya_es_mas_barata(self):
        # La promoción de 280.000 aplica en la principal; en Norte (300.000) también la ponemos.
        self.campana.sedes.add(self.norte)
        item = CampanaItem.objects.get(campana=self.campana, procedimiento=self.procedimiento)
        item.precio_campana = Decimal("320000")
        item.save()
        precios = self.client.get(f"/api/v1/cotizaciones/precios_campana/?sede={self.norte.id}").json()
        self.assertNotIn(str(self.procedimiento.id), precios["procedimientos"])
        precios = self.client.get(f"/api/v1/cotizaciones/precios_campana/?sede={self.sede.id}").json()
        self.assertEqual(precios["procedimientos"][str(self.procedimiento.id)]["precio_campana"], "320000.00")

    def test_promocion_en_porcentaje_se_calcula_sobre_la_sede(self):
        self.campana.sedes.add(self.norte)
        item = CampanaItem.objects.get(campana=self.campana, procedimiento=self.procedimiento)
        item.precio_campana = None
        item.descuento_pct = Decimal("10")
        item.save()
        norte = self.client.get(f"/api/v1/cotizaciones/precios_campana/?sede={self.norte.id}").json()
        principal = self.client.get(f"/api/v1/cotizaciones/precios_campana/?sede={self.sede.id}").json()
        self.assertEqual(norte["procedimientos"][str(self.procedimiento.id)]["precio_campana"], "270000")
        self.assertEqual(principal["procedimientos"][str(self.procedimiento.id)]["precio_campana"], "315000")

    def test_guardar_precios_por_sede_desde_el_catalogo(self):
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.procedimiento.id}/",
            {"precios_sede": [{"sede": str(self.sede.id), "precio": "360000"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([p["sede"] for p in response.json()["precios_sede"]], [str(self.sede.id)])
        # La sede que ya no viene vuelve al precio general.
        self.assertFalse(PrecioSede.objects.filter(sede=self.norte).exists())

    def test_cambiar_sede_sin_items_se_rechaza(self):
        response = self._cotizar(self.norte, "300000.00")
        self.assertEqual(response.status_code, 201, response.content)
        cotizacion_id = response.json()["id"]
        # Pasar a la sede principal (más cara) sin reenviar los ítems saltaría el precio mínimo.
        patch = self.client.patch(f"/api/v1/cotizaciones/{cotizacion_id}/", {"sede": str(self.sede.id)}, format="json")
        self.assertEqual(patch.status_code, 400)
        self.assertEqual(patch.json()["code"], "ITEMS_REQUERIDOS")

    def test_cambiar_sede_con_items_valida_con_la_nueva(self):
        usuario = self._sin_permiso_de_precio()
        response = self._cotizar(self.sede, "350000.00", usuario)
        cotizacion_id = response.json()["id"]
        item = {"tipo": "procedimiento", "procedimiento": str(self.procedimiento.id), "valor_unitario": "300000.00"}
        pago = [{"tipo": base.forma_pago_id(self.clinica, "transferencia"), "descripcion": "Total", "valor": "300000.00"}]
        patch = self.client.patch(
            f"/api/v1/cotizaciones/{cotizacion_id}/",
            {"sede": str(self.norte.id), "items": [item], "formas_pago": pago},
            format="json",
        )
        self.assertEqual(patch.status_code, 200, patch.content)
        self.assertEqual(patch.json()["items"][0]["precio_lista"], "300000.00")

    def test_precio_de_sede_debe_ser_mayor_a_cero(self):
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.procedimiento.id}/",
            {"precios_sede": [{"sede": str(self.norte.id), "precio": "0"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
