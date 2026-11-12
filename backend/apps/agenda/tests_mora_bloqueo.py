"""Bloqueo por mora en sesiones de tratamientos (decisión del 12/11/2026).

Un paciente compró un tratamiento y su cartera tiene una cuota vencida hace
cinco días. Con ``bloquear_agenda_por_deuda`` encendido:

- se puede agendar (el modal avisa con ``deuda_paciente``);
- no se lo puede recibir (confirmada → en espera) ni iniciar su atención;
- con la excepción aprobada en Cartera, se lo recibe.

Con el bloqueo apagado (como nace la clínica) no se frena nada, pero el modal
igual avisa de la mora.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.cartera.models import Cartera, CuotaCartera
from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente


User = get_user_model()


class MoraTratamientoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-mora@example.com",
            password="secret123",
            first_name="Root",
            last_name="Mora",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        # Como queda una clínica nueva: sin tocar la configuración de deuda.
        self.clinica = Clinica.objects.create(nombre="Clinica Mora", nit="900555001")
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario={dia: ["08:00", "18:00"] for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")},
        )
        self.profesional = User.objects.create_user(
            email="prof-mora@example.com",
            password="secret123",
            first_name="Ana",
            last_name="Lopez",
            rol=User.Role.PROFESIONAL,
            es_profesional=True,
            clinica=self.clinica,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="555000111",
            nombres="Laura",
            apellidos="Mora",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 2",
            telefono="3005550011",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.servicio = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Peeling",
            descripcion="Peeling quimico",
            duracion_min=30,
            precio="150000.00",
        )
        # Venta del tratamiento: cotización aceptada con un ítem de 3 sesiones.
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        self.item = self.cotizacion.items.create(
            servicio=self.servicio,
            descripcion="Peeling quimico x3",
            num_citas=3,
            valor_unitario="150000.00",
            descuento_porcentaje="0.00",
        )
        cartera = Cartera.objects.create(
            cotizacion=self.cotizacion, paciente=self.paciente, total="450000.00",
        )
        CuotaCartera.objects.create(
            cartera=cartera,
            tipo=FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia"),
            valor_esperado="150000.00",
            fecha_esperada=timezone.localdate() - timedelta(days=5),
            pagada=False,
        )

    def _payload_cita_del_tratamiento(self):
        fecha = timezone.localtime() + timedelta(days=1)
        while fecha.weekday() >= 5:
            fecha += timedelta(days=1)
        fecha = fecha.replace(hour=10, minute=0, second=0, microsecond=0)
        return {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "servicio": str(self.servicio.id),
            "profesional": str(self.profesional.id),
            "fecha_inicio": fecha.isoformat(),
            "canal_origen": "presencial",
            "item_cotizacion": str(self.item.id),
        }

    def _activar_bloqueo(self):
        self.clinica.bloquear_agenda_por_deuda = True
        self.clinica.save(update_fields=["bloquear_agenda_por_deuda"])

    def _agendar(self):
        creada = self.client.post("/api/v1/agenda/citas/", self._payload_cita_del_tratamiento(), format="json")
        self.assertEqual(creada.status_code, 201, creada.content)
        return creada.json()["id"]

    def _cambiar_estado(self, cita_id, estado):
        return self.client.post(
            f"/api/v1/agenda/citas/{cita_id}/cambiar_estado/", {"estado": estado}, format="json",
        )

    def _recibir(self, cita_id):
        Cita.objects.filter(pk=cita_id).update(estado=Cita.Estado.CONFIRMADA)
        return self._cambiar_estado(cita_id, Cita.Estado.EN_ESPERA)

    def test_con_bloqueo_se_agenda_pero_no_se_recibe(self):
        self._activar_bloqueo()
        cita_id = self._agendar()

        respuesta = self._recibir(cita_id)

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json()["code"], "PACIENTE_CON_DEUDA")
        self.assertIn("recibir al paciente", respuesta.json()["error"])
        self.assertEqual(Cita.objects.get(pk=cita_id).estado, Cita.Estado.CONFIRMADA)

    def test_con_bloqueo_tampoco_se_inicia_si_ya_estaba_en_espera(self):
        self._activar_bloqueo()
        cita_id = self._agendar()
        Cita.objects.filter(pk=cita_id).update(estado=Cita.Estado.EN_ESPERA)

        respuesta = self._cambiar_estado(cita_id, Cita.Estado.EN_CURSO)

        self.assertEqual(respuesta.json()["code"], "PACIENTE_CON_DEUDA")

    def test_desiniciar_no_se_frena_por_mora(self):
        self._activar_bloqueo()
        cita_id = self._agendar()
        Cita.objects.filter(pk=cita_id).update(estado=Cita.Estado.EN_CURSO)

        respuesta = self._cambiar_estado(cita_id, Cita.Estado.EN_ESPERA)

        self.assertEqual(respuesta.status_code, 200, respuesta.content)

    def test_con_excepcion_aprobada_se_recibe(self):
        self._activar_bloqueo()
        cita_id = self._agendar()
        CuotaCartera.objects.filter(cartera__paciente=self.paciente).update(excepcion_aprobada=True)

        respuesta = self._recibir(cita_id)

        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(Cita.objects.get(pk=cita_id).estado, Cita.Estado.EN_ESPERA)

    def test_sin_bloqueo_se_recibe_igual(self):
        self.assertFalse(self.clinica.bloquear_agenda_por_deuda)
        cita_id = self._agendar()

        respuesta = self._recibir(cita_id)

        self.assertEqual(respuesta.status_code, 200, respuesta.content)

    def test_aviso_para_el_modal_de_agendar(self):
        url = f"/api/v1/agenda/citas/deuda_paciente/?paciente={self.paciente.id}"

        sin_bloqueo = self.client.get(url).json()["deuda"]
        self.assertEqual(sin_bloqueo["cuotas_vencidas"], 1)
        self.assertEqual(sin_bloqueo["monto_total"], "150000.00")
        self.assertFalse(sin_bloqueo["bloquea_recepcion"])

        self._activar_bloqueo()
        self.assertTrue(self.client.get(url).json()["deuda"]["bloquea_recepcion"])

        CuotaCartera.objects.filter(cartera__paciente=self.paciente).update(excepcion_aprobada=True)
        self.assertIsNone(self.client.get(url).json()["deuda"])

    def test_aviso_no_ve_pacientes_de_otra_clinica(self):
        otra = Clinica.objects.create(nombre="Otra", nit="900555002")
        recepcion = User.objects.create_user(
            email="recepcion-otra@example.com", password="secret123",
            first_name="Rita", last_name="Otra", rol=User.Role.ADMIN, clinica=otra,
        )
        self.client.force_authenticate(recepcion)

        respuesta = self.client.get(f"/api/v1/agenda/citas/deuda_paciente/?paciente={self.paciente.id}")

        self.assertEqual(respuesta.status_code, 404)
