"""Prueba con todo activo: plan de prueba, cupo de WhatsApp de la prueba y qué se pierde al elegir plan."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Plan, Sede
from apps.core.models import ConfiguracionGlobal
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.notificaciones import services as notificaciones
from apps.notificaciones.models import ConexionWhatsappPropio, EnvioWhatsApp, NumeroWhatsapp

from . import seguimiento, services
from .models import Suscripcion
from .tests_cobros import WOMPI

ACEPTACION = {
    "acceptance_token": "acc", "permalink_terminos": "https://x", "accept_personal_auth": "per", "permalink_datos": "https://y",
}


class PlanDePruebaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.basico = Plan.objects.create(
            nombre="Solo", precio=Decimal("120000"), max_usuarios=2, max_sedes=1,
            whatsapp_habilitado=False, modulo_estetico_habilitado=False,
        )
        self.completo = Plan.objects.create(
            nombre="Todo", precio=Decimal("0"), max_usuarios=0, max_sedes=0, whatsapp_habilitado=True,
            whatsapp_envios_incluidos=500, whatsapp_numero_propio_habilitado=True, modulo_estetico_habilitado=True,
        )
        Clinica.objects.filter(pk=self.clinica.pk).update(plan=self.basico)
        config = ConfiguracionGlobal.get_solo()
        config.plan_prueba = self.completo
        config.whatsapp_envios_prueba = 2
        config.save()

    def _clinica(self):
        # Instancia nueva: plan_vigente y en_prueba se guardan en caché por instancia.
        return Clinica.objects.get(pk=self.clinica.pk)

    def test_en_prueba_aplica_el_plan_de_prueba_y_al_pagar_el_contratado(self):
        s = services.crear_prueba(self.clinica, 14)
        clinica = self._clinica()
        self.assertEqual(clinica.plan_vigente, self.completo)
        self.assertTrue(clinica.modulo_estetico_habilitado)
        self.assertTrue(clinica.whatsapp_numero_propio_habilitado)

        Suscripcion.objects.filter(pk=s.pk).update(estado=Suscripcion.Estado.ACTIVA, prueba_termina_el=None)
        clinica = self._clinica()
        self.assertEqual(clinica.plan_vigente, self.basico)
        self.assertFalse(clinica.modulo_estetico_habilitado)
        self.assertFalse(clinica.whatsapp_habilitado)

    def test_prueba_vencida_deja_de_tener_el_plan_de_prueba(self):
        s = services.crear_prueba(self.clinica, 14)
        Suscripcion.objects.filter(pk=s.pk).update(prueba_termina_el=timezone.now() - timedelta(hours=1))
        self.assertEqual(self._clinica().plan_vigente, self.basico)

    def test_sin_plan_de_prueba_configurado_usa_el_de_la_clinica(self):
        ConfiguracionGlobal.objects.update(plan_prueba=None)
        services.crear_prueba(self.clinica, 14)
        self.assertEqual(self._clinica().plan_vigente, self.basico)

    def test_los_overrides_de_la_clinica_mandan_sobre_el_plan_de_prueba(self):
        services.crear_prueba(self.clinica, 14)
        Clinica.objects.filter(pk=self.clinica.pk).update(modulo_estetico_override=False)
        self.assertFalse(self._clinica().modulo_estetico_habilitado)

    def test_el_cupo_de_whatsapp_de_la_prueba_cuenta_toda_la_prueba(self):
        s = services.crear_prueba(self.clinica, 14)
        clinica = self._clinica()
        self.assertEqual(clinica.whatsapp_envios_incluidos, 2)
        # Un envío de antes de la prueba no cuenta; los de la prueba sí, aunque cambie el mes.
        viejo = EnvioWhatsApp.objects.create(clinica=clinica, tipo="recordatorio", ruta=EnvioWhatsApp.Ruta.COMPARTIDO)
        EnvioWhatsApp.objects.filter(pk=viejo.pk).update(created_at=s.created_at - timedelta(days=1))
        notificaciones.registrar_envio_whatsapp(clinica, "recordatorio")
        notificaciones.verificar_disponibilidad_whatsapp(clinica)
        notificaciones.registrar_envio_whatsapp(clinica, "recordatorio")
        with self.assertRaisesMessage(notificaciones.WhatsAppNoDisponibleError, "de tu prueba"):
            notificaciones.verificar_disponibilidad_whatsapp(clinica)

    def test_el_limite_de_usuarios_en_prueba_es_el_del_plan_de_prueba(self):
        from apps.users.views import _check_clinica_user_limit

        services.crear_prueba(self.clinica, 14)
        for i in range(3):
            User.objects.create_user(
                email=f"u{i}@test.com", password="Secret123!", first_name="U", last_name=str(i),
                rol=User.Role.RECEPCION, clinica=self.clinica,
            )
        _check_clinica_user_limit(self._clinica())  # el plan de prueba no tiene límite

    def test_numero_propio_en_prueba(self):
        from apps.notificaciones import numero_propio

        services.crear_prueba(self.clinica, 14)
        with override_settings(CLINIQ_VENTAS_WHATSAPP="573001112233"):
            estado = numero_propio.estado(self._clinica())
        self.assertTrue(estado["en_prueba"])
        self.assertIn("estoy%20probando", estado["contacto_ventas_url"])


@override_settings(**WOMPI)
class ElegirPlanDesdeLaPruebaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.chico = Plan.objects.create(
            nombre="Solo", precio=Decimal("120000"), max_usuarios=0, max_sedes=1, mostrar_publico=True,
            whatsapp_habilitado=True, whatsapp_numero_propio_habilitado=False, modulo_estetico_habilitado=False,
        )
        self.grande = Plan.objects.create(
            nombre="Clínica", precio=Decimal("270000"), max_usuarios=0, max_sedes=0, mostrar_publico=True,
            whatsapp_habilitado=True, whatsapp_numero_propio_habilitado=True, modulo_estetico_habilitado=True,
        )
        config = ConfiguracionGlobal.get_solo()
        config.plan_prueba = self.grande
        config.save()
        services.crear_prueba(self.clinica, 14)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _planes(self):
        with patch("apps.suscripciones.wompi.tokens_aceptacion", return_value=ACEPTACION):
            respuesta = self.client.get("/api/v1/suscripcion/pago/config/")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        return {p["nombre"]: p for p in respuesta.data["planes"]}

    def test_cada_plan_dice_que_funciones_de_la_prueba_se_pierden(self):
        planes = self._planes()
        self.assertEqual(planes["Solo"]["pierdes"], ["Módulo estético", "WhatsApp con número propio"])
        self.assertEqual(planes["Clínica"]["pierdes"], [])
        self.assertEqual(planes["Solo"]["bloqueo"], "")

    def test_un_plan_mas_chico_que_el_uso_actual_queda_bloqueado(self):
        Sede.objects.create(clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 9", telefono="3000000001")
        planes = self._planes()
        self.assertIn("2 sedes", planes["Solo"]["bloqueo"])
        self.assertEqual(planes["Clínica"]["bloqueo"], "")

    def test_la_consola_ve_si_la_prueba_conecto_su_numero(self):
        s = Suscripcion.objects.get(clinica=self.clinica)
        self.assertFalse(seguimiento.fila(s)["numero_propio_conectado"])
        conexion = ConexionWhatsappPropio.objects.create(clinica=self.clinica)
        NumeroWhatsapp.objects.create(conexion=conexion, lyvio_inbox_id="inbox-1", waba_id="waba-1")
        self.assertTrue(seguimiento.fila(s)["numero_propio_conectado"])
