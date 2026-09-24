"""Endpoints que usa el schedule de n8n para los recordatorios automaticos:
recordatorios_pendientes solo devuelve citas de clinicas que pueden enviar
WhatsApp (addon + cupo) y marcar_recordatorio_enviado descuenta cupo una sola vez."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Plan, Sede, Servicio
from apps.notificaciones.models import EnvioWhatsApp
from apps.pacientes.models import Paciente

User = get_user_model()

SECRET = "secreto-n8n-test"
URL_PENDIENTES = "/api/v1/agenda/citas/recordatorios_pendientes/"


def url_marcar(cita):
    return f"/api/v1/agenda/citas/{cita.pk}/marcar_recordatorio_enviado/"


@override_settings(N8N_WEBHOOK_SECRET=SECRET)
class RecordatoriosN8nTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_N8N_SECRET=SECRET)
        self.contador = 0

    def _crear_clinica(self, nombre, *, plan=None, whatsapp_override=None):
        self.contador += 1
        clinica = Clinica.objects.create(
            nombre=nombre, nit=f"90077700{self.contador}", plan=plan, whatsapp_override=whatsapp_override,
            recordatorios_automaticos=True, intervalo_recordatorio_horas=24,
        )
        sede = Sede.objects.create(
            clinica=clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        profesional = User.objects.create_user(
            email=f"prof{self.contador}@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=clinica, es_profesional=True,
        )
        servicio = Servicio.objects.create(clinica=clinica, nombre="Consulta", duracion_min=30)
        paciente = Paciente.objects.create(
            clinica=clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento=f"10{self.contador}",
            nombres="Marta", apellidos="Gomez", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        clinica._fixture = (sede, profesional, servicio, paciente)
        return clinica

    def _crear_cita(self, clinica, *, horas=24, manual=False):
        sede, profesional, servicio, paciente = clinica._fixture
        inicio = timezone.now() + timedelta(hours=horas)
        return Cita.objects.create(
            paciente=paciente, sede=sede, servicio=servicio, servicio_nombre=servicio.nombre,
            duracion_min=30, profesional=profesional, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            estado=Cita.Estado.PENDIENTE, canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
            recordatorio_manual_pendiente=manual,
        )

    def _ids_pendientes(self):
        response = self.client.get(URL_PENDIENTES)
        self.assertEqual(response.status_code, 200)
        return {item["id"] for item in response.json()}

    # --- recordatorios_pendientes ---

    def test_sin_secreto_no_autoriza(self):
        self.client.credentials()
        self.assertEqual(self.client.get(URL_PENDIENTES).status_code, 401)

    def test_devuelve_citas_en_ventana_y_manuales(self):
        clinica = self._crear_clinica("Clinica A")
        en_ventana = self._crear_cita(clinica, horas=24)
        manual = self._crear_cita(clinica, horas=72, manual=True)
        fuera = self._crear_cita(clinica, horas=72)
        ids = self._ids_pendientes()
        self.assertIn(str(en_ventana.pk), ids)
        self.assertIn(str(manual.pk), ids)
        self.assertNotIn(str(fuera.pk), ids)

    def test_excluye_clinica_sin_addon_whatsapp(self):
        clinica = self._crear_clinica("Clinica sin addon", whatsapp_override=False)
        self._crear_cita(clinica, horas=24)
        self._crear_cita(clinica, horas=72, manual=True)
        self.assertEqual(self._ids_pendientes(), set())

    def test_respeta_cupo_restante(self):
        plan = Plan.objects.create(nombre="Plan cupo", whatsapp_habilitado=True, whatsapp_envios_incluidos=3)
        clinica = self._crear_clinica("Clinica con cupo", plan=plan)
        EnvioWhatsApp.objects.create(clinica=clinica, tipo=EnvioWhatsApp.Tipo.CHECKIN_OTP)
        for _ in range(4):
            self._crear_cita(clinica, horas=24)
        # Cupo 3, ya usado 1: solo quedan 2 envios.
        self.assertEqual(len(self._ids_pendientes()), 2)

    def test_cupo_agotado_no_devuelve_nada_y_no_afecta_otras_clinicas(self):
        plan = Plan.objects.create(nombre="Plan agotado", whatsapp_habilitado=True, whatsapp_envios_incluidos=1)
        agotada = self._crear_clinica("Clinica agotada", plan=plan)
        EnvioWhatsApp.objects.create(clinica=agotada, tipo=EnvioWhatsApp.Tipo.CHECKIN_OTP)
        self._crear_cita(agotada, horas=24)
        sana = self._crear_clinica("Clinica sana")
        cita_sana = self._crear_cita(sana, horas=24)
        self.assertEqual(self._ids_pendientes(), {str(cita_sana.pk)})

    # --- marcar_recordatorio_enviado ---

    def test_marcar_registra_envio_y_marca_cita(self):
        clinica = self._crear_clinica("Clinica marcar")
        cita = self._crear_cita(clinica, horas=24)
        response = self.client.post(url_marcar(cita))
        self.assertEqual(response.status_code, 200)
        cita.refresh_from_db()
        self.assertTrue(cita.recordatorio_enviado)
        self.assertEqual(cita.estado_confirmacion, Cita.EstadoConfirmacion.ENVIADO)
        envios = EnvioWhatsApp.objects.filter(clinica=clinica, tipo=EnvioWhatsApp.Tipo.RECORDATORIO_CITA)
        self.assertEqual(envios.count(), 1)
        self.assertEqual(envios.get().paciente_id, cita.paciente_id)

    def test_marcar_dos_veces_descuenta_una_sola_vez(self):
        clinica = self._crear_clinica("Clinica reintento")
        cita = self._crear_cita(clinica, horas=24)
        self.client.post(url_marcar(cita))
        response = self.client.post(url_marcar(cita))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(EnvioWhatsApp.objects.filter(clinica=clinica).count(), 1)

    def test_marcar_recordatorio_manual_tras_uno_ya_enviado_descuenta_de_nuevo(self):
        clinica = self._crear_clinica("Clinica manual")
        cita = self._crear_cita(clinica, horas=24)
        self.client.post(url_marcar(cita))
        # El usuario pide otro recordatorio desde la agenda.
        Cita.objects.filter(pk=cita.pk).update(recordatorio_manual_pendiente=True, recordatorio_enviado=False)
        self.client.post(url_marcar(cita))
        cita.refresh_from_db()
        self.assertFalse(cita.recordatorio_manual_pendiente)
        self.assertEqual(EnvioWhatsApp.objects.filter(clinica=clinica).count(), 2)

    def test_marcar_sin_secreto_no_autoriza(self):
        clinica = self._crear_clinica("Clinica secreto")
        cita = self._crear_cita(clinica, horas=24)
        self.client.credentials()
        self.assertEqual(self.client.post(url_marcar(cita)).status_code, 401)
        self.assertFalse(EnvioWhatsApp.objects.exists())
