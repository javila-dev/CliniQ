from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cartera.models import AcuerdoPago, Cartera
from apps.clinicas.models import Clinica, Sede
from apps.consentimientos.models import Consentimiento
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente

User = get_user_model()


@override_settings(DOCUMENSO_API_URL="https://documenso.test", DOCUMENSO_API_KEY="test-key")
class AcuerdosPagoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Acuerdos", nit="902333222")
        self.admin = User.objects.create_user(
            email="admin-acuerdos@example.com", password="secret123",
            first_name="Admin", last_name="Acuerdos", rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota",
            direccion="Calle 1", telefono="3000000000", horario={"lunes": ["08:00", "18:00"]},
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="700111222", nombres="Diana", apellidos="Rojas",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 8", telefono="3001112222",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin,
            estado=Cotizacion.Estado.BORRADOR, sede=self.sede,
        )
        self.cotizacion.items.create(
            descripcion="Tratamiento", num_citas=1, periodicidad="",
            valor_unitario="1000000.00", descuento_porcentaje="0.00",
        )
        self.cotizacion.formas_pago.create(tipo="transferencia", descripcion="Cuota 1", valor="400000.00")
        self.cotizacion.formas_pago.create(tipo="transferencia", descripcion="Cuota 2", valor="600000.00")

        self.client.force_authenticate(self.admin)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.client.post(
            f"/api/v1/cotizaciones/{self.cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"}, format="json",
        )
        self.cartera = Cartera.objects.get(cotizacion=self.cotizacion)

    # ── helpers ────────────────────────────────────────────────────────────
    def _plan(self, montos, dias=30):
        base = timezone.localdate()
        return [
            {
                "tipo": "transferencia",
                "descripcion": f"Cuota acuerdo {i + 1}",
                "valor_esperado": str(m),
                "fecha_esperada": (base + timedelta(days=dias * (i + 1))).isoformat(),
            }
            for i, m in enumerate(montos)
        ]

    def _crear_acuerdo(self, montos):
        return self.client.post(
            "/api/v1/cartera/acuerdos/",
            {
                "cartera": str(self.cartera.id),
                "motivo": "El paciente se atraso; reprograma.",
                "cuotas": self._plan(montos),
            },
            format="json",
        )

    def _firmar_acta(self, acuerdo):
        from apps.cartera.services import aplicar_acuerdo_pago_por_firma

        acuerdo = AcuerdoPago.objects.get(id=acuerdo.id)
        doc = acuerdo.documento
        doc.estado = Consentimiento.Estado.FIRMADO
        doc.firmado_en = timezone.now()
        doc.save(update_fields=["estado", "firmado_en", "updated_at"])
        aplicar_acuerdo_pago_por_firma(doc)
        acuerdo.refresh_from_db()
        return acuerdo

    # ── creación ───────────────────────────────────────────────────────────
    def test_crear_acuerdo_no_toca_la_cartera(self):
        r = self._crear_acuerdo(["250000", "250000", "250000", "250000"])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["estado"], "pendiente_firma")
        acuerdo = AcuerdoPago.objects.get(id=r.json()["id"])
        self.assertIsNotNone(acuerdo.documento_id)
        self.assertEqual(self.cartera.cuotas.filter(anulada=False).count(), 2)
        self.assertEqual(self.cartera.saldo_pendiente, Decimal("1000000.00"))

    def test_rechaza_suma_que_no_cuadra(self):
        r = self._crear_acuerdo(["500000", "400000"])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "SUMA_NO_CUADRA")
        self.assertEqual(r.json()["detalle"]["diferencia"], "-100000.00")

    def test_rechaza_fecha_pasada(self):
        plan = self._plan(["1000000"])
        plan[0]["fecha_esperada"] = (timezone.localdate() - timedelta(days=1)).isoformat()
        r = self.client.post(
            "/api/v1/cartera/acuerdos/",
            {"cartera": str(self.cartera.id), "motivo": "prueba", "cuotas": plan},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "FECHA_PASADA")

    def test_rechaza_segundo_acuerdo_pendiente(self):
        self.assertEqual(self._crear_acuerdo(["1000000"]).status_code, 201)
        r = self._crear_acuerdo(["1000000"])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "ACUERDO_PENDIENTE_EXISTE")

    def test_rechaza_sin_documenso(self):
        with override_settings(DOCUMENSO_API_URL="", DOCUMENSO_API_KEY=""):
            r = self._crear_acuerdo(["1000000"])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "FIRMA_NO_DISPONIBLE")

    def test_sin_saldo_no_permite_acuerdo(self):
        for c in self.cartera.cuotas.all():
            c.valor_pagado = c.valor_esperado
            c.pagada = True
            c.save()
        r = self._crear_acuerdo(["1000000"])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "SIN_SALDO")

    # ── bloqueos mientras esta pendiente ───────────────────────────────────
    def test_pago_bloqueado_con_acuerdo_pendiente(self):
        self._crear_acuerdo(["1000000"])
        cuota = self.cartera.cuotas.filter(anulada=False).first()
        r = self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/registrar_pago/",
            {"valor_pagado": "100000", "fecha_pago": timezone.localdate().isoformat(),
             "medio_pago": "transferencia"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "ACUERDO_PENDIENTE_FIRMA")

    def test_modificar_plazo_bloqueado_con_acuerdo_pendiente(self):
        self._crear_acuerdo(["1000000"])
        cuota = self.cartera.cuotas.filter(anulada=False).first()
        r = self.client.patch(
            f"/api/v1/cartera/cuotas/{cuota.id}/",
            {"fecha_vencimiento": (timezone.localdate() + timedelta(days=90)).isoformat()},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "ACUERDO_PENDIENTE_FIRMA")

    # ── aplicacion al firmar ───────────────────────────────────────────────
    def test_aplicar_acuerdo_al_firmar(self):
        r = self._crear_acuerdo(["300000", "300000", "400000"])
        acuerdo = self._firmar_acta(AcuerdoPago.objects.get(id=r.json()["id"]))

        self.assertEqual(acuerdo.estado, "vigente")
        self.assertIsNotNone(acuerdo.vigente_desde)
        viejas = self.cartera.cuotas.filter(acuerdo__isnull=True)
        self.assertTrue(all(c.anulada and c.excepcion_aprobada for c in viejas))
        self.assertEqual(self.cartera.cuotas.filter(acuerdo=acuerdo).count(), 3)
        self.cartera.refresh_from_db()
        self.assertEqual(self.cartera.saldo_pendiente, Decimal("1000000.00"))
        self.assertEqual(self.cartera.cuotas.filter(anulada=False).count(), 3)

    def test_aplicar_es_idempotente(self):
        from apps.cartera.services import aplicar_acuerdo_pago

        r = self._crear_acuerdo(["1000000"])
        acuerdo = self._firmar_acta(AcuerdoPago.objects.get(id=r.json()["id"]))
        aplicar_acuerdo_pago(acuerdo)
        self.assertEqual(self.cartera.cuotas.filter(anulada=False).count(), 1)

    def test_abono_parcial_se_cierra_al_aplicar(self):
        cuota = self.cartera.cuotas.order_by("valor_esperado").first()  # la de 400000
        cuota.valor_pagado = Decimal("150000")
        cuota.save(update_fields=["valor_pagado"])
        r = self._crear_acuerdo(["425000", "425000"])
        self._firmar_acta(AcuerdoPago.objects.get(id=r.json()["id"]))
        cuota.refresh_from_db()
        self.assertTrue(cuota.pagada)
        self.assertEqual(cuota.valor_esperado, Decimal("150000"))
        self.assertFalse(cuota.anulada)
        self.cartera.refresh_from_db()
        self.assertEqual(self.cartera.saldo_pendiente, Decimal("850000.00"))

    def test_requiere_revision_si_saldo_cambio(self):
        r = self._crear_acuerdo(["1000000"])
        acuerdo = AcuerdoPago.objects.get(id=r.json()["id"])
        cuota = self.cartera.cuotas.filter(anulada=False).first()
        cuota.valor_pagado = Decimal("200000")
        cuota.save(update_fields=["valor_pagado"])
        acuerdo = self._firmar_acta(acuerdo)
        self.assertEqual(acuerdo.estado, "requiere_revision")
        self.assertEqual(self.cartera.cuotas.filter(anulada=False).count(), 2)

    # ── anulacion ──────────────────────────────────────────────────────────
    def test_anular_acuerdo_pendiente(self):
        r = self._crear_acuerdo(["1000000"])
        acuerdo_id = r.json()["id"]
        a = self.client.post(
            f"/api/v1/cartera/acuerdos/{acuerdo_id}/anular/",
            {"motivo": "El paciente no acepto."}, format="json",
        )
        self.assertEqual(a.status_code, 200)
        self.assertEqual(a.json()["estado"], "anulado")
        acuerdo = AcuerdoPago.objects.get(id=acuerdo_id)
        self.assertEqual(acuerdo.documento.estado, Consentimiento.Estado.REVOCADO)
        self.assertEqual(self._crear_acuerdo(["1000000"]).status_code, 201)

    def test_no_se_puede_anular_acuerdo_vigente(self):
        r = self._crear_acuerdo(["1000000"])
        acuerdo = self._firmar_acta(AcuerdoPago.objects.get(id=r.json()["id"]))
        a = self.client.post(
            f"/api/v1/cartera/acuerdos/{acuerdo.id}/anular/", {"motivo": "x"}, format="json",
        )
        self.assertEqual(a.status_code, 400)
        self.assertEqual(a.json()["code"], "ACUERDO_NO_ANULABLE")

    # ── mora ───────────────────────────────────────────────────────────────
    def test_acuerdo_vigente_levanta_la_mora(self):
        from apps.agenda.services import deuda_bloqueante_info

        self.clinica.bloquear_agenda_por_deuda = True
        self.clinica.save(update_fields=["bloquear_agenda_por_deuda"])
        self.cartera.cuotas.all().update(fecha_esperada=timezone.localdate() - timedelta(days=10))
        self.assertIsNotNone(deuda_bloqueante_info(self.paciente, self.clinica))

        r = self._crear_acuerdo(["1000000"])
        self.assertIsNotNone(deuda_bloqueante_info(self.paciente, self.clinica))

        self._firmar_acta(AcuerdoPago.objects.get(id=r.json()["id"]))
        self.assertIsNone(deuda_bloqueante_info(self.paciente, self.clinica))

    # ── detalle de cartera ─────────────────────────────────────────────────
    def test_detalle_cartera_no_muestra_cuotas_anuladas(self):
        r = self._crear_acuerdo(["500000", "500000"])
        self._firmar_acta(AcuerdoPago.objects.get(id=r.json()["id"]))
        detalle = self.client.get(f"/api/v1/cartera/{self.cartera.id}/").json()
        self.assertEqual(len(detalle["cuotas"]), 2)
        self.assertTrue(all(not c["anulada"] for c in detalle["cuotas"]))
        self.assertEqual(len(detalle["acuerdos"]), 1)
        self.assertIsNone(detalle["acuerdo_pendiente"])
