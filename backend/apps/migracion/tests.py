from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.cartera.models import Cartera
from apps.cobros.models import Cobro, PagoRecibido
from apps.cotizaciones.models import Cotizacion
from apps.clinicas.models import Clinica, Sede
from apps.migracion.models import LoteMigracion
from apps.pacientes.models import Paciente

User = get_user_model()

URL = "/api/v1/migracion/paciente-en-curso/"


class PacienteEnCursoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-mig@example.com", password="secret123",
            first_name="Root", last_name="Mig", rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(
            nombre="Clinica Mig", nit="901999111", modo_puesta_en_marcha=True,
        )
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota",
            direccion="Calle 1", telefono="3000000000",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="555000111",
            nombres="Marcela", apellidos="Ruiz",
            fecha_nacimiento=timezone.localdate() - timezone.timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 7", telefono="3000000005",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

    def _payload(self, **over):
        base = {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "tratamiento": {
                "tipo": "libre",
                "descripcion": "Paquete laser 6 sesiones",
                "num_sesiones_total": 6,
                "precio_total_pactado": "1800000.00",
            },
            "sesiones_realizadas": [{}, {}, {}],
            "pagos": [{"valor": "1000000.00", "medio_pago": "efectivo", "fecha": "2026-01-15"}],
            "plan_saldo": [
                {"valor_esperado": "400000.00", "fecha_esperada": "2026-04-15", "tipo": "efectivo"},
                {"valor_esperado": "400000.00", "fecha_esperada": "2026-05-15", "tipo": "efectivo"},
            ],
        }
        base.update(over)
        return base

    def test_carga_completa(self):
        r = self.client.post(URL, self._payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)

        cot = Cotizacion.objects.get(paciente=self.paciente)
        self.assertTrue(cot.es_migracion)
        self.assertEqual(cot.estado, Cotizacion.Estado.ACEPTADA)
        item = cot.items.get()
        self.assertEqual(item.sesiones_previas_consumidas, 3)

        cobro = Cobro.objects.get(cotizacion=cot)
        self.assertTrue(cobro.es_migracion)
        self.assertEqual(cobro.total, Decimal("1000000.00"))
        pago = PagoRecibido.objects.get(cobro=cobro)
        self.assertTrue(pago.es_migracion)

        cartera = Cartera.objects.get(cotizacion=cot)
        self.assertEqual(cartera.total, Decimal("1800000.00"))
        self.assertEqual(cartera.total_pagado, Decimal("1000000.00"))
        self.assertEqual(cartera.saldo_pendiente, Decimal("800000.00"))
        self.assertEqual(cartera.cuotas.count(), 3)  # abono + 2 del plan

        lote = LoteMigracion.objects.get()
        self.assertEqual(lote.manifest["resumen"]["sesiones_pendientes"], 3)

    def test_no_crea_citas_sin_profesional(self):
        self.client.post(URL, self._payload(), format="json")
        self.assertEqual(Cita.objects.filter(paciente=self.paciente).count(), 0)

    def test_sesiones_previas_cuentan_en_el_seguimiento(self):
        """El panel /sesiones/ debe reflejar las 3 sesiones previas como hechas."""
        from apps.clinicas.models import Servicio, TratamientoCatalogo

        proc = Servicio.objects.create(
            clinica=self.clinica, nombre="Radiofrecuencia", duracion_min=30, precio="100000.00",
        )
        trat_cat = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="RF x6")
        tipo = trat_cat.tipos_sesion.create(nombre="RF", cantidad=6, orden=1, es_compromiso=True)
        tipo.procedimientos.create(procedimiento=proc, orden=1)

        p = self._payload(
            tratamiento={
                "tipo": "tratamiento", "tratamiento": str(trat_cat.id),
                "descripcion": "RF x6", "num_sesiones_total": 6,
                "precio_total_pactado": "1800000.00",
            },
            sesiones_realizadas=[{}, {}, {}],
            plan_saldo=[
                {"valor_esperado": "800000.00", "fecha_esperada": "2026-04-15", "tipo": "efectivo"},
            ],
        )
        r = self.client.post(URL, p, format="json")
        self.assertEqual(r.status_code, 201, r.content)

        cot = Cotizacion.objects.get(paciente=self.paciente)
        ses = self.client.get(f"/api/v1/cotizaciones/{cot.id}/sesiones/").json()
        item = ses["items"][0]
        self.assertEqual(item["citas_completadas"], 3)
        self.assertEqual(item["citas_restantes"], 3)
        self.assertEqual(item["sesiones_previas"], 3)

    def test_crea_cita_para_sesion_con_detalle(self):
        prof = User.objects.create_user(
            email="prof-mig@example.com", password="secret123",
            first_name="Ana", last_name="Pro", rol=User.Role.PROFESIONAL,
            clinica=self.clinica, es_profesional=True,
        )
        p = self._payload(sesiones_realizadas=[
            {"nombre": "Laser 1", "profesional": str(prof.id), "fecha": "2026-02-10"},
            {}, {},
        ])
        r = self.client.post(URL, p, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        citas = Cita.objects.filter(paciente=self.paciente)
        self.assertEqual(citas.count(), 1)
        c = citas.get()
        self.assertEqual(c.estado, Cita.Estado.COMPLETADA)
        self.assertTrue(c.es_migracion)
        self.assertTrue(c.recordatorio_enviado)
        # las otras 2 sin detalle quedan como sesiones previas consumidas
        self.assertEqual(Cotizacion.objects.get().items.get().sesiones_previas_consumidas, 2)

    def test_pagado_mayor_que_total_falla(self):
        p = self._payload(pagos=[{"valor": "2000000.00", "medio_pago": "efectivo", "fecha": "2026-01-15"}])
        r = self.client.post(URL, p, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("PAGADO_MAYOR_QUE_TOTAL", str(r.json()))

    def test_plan_no_cuadra_falla(self):
        p = self._payload(plan_saldo=[
            {"valor_esperado": "100000.00", "fecha_esperada": "2026-04-15", "tipo": "efectivo"},
        ])
        r = self.client.post(URL, p, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("PLAN_NO_CUADRA", str(r.json()))

    def test_403_si_clinica_no_esta_en_modo_puesta_en_marcha(self):
        self.clinica.modo_puesta_en_marcha = False
        self.clinica.save(update_fields=["modo_puesta_en_marcha"])
        r = self.client.post(URL, self._payload(), format="json")
        self.assertEqual(r.status_code, 403)

    def test_revertir_borra_todo(self):
        r = self.client.post(URL, self._payload(), format="json")
        lote_id = r.json()["id"]

        rev = self.client.post(f"/api/v1/migracion/lotes/{lote_id}/revertir/")
        self.assertEqual(rev.status_code, 200, rev.content)

        self.assertFalse(Cotizacion.objects.filter(paciente=self.paciente).exists())
        self.assertFalse(Cobro.objects.filter(paciente=self.paciente).exists())
        self.assertFalse(Cartera.objects.filter(paciente=self.paciente).exists())
        self.assertTrue(LoteMigracion.objects.get(id=lote_id).revertido)

    def test_migrada_no_genera_compromiso_pago_y_revierte(self):
        from apps.configuracion.models import ConfiguracionCartera
        from apps.consentimientos.models import Consentimiento

        ConfiguracionCartera.objects.update_or_create(
            clinica=self.clinica, defaults={"requiere_consentimiento_promocional": True},
        )
        lote_id = self.client.post(URL, self._payload(), format="json").json()["id"]
        cot = Cotizacion.objects.get(paciente=self.paciente)

        # Abrir el detalle no debe generar el compromiso de pago pendiente.
        self.client.get(f"/api/v1/cotizaciones/{cot.id}/")
        self.assertFalse(Consentimiento.objects.filter(cotizacion=cot).exists())

        rev = self.client.post(f"/api/v1/migracion/lotes/{lote_id}/revertir/")
        self.assertEqual(rev.status_code, 200, rev.content)
        self.assertFalse(Cotizacion.objects.filter(paciente=self.paciente).exists())

    def test_no_se_puede_revertir_dos_veces(self):
        r = self.client.post(URL, self._payload(), format="json")
        lote_id = r.json()["id"]
        self.client.post(f"/api/v1/migracion/lotes/{lote_id}/revertir/")
        again = self.client.post(f"/api/v1/migracion/lotes/{lote_id}/revertir/")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()["code"], "LOTE_YA_REVERTIDO")
