"""Hito 5: sin los pasos de Preparar paciente no se inicia la atención (21/10/2026)."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import FormaDePago
from apps.cobros.models import Cobro
from apps.configuracion.models import ConfiguracionWizard
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.pacientes.models import CheckIn


class PasosRecepcionTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.client = APIClient()
        self.client.force_authenticate(self.profesional)
        inicio = timezone.now() - timedelta(minutes=5)
        self.cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=Cita.Estado.EN_ESPERA, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.config, _ = ConfiguracionWizard.objects.get_or_create(clinica=self.clinica)

    def _iniciar(self):
        return self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/", {"estado": "en_curso"}, format="json",
        )

    def _configurar(self, **pasos):
        for clave, valor in pasos.items():
            setattr(self.config, clave, valor)
        self.config.save()

    def _cobrar(self, estado=Cobro.Estado.PAGADO):
        return Cobro.objects.create(
            origen=Cobro.Origen.CITA, cita=self.cita, paciente=self.paciente, sede=self.sede,
            created_by=self.profesional, total="150000", subtotal="150000", estado=estado,
        )

    def test_sin_pago_ni_firma_no_se_inicia(self):
        r = self._iniciar()

        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "PASOS_RECEPCION_PENDIENTES")
        self.assertEqual(r.json()["pendientes"], ["Pago", "Firma de asistencia"])
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.EN_ESPERA)

    def test_con_los_pasos_completos_se_inicia(self):
        self._cobrar()
        Cita.objects.filter(id=self.cita.id).update(firma_asistencia_estado=Cita.FirmaAsistenciaEstado.FIRMADA)

        r = self._iniciar()

        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.json()["estado"], Cita.Estado.EN_CURSO)

    def test_un_cobro_sin_pagos_no_cuenta_como_pago(self):
        self._cobrar(estado=Cobro.Estado.PENDIENTE)
        self._configurar(paso_firma_asistencia=False)

        r = self._iniciar()

        self.assertEqual(r.json().get("pendientes"), ["Pago"])

    def test_los_pasos_apagados_no_se_exigen(self):
        self._configurar(paso_pago=False, paso_firma_asistencia=False)

        self.assertEqual(self._iniciar().status_code, 200)

    def test_la_cita_de_una_cotizacion_no_pide_pago(self):
        from apps.cotizaciones.models import Cotizacion, ItemCotizacion

        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.profesional,
            estado=Cotizacion.Estado.ACEPTADA, aceptada_en=timezone.now(),
        )
        item = ItemCotizacion.objects.create(
            cotizacion=cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.servicio,
            descripcion=self.servicio.nombre, num_citas=1, valor_unitario="150000",
        )
        Cita.objects.filter(id=self.cita.id).update(item_cotizacion=item)
        self._configurar(paso_firma_asistencia=False)

        self.assertEqual(self._iniciar().status_code, 200)

    def test_la_cita_de_una_sesion_de_tratamiento_no_pide_pago(self):
        """Aunque no tenga ítem de cotización: el cobro va por el tratamiento."""
        from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

        tratamiento = TratamientoPaciente.objects.create(paciente=self.paciente)
        SesionProcedimiento.objects.create(tratamiento=tratamiento, cita=self.cita, procedimiento=self.servicio)
        self._configurar(paso_firma_asistencia=False)

        self.assertEqual(self._iniciar().status_code, 200)

    def test_la_verificacion_facial_exige_un_intento_registrado(self):
        self.clinica.facial_verificacion_override = True
        self.clinica.save(update_fields=["facial_verificacion_override", "updated_at"])
        self._configurar(paso_verificacion_facial=True, paso_pago=False, paso_firma_asistencia=False)

        self.assertEqual(self._iniciar().json().get("pendientes"), ["Verificación de identidad"])

        # "Continuar sin verificar" deja el salto registrado y desbloquea.
        r = self.client.post(
            f"/api/v1/pacientes/{self.paciente.id}/omitir_verificacion/", {"cita_id": str(self.cita.id)}, format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        checkin = CheckIn.objects.get(cita=self.cita)
        self.assertTrue(checkin.omitido)
        self.assertEqual(checkin.realizado_por, self.profesional)

        self.assertEqual(self._iniciar().status_code, 200)

    def test_la_verificacion_no_cuenta_sin_el_addon(self):
        self.clinica.facial_verificacion_override = False
        self.clinica.save(update_fields=["facial_verificacion_override", "updated_at"])
        self._configurar(paso_verificacion_facial=True, paso_pago=False, paso_firma_asistencia=False)

        self.assertEqual(self._iniciar().status_code, 200)

    def test_la_cita_dice_si_hay_verificacion_registrada(self):
        url = f"/api/v1/agenda/citas/{self.cita.id}/"
        self.assertFalse(self.client.get(url).json()["verificacion_identidad_registrada"])
        CheckIn.objects.create(
            paciente=self.paciente, cita=self.cita, score=0, confidence=CheckIn.Confidence.BAJA,
            match=False, det_score_live=0, omitido=True,
        )
        self.assertTrue(self.client.get(url).json()["verificacion_identidad_registrada"])


class CobroDesdePrepararPacienteTests(ClinicaFixtureMixin, TestCase):
    """Quien maneja Preparar paciente de una cita puede cobrarla, aunque su rol no cobre."""

    def setUp(self):
        self.crear_clinica_base()
        self.otro = User.objects.create_user(
            email="otro-cobro@test.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.client = APIClient()
        inicio = timezone.now() - timedelta(minutes=5)
        self.cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=Cita.Estado.EN_ESPERA, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.medio = FormaDePago.objects.filter(clinica=self.clinica, activo=True).first()

    def _cobrar(self, user, **cambios):
        self.client.force_authenticate(user)
        datos = {
            "cita": str(self.cita.id), "paciente": str(self.paciente.id), "sede": str(self.sede.id),
            "items": [{
                "tipo": "servicio", "servicio": str(self.servicio.id),
                "precio_unitario": str(self.servicio.precio), "cantidad": "1",
            }],
            "pagos": [{"medio_pago": str(self.medio.id), "valor": str(self.servicio.precio)}],
        }
        datos.update(cambios)
        return self.client.post("/api/v1/cobros/cobros/", datos, format="json")

    def test_el_profesional_cobra_la_cita_que_recibe(self):
        r = self._cobrar(self.profesional)

        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertTrue(Cobro.objects.filter(cita=self.cita, estado=Cobro.Estado.PAGADO).exists())

    def test_no_cobra_la_cita_de_otro_profesional(self):
        self.assertEqual(self._cobrar(self.otro).status_code, 403)

    def test_solo_el_procedimiento_de_la_cita(self):
        otro_servicio = self.servicio.__class__.objects.create(
            clinica=self.clinica, nombre="Otro", descripcion="x", duracion_min=30, precio="90000.00",
        )
        r = self._cobrar(self.profesional, items=[{
            "tipo": "servicio", "servicio": str(otro_servicio.id), "precio_unitario": "90000.00", "cantidad": "1",
        }])

        self.assertEqual(r.status_code, 403)

    def test_sin_cita_no_hay_cobro_libre(self):
        self.client.force_authenticate(self.profesional)
        r = self.client.post("/api/v1/cobros/cobros/", {
            "origen": "libre", "paciente": str(self.paciente.id), "sede": str(self.sede.id),
        }, format="json")

        self.assertEqual(r.status_code, 403)
