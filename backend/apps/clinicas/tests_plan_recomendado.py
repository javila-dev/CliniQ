from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Plan


User = get_user_model()


def crear_plan(nombre, **extra):
    datos = {"precio": Decimal("100000"), "mostrar_publico": True}
    datos.update(extra)
    return Plan.objects.create(nombre=nombre, **datos)


class PlanRecomendadoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-planes@example.com",
            password="secret123",
            first_name="Root",
            last_name="Planes",
            rol=User.Role.SUPERADMIN,
        )

    def test_marcar_un_plan_desmarca_el_anterior(self):
        solo = crear_plan("Solo", recomendado=True)
        clinica = crear_plan("Clínica")

        clinica.recomendado = True
        clinica.save()

        solo.refresh_from_db()
        self.assertFalse(solo.recomendado)
        self.assertEqual(list(Plan.objects.filter(recomendado=True)), [clinica])

    def test_un_plan_oculto_o_inactivo_no_queda_recomendado(self):
        oculto = crear_plan("Oculto", mostrar_publico=False, recomendado=True)
        inactivo = crear_plan("Inactivo", activo=False, recomendado=True)

        self.assertFalse(Plan.objects.get(pk=oculto.pk).recomendado)
        self.assertFalse(Plan.objects.get(pk=inactivo.pk).recomendado)

    def test_ocultar_el_recomendado_lo_desmarca(self):
        clinica = crear_plan("Clínica", recomendado=True)

        clinica.mostrar_publico = False
        clinica.save()

        clinica.refresh_from_db()
        self.assertFalse(clinica.recomendado)

    def test_la_base_no_admite_dos_recomendados(self):
        crear_plan("Solo", recomendado=True)
        clinica = crear_plan("Clínica")

        # Escribir por fuera de save() también queda bloqueado por la restricción.
        with self.assertRaises(IntegrityError), transaction.atomic():
            Plan.objects.filter(pk=clinica.pk).update(recomendado=True)

    def test_la_consola_marca_el_recomendado_y_desmarca_el_anterior(self):
        solo = crear_plan("Solo", recomendado=True)
        clinica = crear_plan("Clínica")
        self.client.force_authenticate(self.superadmin)

        res = self.client.patch(f"/api/v1/clinicas/planes/{clinica.pk}/", {"recomendado": True}, format="json")

        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["recomendado"])
        solo.refresh_from_db()
        self.assertFalse(solo.recomendado)

    def test_la_consola_rechaza_recomendar_un_plan_oculto(self):
        oculto = crear_plan("Oculto", mostrar_publico=False)
        self.client.force_authenticate(self.superadmin)

        res = self.client.patch(f"/api/v1/clinicas/planes/{oculto.pk}/", {"recomendado": True}, format="json")

        self.assertEqual(res.status_code, 400)
        self.assertIn("recomendado", res.data)

    def test_la_api_publica_indica_el_recomendado(self):
        crear_plan("Solo")
        crear_plan("Clínica", recomendado=True)

        res = self.client.get("/api/v1/registro-clinica/planes/")

        self.assertEqual(res.status_code, 200)
        recomendados = [p["nombre"] for p in res.json() if p["recomendado"]]
        self.assertEqual(recomendados, ["Clínica"])
