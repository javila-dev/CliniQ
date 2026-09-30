"""Funcion central de envio de WhatsApp: todos los envios pasan por
enviar_whatsapp, que valida addon/cupo, despacha segun el tipo y registra el
envio solo si salio bien."""
from datetime import timedelta
from unittest.mock import patch

import requests
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.clinicas.models import Clinica, Plan, Sede
from apps.notificaciones.models import EnvioWhatsApp
from apps.notificaciones.services import (
    WhatsAppNoDisponibleError,
    enviar_whatsapp,
    resolver_ruta_whatsapp,
)
from apps.pacientes.models import Paciente

SERVICES = "apps.notificaciones.services"
Tipo = EnvioWhatsApp.Tipo


class EnviarWhatsappTests(TestCase):
    def setUp(self):
        self.clinica = Clinica.objects.create(nombre="Clinica Envios", nit="900555001")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="5501",
            nombres="Ana", apellidos="Ruiz", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3001112233", autoriza_datos=True,
        )

    def _envios(self, tipo=None):
        qs = EnvioWhatsApp.objects.filter(clinica=self.clinica)
        return qs.filter(tipo=tipo) if tipo else qs

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_checkin_otp(self, transporte):
        enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="123456")
        transporte.assert_called_once_with(paciente=self.paciente, codigo="123456")
        self.assertEqual(self._envios(Tipo.CHECKIN_OTP).count(), 1)

    @patch(f"{SERVICES}.enviar_link_firma_whatsapp")
    def test_firma_documento(self, transporte):
        enviar_whatsapp(
            clinica=self.clinica, sede=self.sede, tipo=Tipo.FIRMA_DOCUMENTO, paciente=self.paciente,
            documento_tipo="consentimiento", link="https://firma.test/x", metadata={"a": "b"},
        )
        transporte.assert_called_once_with(
            paciente=self.paciente, documento_tipo="consentimiento", link="https://firma.test/x", metadata={"a": "b"},
        )
        self.assertEqual(self._envios(Tipo.FIRMA_DOCUMENTO).get().paciente_id, self.paciente.id)

    @patch(f"{SERVICES}.enviar_documento_whatsapp_webhook")
    def test_documentos_usan_el_tipo_como_tipo_notificacion(self, transporte):
        for tipo in (Tipo.ENVIO_COTIZACION, Tipo.ENVIO_FORMULA):
            enviar_whatsapp(
                clinica=self.clinica, tipo=tipo, paciente=self.paciente,
                pdf_bytes=b"%PDF", nombre_archivo_pdf="x.pdf", metadata=None,
            )
            self.assertEqual(transporte.call_args.kwargs["tipo_notificacion"], tipo.value)
            self.assertEqual(self._envios(tipo).count(), 1)

    @patch(f"{SERVICES}.enviar_recordatorio_cita_webhook")
    def test_recordatorio_cita(self, transporte):
        enviar_whatsapp(clinica=self.clinica, tipo=Tipo.RECORDATORIO_CITA, paciente=self.paciente, payload={"id": "1"})
        transporte.assert_called_once_with({"id": "1"})
        self.assertEqual(self._envios(Tipo.RECORDATORIO_CITA).count(), 1)

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook", side_effect=requests.ConnectionError("caido"))
    def test_fallo_del_webhook_no_registra(self, _transporte):
        with self.assertRaises(requests.ConnectionError):
            enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="1")
        self.assertFalse(self._envios().exists())

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_sin_addon_no_envia(self, transporte):
        self.clinica.whatsapp_override = False
        self.clinica.save(update_fields=["whatsapp_override"])
        with self.assertRaises(WhatsAppNoDisponibleError):
            enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="1")
        transporte.assert_not_called()
        self.assertFalse(self._envios().exists())

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_cupo_agotado_no_envia(self, transporte):
        self.clinica.plan = Plan.objects.create(nombre="Cupo 1", whatsapp_envios_incluidos=1)
        self.clinica.save(update_fields=["plan"])
        enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="1")
        with self.assertRaises(WhatsAppNoDisponibleError):
            enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="2")
        self.assertEqual(transporte.call_count, 1)

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_ruta_resuelta_de_antemano(self, transporte):
        ruta = resolver_ruta_whatsapp(self.clinica, self.sede)
        self.assertEqual(ruta.canal, "compartido")
        self.assertEqual(ruta.sede, self.sede)
        enviar_whatsapp(ruta=ruta, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="1")
        self.assertEqual(self._envios().count(), 1)

    def test_tipo_desconocido(self):
        with self.assertRaises(ValueError):
            enviar_whatsapp(clinica=self.clinica, tipo="otro", paciente=self.paciente)
        self.assertFalse(self._envios().exists())

    @override_settings(
        WHATSAPP_OUTBOUND_WEBHOOK_URL="https://n8n.test/webhook/out", ORDEN_WEBHOOK_URL="", N8N_WEBHOOK_SECRET="s3",
    )
    @patch(f"{SERVICES}.requests.post")
    def test_payload_otp_unificado(self, post):
        """El OTP de citas y el de sesiones de protocolo mandan el mismo payload
        (antes el de protocolos no incluia clinica_id ni paciente_id)."""
        enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="654321")
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://n8n.test/webhook/out")
        self.assertEqual(kwargs["headers"], {"X-Webhook-Secret": "s3"})
        self.assertEqual(kwargs["json"], {
            "nombre": "Ana",
            "apellido": "Ruiz",
            "telefono": "3001112233",
            "clinica_id": str(self.clinica.id),
            "paciente_id": str(self.paciente.id),
            "tipo_notificacion": "checkin_otp",
            "codigo": "654321",
        })

    @override_settings(WHATSAPP_OUTBOUND_WEBHOOK_URL="", ORDEN_WEBHOOK_URL="")
    def test_webhook_no_configurado(self):
        with self.assertRaises(ValueError):
            enviar_whatsapp(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="1")
        self.assertFalse(self._envios().exists())


class CheckinOtpCitaTests(TestCase):
    """El OTP de check-in de cita pasa por la funcion central."""

    def setUp(self):
        from django.contrib.auth import get_user_model

        from apps.agenda.models import Cita
        from apps.clinicas.models import Servicio

        User = get_user_model()
        self.clinica = Clinica.objects.create(nombre="Clinica OTP", nit="900555002")
        sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        profesional = User.objects.create_user(
            email="prof-otp@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        servicio = Servicio.objects.create(clinica=self.clinica, nombre="Consulta", duracion_min=30)
        paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="5502",
            nombres="Luis", apellidos="Paz", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="Calle 2", telefono="3002223344", autoriza_datos=True,
        )
        inicio = timezone.now() + timedelta(hours=1)
        self.cita = Cita.objects.create(
            paciente=paciente, sede=sede, servicio=servicio, servicio_nombre="Consulta", duracion_min=30,
            profesional=profesional, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            estado=Cita.Estado.CONFIRMADA,
        )

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_envia_y_registra(self, transporte):
        from apps.agenda.services import iniciar_checkin_otp_cita

        otp, nuevo = iniciar_checkin_otp_cita(self.cita, "127.0.0.1")
        self.assertTrue(nuevo)
        transporte.assert_called_once_with(paciente=self.cita.paciente, codigo=otp.codigo)
        self.assertEqual(EnvioWhatsApp.objects.filter(clinica=self.clinica, tipo=Tipo.CHECKIN_OTP).count(), 1)

    @override_settings(WHATSAPP_OUTBOUND_WEBHOOK_URL="", ORDEN_WEBHOOK_URL="")
    def test_webhook_no_configurado_borra_el_otp(self):
        from apps.agenda.models import CitaCheckinOTP
        from apps.agenda.services import AgendaError, iniciar_checkin_otp_cita

        with self.assertRaises(AgendaError) as ctx:
            iniciar_checkin_otp_cita(self.cita, "127.0.0.1")
        self.assertEqual(ctx.exception.code, "WEBHOOK_NOT_CONFIGURED")
        self.assertFalse(CitaCheckinOTP.objects.filter(cita=self.cita).exists())
        self.assertFalse(EnvioWhatsApp.objects.exists())

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_sin_addon_no_crea_otp(self, transporte):
        from apps.agenda.models import CitaCheckinOTP
        from apps.agenda.services import AgendaError, iniciar_checkin_otp_cita

        self.clinica.whatsapp_override = False
        self.clinica.save(update_fields=["whatsapp_override"])
        with self.assertRaises(AgendaError) as ctx:
            iniciar_checkin_otp_cita(self.cita, "127.0.0.1")
        self.assertEqual(ctx.exception.code, "WHATSAPP_NO_HABILITADO")
        transporte.assert_not_called()
        self.assertFalse(CitaCheckinOTP.objects.filter(cita=self.cita).exists())


class AddonNumeroPropioTests(TestCase):
    """El addon de numero propio depende del addon base de WhatsApp (D1)."""

    def setUp(self):
        self.plan = Plan.objects.create(
            nombre="Plan WA", whatsapp_habilitado=True, whatsapp_numero_propio_habilitado=True,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica Addon", nit="900555101", plan=self.plan)

    def test_hereda_del_plan(self):
        self.assertTrue(self.clinica.whatsapp_numero_propio_habilitado)

    def test_sin_plan_arranca_apagado(self):
        clinica = Clinica.objects.create(nombre="Trial", nit="900555102")
        self.assertTrue(clinica.whatsapp_habilitado)
        self.assertFalse(clinica.whatsapp_numero_propio_habilitado)

    def test_override_prevalece_sobre_el_plan(self):
        self.clinica.whatsapp_numero_propio_override = False
        self.assertFalse(self.clinica.whatsapp_numero_propio_habilitado)

    def test_sin_addon_base_queda_apagado_aunque_el_override_diga_si(self):
        self.clinica.whatsapp_override = False
        self.clinica.whatsapp_numero_propio_override = True
        self.assertFalse(self.clinica.whatsapp_numero_propio_habilitado)

    def test_plan_no_valida_numero_propio_sin_whatsapp_base(self):
        from django.core.exceptions import ValidationError

        from apps.clinicas.serializers import PlanSerializer

        plan = Plan(nombre="Invalido", whatsapp_habilitado=False, whatsapp_numero_propio_habilitado=True)
        with self.assertRaises(ValidationError):
            plan.full_clean()

        crear = PlanSerializer(data={"nombre": "Invalido", "whatsapp_habilitado": False,
                                     "whatsapp_numero_propio_habilitado": True})
        self.assertFalse(crear.is_valid())
        self.assertIn("whatsapp_numero_propio_habilitado", crear.errors)

        apagar_base = PlanSerializer(self.plan, data={"whatsapp_habilitado": False}, partial=True)
        self.assertFalse(apagar_base.is_valid())


class CupoSoloRutaCompartidaTests(TestCase):
    """Los envios por numero propio no descuentan cupo; los del compartido si,
    incluido el respaldo de un envio propio que fallo (D1, D10)."""

    def setUp(self):
        self.plan = Plan.objects.create(nombre="Plan cupo", whatsapp_habilitado=True, whatsapp_envios_incluidos=2)
        self.clinica = Clinica.objects.create(nombre="Clinica Cupo", nit="900555201", plan=self.plan)

    def _envio(self, ruta, **extra):
        return EnvioWhatsApp.objects.create(clinica=self.clinica, tipo=Tipo.ENVIO_COTIZACION, ruta=ruta, **extra)

    def test_envios_propios_no_consumen_cupo(self):
        from apps.notificaciones.services import uso_whatsapp_mes_actual, verificar_disponibilidad_whatsapp

        self._envio(EnvioWhatsApp.Ruta.PROPIO)
        self._envio(EnvioWhatsApp.Ruta.PROPIO)
        self._envio(EnvioWhatsApp.Ruta.COMPARTIDO)
        self._envio(EnvioWhatsApp.Ruta.PROPIO, estado=EnvioWhatsApp.Estado.FALLIDO)
        uso = uso_whatsapp_mes_actual(self.clinica)
        self.assertEqual(uso["envios_realizados"], 1)
        self.assertEqual(uso["envios_numero_propio"], 2)
        verificar_disponibilidad_whatsapp(self.clinica)

    def test_respaldo_por_compartido_consume_cupo(self):
        from apps.notificaciones.services import verificar_disponibilidad_whatsapp

        fallido = self._envio(EnvioWhatsApp.Ruta.PROPIO, estado=EnvioWhatsApp.Estado.FALLIDO)
        self._envio(EnvioWhatsApp.Ruta.COMPARTIDO, respaldo_de=fallido)
        self._envio(EnvioWhatsApp.Ruta.COMPARTIDO)
        with self.assertRaises(WhatsAppNoDisponibleError):
            verificar_disponibilidad_whatsapp(self.clinica)


class NumerosWhatsappModeloTests(TestCase):
    def setUp(self):
        from apps.notificaciones.models import ConexionWhatsappPropio

        self.clinica = Clinica.objects.create(nombre="Clinica Numeros", nit="900555301")
        self.conexion = ConexionWhatsappPropio.objects.create(clinica=self.clinica)
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 3", telefono="3000000001",
        )

    def test_una_asignacion_por_sede(self):
        from django.db import IntegrityError, transaction

        from apps.notificaciones.models import AsignacionWhatsappSede

        AsignacionWhatsappSede.objects.create(conexion=self.conexion, sede=self.sede)
        with self.assertRaises(IntegrityError), transaction.atomic():
            AsignacionWhatsappSede.objects.create(conexion=self.conexion, sede=self.sede, tipo="cliniq")

    def test_numeros_incluidos_no_acepta_cero(self):
        from apps.clinicas.serializers import AdminTenantUpdateSerializer, PlanSerializer

        plan = PlanSerializer(data={
            "nombre": "Cero", "max_usuarios": 1, "max_sedes": 1, "whatsapp_habilitado": True,
            "whatsapp_numero_propio_habilitado": True, "whatsapp_numeros_incluidos": 0,
        })
        self.assertFalse(plan.is_valid())
        self.assertIn("whatsapp_numeros_incluidos", plan.errors)

        tenant = AdminTenantUpdateSerializer(self.clinica, data={"whatsapp_numeros_incluidos_override": 0}, partial=True)
        self.assertFalse(tenant.is_valid())
        self.assertIn("whatsapp_numeros_incluidos_override", tenant.errors)

    def test_numeros_incluidos(self):
        plan = Plan.objects.create(
            nombre="Plan 3", whatsapp_habilitado=True, whatsapp_numero_propio_habilitado=True,
            whatsapp_numeros_incluidos=3,
        )
        self.clinica.plan = plan
        self.assertEqual(self.clinica.whatsapp_numeros_incluidos, 3)
        self.clinica.whatsapp_numeros_incluidos_override = 5
        self.assertEqual(self.clinica.whatsapp_numeros_incluidos, 5)
        self.clinica.whatsapp_numero_propio_override = False
        self.assertEqual(self.clinica.whatsapp_numeros_incluidos, 0)


LYVIO_OK = dict(
    LYVIO_BASE_URL="https://lyvio.test",
    LYVIO_CLINIQ_ACCOUNT_ID="7",
    LYVIO_CLINIQ_API_TOKEN="tok-secreto",
)
EVENTO_COEX = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"


def _respuesta(status, data):
    from unittest.mock import Mock

    return Mock(status_code=status, json=Mock(return_value=data))


@override_settings(**LYVIO_OK)
class ConectarNumeroPropioTests(TestCase):
    """Embedded Signup -> Lyvio whatsapp/authorization -> NumeroWhatsapp, y la
    asignacion de numeros a las sedes."""

    URL = "/api/v1/notificaciones/whatsapp-propio/"

    def setUp(self):
        from rest_framework.test import APIClient

        from apps.users.models import User

        self.plan = Plan.objects.create(
            nombre="Plan propio", whatsapp_habilitado=True, whatsapp_numero_propio_habilitado=True,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica Propia", nit="900555401", plan=self.plan)
        self.sede_a = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.sede_b = Sede.objects.create(
            clinica=self.clinica, nombre="Sur", ciudad="Bogota", direccion="Calle 2", telefono="3000000001",
        )
        self.admin = User.objects.create_user(
            email="admin-wa@example.com", password="secret123", rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _conectar(self, **extra):
        payload = {"evento": EVENTO_COEX, "code": "c0de", "waba_id": "waba1", **extra}
        return self.client.post(f"{self.URL}conectar/", payload, format="json")

    def _patch(self, data):
        return self.client.patch(self.URL, data, format="json")

    def _permitir(self, n):
        self.clinica.whatsapp_numeros_incluidos_override = n
        self.clinica.save()

    @override_settings(CLINIQ_VENTAS_WHATSAPP="+57 300 000 0000", WHATSAPP_NUMERO_CLINIQ="+57 311 111 1111")
    def test_estado_sin_addon_promociona(self):
        self.clinica.whatsapp_numero_propio_override = False
        self.clinica.save()
        data = self.client.get(self.URL).json()
        self.assertFalse(data["habilitado"])
        self.assertTrue(data["whatsapp_habilitado"])
        self.assertEqual(data["numeros_incluidos"], 0)
        self.assertEqual(data["numero_cliniq"], "+57 311 111 1111")
        self.assertTrue(data["contacto_ventas_url"].startswith("https://wa.me/573000000000?text="))

    def test_estado_inicial(self):
        data = self.client.get(self.URL).json()
        self.assertTrue(data["habilitado"])
        self.assertEqual(data["numeros_incluidos"], 1)
        self.assertEqual(data["numeros"], [])
        self.assertIsNone(data["numero_por_defecto_id"])
        self.assertEqual([s["tipo"] for s in data["sedes"]], ["por_defecto", "por_defecto"])
        self.assertEqual(data["contacto_ventas_url"], "")
        self.assertTrue(data["meta_app_id"])

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_primer_numero_queda_por_defecto(self, req):
        req.return_value = _respuesta(200, {"id": 55, "phone_number": "+573001112233"})
        res = self._conectar(phone_number_id="pn1")
        self.assertEqual(res.status_code, 201, res.content)

        args, kwargs = req.call_args
        self.assertEqual(args, ("POST", "https://lyvio.test/api/v1/accounts/7/whatsapp/authorization"))
        self.assertEqual(kwargs["headers"], {"api_access_token": "tok-secreto"})
        self.assertEqual(
            kwargs["json"], {"code": "c0de", "waba_id": "waba1", "is_coexistence": True, "phone_number_id": "pn1"},
        )

        data = res.json()
        numero = data["numeros"][0]
        self.assertEqual((numero["numero_visible"], numero["estado"]), ("+573001112233", "conectado"))
        self.assertTrue(numero["es_por_defecto"])
        self.assertEqual(data["numero_por_defecto_id"], numero["id"])
        # las sedes siguen en "por defecto": usan este numero sin configurar nada
        self.assertEqual({s["tipo"] for s in data["sedes"]}, {"por_defecto"})

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_limite_de_numeros_no_llama_a_lyvio(self, req):
        req.return_value = _respuesta(200, {"id": 55})
        self._conectar()
        res = self._conectar()
        self.assertEqual(res.json()["code"], "LIMITE_NUMEROS")
        self.assertEqual(req.call_count, 1)

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_asignar_numeros_a_las_sedes(self, req):
        self._permitir(2)
        req.side_effect = [_respuesta(200, {"id": 1}), _respuesta(200, {"id": 2})]
        self._conectar()
        data = self._conectar().json()
        primero, segundo = data["numeros"]
        self.assertTrue(primero["es_por_defecto"])

        data = self._patch({
            "asignaciones": [
                {"sede_id": str(self.sede_a.id), "tipo": "numero", "numero_id": segundo["id"]},
                {"sede_id": str(self.sede_b.id), "tipo": "cliniq"},
            ],
        }).json()
        por_sede = {s["nombre"]: (s["tipo"], s["numero_id"]) for s in data["sedes"]}
        self.assertEqual(por_sede, {"Norte": ("numero", segundo["id"]), "Sur": ("cliniq", None)})

        # cambiar el numero por defecto
        data = self._patch({"numero_por_defecto_id": segundo["id"]}).json()
        self.assertEqual(data["numero_por_defecto_id"], segundo["id"])

    def test_asignacion_numero_requiere_numero_id(self):
        res = self._patch({"asignaciones": [{"sede_id": str(self.sede_a.id), "tipo": "numero"}]})
        self.assertEqual(res.status_code, 400)

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_no_asigna_numeros_ni_sedes_ajenas(self, req):
        from apps.notificaciones.models import ConexionWhatsappPropio, NumeroWhatsapp

        otra = Clinica.objects.create(nombre="Otra", nit="900555402")
        sede_ajena = Sede.objects.create(
            clinica=otra, nombre="Ajena", ciudad="Cali", direccion="Calle 9", telefono="3000000009",
        )
        numero_ajeno = NumeroWhatsapp.objects.create(
            conexion=ConexionWhatsappPropio.objects.create(clinica=otra), lyvio_inbox_id="99", waba_id="w9",
        )
        res = self._patch({"asignaciones": [{"sede_id": str(sede_ajena.id), "tipo": "cliniq"}]})
        self.assertEqual(res.json()["code"], "SEDE_INVALIDA")
        res = self._patch({"asignaciones": [
            {"sede_id": str(self.sede_a.id), "tipo": "numero", "numero_id": str(numero_ajeno.id)},
        ]})
        self.assertEqual(res.json()["code"], "NUMERO_INVALIDO")
        self.assertEqual(self._patch({"numero_por_defecto_id": str(numero_ajeno.id)}).json()["code"], "NUMERO_INVALIDO")

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_flujo_api_only_se_rechaza_sin_llamar_a_lyvio(self, req):
        res = self._conectar(evento="FINISH")
        self.assertEqual(res.json()["code"], "SIN_COEXISTENCE")
        req.assert_not_called()

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_422_de_lyvio_se_muestra(self, req):
        req.return_value = _respuesta(422, {"error": "La WABA tiene varios números; indica phone_number_id"})
        res = self._conectar()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"], "La WABA tiene varios números; indica phone_number_id")
        self.assertFalse(self.clinica.conexion_whatsapp_propio.numeros.exists())

    @patch("apps.notificaciones.lyvio.requests.request", side_effect=requests.Timeout("lento"))
    def test_lyvio_no_responde(self, _req):
        self.assertEqual(self._conectar().json()["code"], "LYVIO_NO_RESPONDE")

    def test_sin_addon(self):
        self.clinica.whatsapp_numero_propio_override = False
        self.clinica.save()
        self.assertEqual(self._patch({"pago_meta_configurado": True}).json()["code"], "NUMERO_PROPIO_NO_HABILITADO")
        self.assertEqual(self._conectar().json()["code"], "NUMERO_PROPIO_NO_HABILITADO")

    def test_recepcion_sin_permiso(self):
        from apps.users.models import User

        recepcion = User.objects.create_user(
            email="recep-wa@example.com", password="secret123", rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        self.assertEqual(self.client.get(self.URL).status_code, 403)


class CatalogoWhatsappTests(TestCase):
    """Reglas de Meta que el catalogo debe cumplir antes de mandarlo a crear."""

    def test_reglas_de_meta(self):
        import re

        from apps.notificaciones.catalogo_whatsapp import CATALOGO

        nombres = [p.nombre for p in CATALOGO]
        self.assertEqual(len(nombres), len(set(nombres)))
        for p in CATALOGO:
            with self.subTest(p.nombre):
                self.assertRegex(p.nombre, r"^[a-z0-9_]+$")
                numeros = [int(n) for n in re.findall(r"\{\{(\d+)\}\}", p.cuerpo)]
                self.assertEqual(numeros, list(range(1, len(p.variables) + 1)))
                self.assertEqual(len(p.ejemplo), len(p.variables))
                self.assertFalse(p.cuerpo.strip().startswith("{{"))
                self.assertFalse(p.cuerpo.strip().endswith("}}"))

    def test_otp_no_sale_por_numero_propio(self):
        from apps.notificaciones.catalogo_whatsapp import plantilla_de

        self.assertIsNone(plantilla_de(Tipo.CHECKIN_OTP))
        self.assertIsNotNone(plantilla_de(Tipo.ENVIO_COTIZACION))

    def test_renderiza_y_rellena_vacios(self):
        from apps.notificaciones.catalogo_whatsapp import plantilla_de

        plantilla = plantilla_de(Tipo.ENVIO_COTIZACION)
        texto = plantilla.renderizar({"paciente_nombre": "Ana", "clinica_nombre": ""})
        self.assertIn("Hola Ana,", texto)
        self.assertNotIn("{{", texto)
        self.assertEqual(plantilla.valores({"paciente_nombre": "Ana"}), ["Ana", "-"])


@override_settings(**LYVIO_OK, LYVIO_PLANTILLA_PDF_EJEMPLO_URL="https://cdn.test/ejemplo.pdf")
class PlantillasNumeroPropioTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient

        from apps.notificaciones.models import ConexionWhatsappPropio, NumeroWhatsapp
        from apps.users.models import User

        self.clinica = Clinica.objects.create(nombre="Clinica Plantillas", nit="900555501")
        conexion = ConexionWhatsappPropio.objects.create(clinica=self.clinica)
        self.numero = NumeroWhatsapp.objects.create(conexion=conexion, lyvio_inbox_id="88", waba_id="w1")
        root = User.objects.create_user(email="root-wa@example.com", password="secret123", rol=User.Role.SUPERADMIN)
        self.client = APIClient()
        self.client.force_authenticate(root)

    def _accion(self, accion):
        return self.client.post(f"/api/v1/admin/whatsapp-numeros/{self.numero.id}/{accion}/")

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_crear_con_duplicado_rechazo_y_502(self, req):
        duplicada = {"error": {"type": "meta", "message": "exists",
                               "meta": {"code": 100, "subcode": 2388024, "user_msg": "Ya existe"}}}
        rechazada = {"error": {"type": "meta", "message": "invalid",
                               "meta": {"code": 100, "subcode": 1, "user_msg": "Variables mal ubicadas"}}}
        req.side_effect = [
            _respuesta(201, {"id": "t1", "status": "PENDING", "category": "UTILITY"}),
            _respuesta(422, duplicada),
            _respuesta(422, rechazada),
            _respuesta(502, {"error": {"type": "upstream", "message": "Meta no respondió"}}),
        ]
        res = self._accion("crear-plantillas")
        self.assertEqual(res.status_code, 200, res.content)
        resultados = [r["resultado"] for r in res.json()["resultados"]]
        self.assertEqual(resultados, ["creada", "ya_existia", "error", "reintentar"])

        args, kwargs = req.call_args_list[0]
        self.assertEqual(args[1], "https://lyvio.test/api/v1/accounts/7/lyvio/inboxes/88/message_templates")
        self.assertEqual(kwargs["json"]["name"], "cliniq_recordatorio_cita_v1")
        # la cotizacion lleva encabezado PDF con el ejemplo publico
        cotizacion = req.call_args_list[2].kwargs["json"]
        self.assertEqual(cotizacion["components"][0]["example"]["header_url"], "https://cdn.test/ejemplo.pdf")

        self.numero.refresh_from_db()
        self.assertEqual(self.numero.estado, "plantillas_pendientes")
        self.assertEqual(
            self.numero.plantillas.get(tipo=Tipo.ENVIO_COTIZACION).ultimo_error, "Variables mal ubicadas",
        )

        # reintento: solo vuelve a llamar por las que fallaron
        req.side_effect = [_respuesta(201, {"status": "PENDING"}), _respuesta(201, {"status": "PENDING"})]
        resultados = [r["resultado"] for r in self._accion("crear-plantillas").json()["resultados"]]
        self.assertEqual(resultados, ["ya_creada", "ya_creada", "creada", "creada"])

    def _crear_todas(self, req):
        req.side_effect = [_respuesta(201, {"status": "PENDING"}) for _ in range(4)]
        self._accion("crear-plantillas")

    def _meta(self, estados):
        from apps.notificaciones.catalogo_whatsapp import vigentes

        return [
            {"name": p.nombre, "language": p.idioma, "status": estados.get(p.tipo, "APPROVED"), "category": "UTILITY"}
            for p in vigentes()
        ]

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_todas_aprobadas_pasa_a_activo(self, req):
        self._crear_todas(req)
        req.side_effect = [_respuesta(200, {"payload": self._meta({})}), _respuesta(200, {})]
        res = self._accion("actualizar-plantillas")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(req.call_args_list[-1].args[1], "https://lyvio.test/api/v1/accounts/7/inboxes/88/sync_templates")
        self.numero.refresh_from_db()
        self.assertEqual(self.numero.estado, "activo")

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_una_pendiente_no_activa(self, req):
        self._crear_todas(req)
        req.side_effect = [_respuesta(200, {"payload": self._meta({Tipo.ENVIO_FORMULA: "PENDING"})}), _respuesta(200, {})]
        self._accion("actualizar-plantillas")
        self.numero.refresh_from_db()
        self.assertEqual(self.numero.estado, "plantillas_pendientes")

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_rechazada_deja_el_numero_en_error(self, req):
        self._crear_todas(req)
        req.side_effect = [_respuesta(200, self._meta({Tipo.FIRMA_DOCUMENTO: "REJECTED"})), _respuesta(200, {})]
        self._accion("actualizar-plantillas")
        self.numero.refresh_from_db()
        self.assertEqual(self.numero.estado, "error")
        self.assertIn("cliniq_firma_documento_v1", self.numero.ultimo_error)

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_salud_fuera_de_la_app_pasa_a_error(self, req):
        self.numero.estado = "activo"
        self.numero.save()
        req.return_value = _respuesta(200, {"status": "CONNECTED", "is_on_biz_app": False})
        self._accion("revisar-salud")
        self.numero.refresh_from_db()
        self.assertEqual(self.numero.estado, "error")
        self.assertIn("WhatsApp Business", self.numero.ultimo_error)

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_salud_ok_recupera_el_estado_por_plantillas(self, req):
        self._crear_todas(req)
        req.side_effect = [_respuesta(200, self._meta({})), _respuesta(200, {})]
        self._accion("actualizar-plantillas")
        self.numero.estado = "error"
        self.numero.save()
        req.side_effect = None
        req.return_value = _respuesta(200, {"status": "CONNECTED", "is_on_biz_app": True})
        self._accion("revisar-salud")
        self.numero.refresh_from_db()
        self.assertEqual(self.numero.estado, "activo")

    def test_detalle_admin(self):
        data = self.client.get(f"/api/v1/admin/tenants/{self.clinica.id}/whatsapp-propio/").json()
        self.assertEqual(data["numeros"][0]["lyvio_inbox_id"], "88")
        self.assertEqual(len(data["catalogo"]), 4)

    def test_solo_superadmin(self):
        from apps.users.models import User

        admin = User.objects.create_user(
            email="admin-pl@example.com", password="secret123", rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(admin)
        self.assertEqual(self._accion("crear-plantillas").status_code, 403)


class _BaseNumeroPropio(TestCase):
    """Clinica con addon de numero propio y numeros activos con el catalogo
    aprobado."""

    def setUp(self):
        from apps.notificaciones.models import ConexionWhatsappPropio

        plan = Plan.objects.create(
            nombre="Plan ruteo", whatsapp_habilitado=True, whatsapp_numero_propio_habilitado=True,
            whatsapp_envios_incluidos=0, whatsapp_numeros_incluidos=3,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica Ruteo", nit="900555601", plan=plan)
        self.sede_a = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.sede_b = Sede.objects.create(
            clinica=self.clinica, nombre="Sur", ciudad="Bogota", direccion="Calle 2", telefono="3000000001",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="6601",
            nombres="Ana", apellidos="Ruiz", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3001112233", autoriza_datos=True,
        )
        self.conexion = ConexionWhatsappPropio.objects.create(clinica=self.clinica)

    def _numero(self, inbox, estado="activo", aprobadas=True, por_defecto=False):
        from apps.notificaciones.catalogo_whatsapp import vigentes
        from apps.notificaciones.models import NumeroWhatsapp, PlantillaWhatsappNumero

        numero = NumeroWhatsapp.objects.create(conexion=self.conexion, lyvio_inbox_id=inbox, waba_id="w", estado=estado)
        for p in vigentes():
            PlantillaWhatsappNumero.objects.create(
                numero=numero, tipo=p.tipo, nombre=p.nombre, idioma=p.idioma,
                estado="APPROVED" if aprobadas else "PENDING",
            )
        if por_defecto:
            self.conexion.numero_por_defecto = numero
            self.conexion.save()
        return numero

    def _asignar(self, sede, tipo, numero=None):
        from apps.notificaciones.models import AsignacionWhatsappSede

        AsignacionWhatsappSede.objects.update_or_create(
            sede=sede, defaults={"conexion": self.conexion, "tipo": tipo, "numero": numero},
        )

    def _elegir(self, tipo=Tipo.ENVIO_COTIZACION, **kwargs):
        from apps.notificaciones.numero_propio import elegir_numero

        return elegir_numero(self.clinica, tipo=tipo, paciente=self.paciente, **kwargs)


class ElegirNumeroTests(_BaseNumeroPropio):
    def test_otp_siempre_compartido(self):
        self._numero("1", por_defecto=True)
        self.assertEqual(self._elegir(Tipo.CHECKIN_OTP, sede=self.sede_a), (None, "otp_siempre_compartido"))

    def test_sin_addon(self):
        self._numero("1", por_defecto=True)
        self.clinica.whatsapp_numero_propio_override = False
        self.assertEqual(self._elegir(sede=self.sede_a), (None, "sin_addon"))

    def test_sin_numeros(self):
        self.assertEqual(self._elegir(sede=self.sede_a), (None, "sin_numero"))

    def test_sin_asignacion_usa_el_por_defecto(self):
        general = self._numero("1", por_defecto=True)
        self.assertEqual(self._elegir(sede=self.sede_b), (general, "ok"))

    def test_sede_con_su_numero(self):
        self._numero("1", por_defecto=True)
        sur = self._numero("2")
        self._asignar(self.sede_b, "numero", sur)
        self.assertEqual(self._elegir(sede=self.sede_b)[0], sur)

    def test_numero_de_la_sede_no_activo_usa_el_por_defecto(self):
        general = self._numero("1", por_defecto=True)
        sur = self._numero("2", estado="error")
        self._asignar(self.sede_b, "numero", sur)
        self.assertEqual(self._elegir(sede=self.sede_b)[0], general)

    def test_sede_que_eligio_cliniq(self):
        self._numero("1", por_defecto=True)
        self._asignar(self.sede_a, "cliniq")
        self.assertEqual(self._elegir(sede=self.sede_a), (None, "sede_usa_cliniq"))

    def test_sin_sede_usa_la_de_la_ultima_cita(self):
        from apps.agenda.models import Cita
        from apps.users.models import User

        self._numero("1", por_defecto=True)
        sur = self._numero("2")
        self._asignar(self.sede_b, "numero", sur)
        profesional = User.objects.create_user(
            email="prof-ruteo@example.com", password="secret123", rol=User.Role.PROFESIONAL, clinica=self.clinica,
        )
        ahora = timezone.now()
        for sede, dias in ((self.sede_a, 10), (self.sede_b, 2)):
            Cita.objects.create(
                paciente=self.paciente, sede=sede, profesional=profesional,
                fecha_inicio=ahora - timedelta(days=dias),
                fecha_fin=ahora - timedelta(days=dias) + timedelta(minutes=30),
            )
        self.assertEqual(self._elegir()[0], sur)

    def test_sin_sede_ni_citas_usa_el_por_defecto(self):
        general = self._numero("1", por_defecto=True)
        self.assertEqual(self._elegir()[0], general)

    def test_nada_activo_sale_por_compartido(self):
        self._numero("1", estado="plantillas_pendientes", aprobadas=False, por_defecto=True)
        self.assertEqual(self._elegir(sede=self.sede_a), (None, "numero_no_activo"))


def _conversacion_ok(req, message_id=501):
    """Respuestas de Lyvio para: crear contacto, buscar conversacion (ninguna),
    crear conversacion y crear mensaje."""
    req.side_effect = [
        _respuesta(200, {"payload": {"contact": {"id": 11}}}),
        _respuesta(200, {"payload": []}),
        _respuesta(200, {"id": 21}),
        _respuesta(200, {"id": message_id}),
    ]


@override_settings(**LYVIO_OK, LYVIO_WEBHOOK_SECRET="s3cr3t")
class EnvioNumeroPropioTests(_BaseNumeroPropio):
    def setUp(self):
        super().setUp()
        self.norte = self._numero("31", por_defecto=True)

    def _enviar_cotizacion(self, **extra):
        return enviar_whatsapp(
            clinica=self.clinica, sede=self.sede_a, tipo=Tipo.ENVIO_COTIZACION, paciente=self.paciente,
            pdf_bytes=b"%PDF", nombre_archivo_pdf="cotizacion-1.pdf", metadata={"cotizacion_id": "1"}, **extra,
        )

    @patch(f"{SERVICES}.subir_pdf_whatsapp", return_value="https://cdn.test/c1.pdf")
    @patch("apps.notificaciones.lyvio.requests.request")
    def test_envia_por_el_inbox_de_la_clinica(self, req, _subir):
        _conversacion_ok(req)
        self._enviar_cotizacion()

        contacto = req.call_args_list[0].kwargs["json"]
        self.assertEqual(contacto, {"inbox_id": 31, "name": "Ana Ruiz", "phone_number": "+573001112233"})
        self.assertEqual(req.call_args_list[2].kwargs["json"], {"inbox_id": 31, "contact_id": 11})
        args, kwargs = req.call_args_list[3]
        self.assertEqual(args[1], "https://lyvio.test/api/v1/accounts/7/conversations/21/messages")
        mensaje = kwargs["json"]
        self.assertIn("Hola Ana,", mensaje["content"])
        params = mensaje["template_params"]
        self.assertEqual(params["name"], "cliniq_envio_cotizacion_v1")
        self.assertEqual(params["processed_params"]["body"], {"1": "Ana", "2": "Clinica Ruteo"})
        self.assertEqual(params["processed_params"]["header"]["media_url"], "https://cdn.test/c1.pdf")

        envio = EnvioWhatsApp.objects.get()
        self.assertEqual((envio.ruta, envio.estado, envio.lyvio_message_id), ("propio", "enviado", "501"))
        self.assertEqual(envio.datos["pdf_url"], "https://cdn.test/c1.pdf")

    @patch(f"{SERVICES}.subir_pdf_whatsapp", return_value="https://cdn.test/c1.pdf")
    @patch("apps.notificaciones.lyvio.requests.request")
    def test_reutiliza_contacto_y_conversacion(self, req, _subir):
        _conversacion_ok(req)
        self._enviar_cotizacion()
        req.side_effect = [_respuesta(200, {"id": 502})]
        self._enviar_cotizacion()
        self.assertTrue(req.call_args.args[1].endswith("/conversations/21/messages"))

    @patch(f"{SERVICES}.subir_pdf_whatsapp", return_value="https://cdn.test/c1.pdf")
    @patch("apps.notificaciones.lyvio.requests.request")
    def test_contacto_existente_se_busca(self, req, _subir):
        req.side_effect = [
            _respuesta(422, {"message": "Phone number has already been taken"}),
            _respuesta(200, {"payload": [{"id": 77, "phone_number": "+573001112233"}]}),
            _respuesta(200, {"payload": [{"id": 90, "inbox_id": 99}, {"id": 91, "inbox_id": 31}]}),
            _respuesta(200, {"id": 503}),
        ]
        self._enviar_cotizacion()
        self.assertTrue(req.call_args.args[1].endswith("/conversations/91/messages"))

    @patch(f"{SERVICES}.enviar_documento_whatsapp_webhook")
    @patch(f"{SERVICES}.subir_pdf_whatsapp", return_value="https://cdn.test/c1.pdf")
    @patch("apps.notificaciones.lyvio.requests.request")
    def test_error_de_lyvio_sale_por_el_compartido(self, req, _subir, compartido):
        req.side_effect = [
            _respuesta(200, {"payload": {"contact": {"id": 11}}}),
            _respuesta(200, {"payload": []}),
            _respuesta(200, {"id": 21}),
            _respuesta(422, {"error": "Template not found"}),
        ]
        self._enviar_cotizacion()
        compartido.assert_called_once()
        self.assertEqual(compartido.call_args.kwargs["pdf_url"], "https://cdn.test/c1.pdf")

        propio = EnvioWhatsApp.objects.get(ruta="propio")
        respaldo = EnvioWhatsApp.objects.get(ruta="compartido")
        self.assertEqual(propio.estado, "fallido")
        self.assertEqual(respaldo.respaldo_de, propio)
        self.assertEqual(respaldo.motivo_ruta, "respaldo_por_fallo")

    @patch(f"{SERVICES}.enviar_documento_whatsapp_webhook")
    @patch(f"{SERVICES}.subir_pdf_whatsapp", return_value="https://cdn.test/c1.pdf")
    @patch("apps.notificaciones.lyvio.requests.request")
    def test_timeout_al_enviar_queda_incierto_sin_respaldo(self, req, _subir, compartido):
        req.side_effect = [
            _respuesta(200, {"payload": {"contact": {"id": 11}}}),
            _respuesta(200, {"payload": []}),
            _respuesta(200, {"id": 21}),
            requests.ReadTimeout("lento"),
        ]
        self._enviar_cotizacion()
        compartido.assert_not_called()
        self.assertEqual(EnvioWhatsApp.objects.get().estado, "incierto")

    @patch(f"{SERVICES}.enviar_otp_checkin_webhook")
    def test_otp_sale_por_el_compartido(self, compartido):
        enviar_whatsapp(clinica=self.clinica, sede=self.sede_a, tipo=Tipo.CHECKIN_OTP, paciente=self.paciente, codigo="9")
        compartido.assert_called_once()
        envio = EnvioWhatsApp.objects.get()
        self.assertEqual((envio.ruta, envio.motivo_ruta), ("compartido", "otp_siempre_compartido"))

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_recordatorio_con_fecha_legible(self, req):
        _conversacion_ok(req)
        payload = {
            "servicio_nombre": "Peeling", "sede_nombre": "Norte", "sede_telefono": "6011234567",
            "fecha_inicio": "2026-10-05T10:30:00-05:00",
        }
        enviar_whatsapp(
            clinica=self.clinica, sede=self.sede_a, tipo=Tipo.RECORDATORIO_CITA, paciente=self.paciente, payload=payload,
        )
        body = req.call_args.kwargs["json"]["template_params"]["processed_params"]["body"]
        self.assertEqual(body["5"], "lunes 5 de octubre a las 10:30 a. m.")
        self.assertNotIn("header", req.call_args.kwargs["json"]["template_params"]["processed_params"])

    # --- webhook -------------------------------------------------------------

    def _enviado(self, message_id="501"):
        return EnvioWhatsApp.objects.create(
            clinica=self.clinica, paciente=self.paciente, tipo=Tipo.FIRMA_DOCUMENTO, ruta="propio",
            numero=self.norte, estado="enviado", lyvio_message_id=message_id,
            datos={"documento_tipo": "consentimiento", "link": "https://f.test/x", "metadata": None},
        )

    def _webhook(self, payload, secreto="s3cr3t", edad=0, firma=None):
        """Firma como Lyvio (Chatwoot 4.18): sha256=HMAC(secreto, "ts.cuerpo")."""
        import hashlib
        import hmac
        import json
        import time

        cuerpo = json.dumps(payload).encode()
        ts = str(int(time.time()) - edad)
        if firma is None:
            firma = "sha256=" + hmac.new(secreto.encode(), ts.encode() + b"." + cuerpo, hashlib.sha256).hexdigest()
        return self.client.post(
            "/api/v1/notificaciones/lyvio-webhook/", cuerpo, content_type="application/json",
            HTTP_X_CHATWOOT_TIMESTAMP=ts, HTTP_X_CHATWOOT_SIGNATURE=firma,
        )

    def test_webhook_rechaza_firma_incorrecta(self):
        self.assertEqual(self._webhook({"event": "message_updated"}, secreto="otro").status_code, 401)
        self.assertEqual(self._webhook({"event": "message_updated"}, firma="").status_code, 401)

    def test_webhook_rechaza_avisos_viejos(self):
        self.assertEqual(self._webhook({"event": "message_updated"}, edad=600).status_code, 401)
        self.assertEqual(self._webhook({"event": "message_updated"}, edad=60).status_code, 200)

    @override_settings(LYVIO_WEBHOOK_SECRET="")
    def test_webhook_sin_secreto_configurado_rechaza_todo(self):
        self.assertEqual(self._webhook({"event": "message_updated"}).status_code, 401)

    @patch(f"{SERVICES}.enviar_link_firma_whatsapp")
    def test_webhook_failed_reenvia_una_sola_vez(self, compartido):
        envio = self._enviado()
        evento = {
            "event": "message_updated", "id": 501, "status": "failed", "message_type": "outgoing",
            "content_attributes": {"external_error": "131026: Message undeliverable"},
        }
        self.assertEqual(self._webhook(evento).json()["resultado"], "respaldo_enviado")
        self.assertEqual(self._webhook(evento).json()["resultado"], "ya_procesado")
        compartido.assert_called_once_with(
            paciente=self.paciente, documento_tipo="consentimiento", link="https://f.test/x", metadata=None,
        )
        envio.refresh_from_db()
        self.assertEqual(envio.estado, "fallido")
        self.norte.refresh_from_db()
        self.assertEqual(self.norte.estado, "activo")

    @patch(f"{SERVICES}.enviar_link_firma_whatsapp")
    def test_webhook_sin_pago_pone_el_numero_en_error(self, _compartido):
        self._enviado()
        self._webhook({
            "event": "message_updated", "id": 501, "status": "failed",
            "content_attributes": {"external_error": "131042: Business eligibility payment issue"},
        })
        self.norte.refresh_from_db()
        self.assertEqual(self.norte.estado, "error")
        self.assertIn("método de pago", self.norte.ultimo_error)

    @patch(f"{SERVICES}.enviar_link_firma_whatsapp", side_effect=ValueError("Webhook no configurado"))
    def test_webhook_respaldo_fallido_queda_como_notificacion_fallida(self, _compartido):
        from apps.notificaciones.models import NotificacionFallida

        self._enviado()
        res = self._webhook({"event": "message_updated", "id": 501, "status": "failed"})
        self.assertEqual(res.json()["resultado"], "respaldo_fallido")
        self.assertEqual(NotificacionFallida.objects.get().tipo_notificacion, Tipo.FIRMA_DOCUMENTO)

    def test_webhook_otros_eventos(self):
        self.assertEqual(self._webhook({"event": "message_updated", "id": 999, "status": "failed"}).json()["resultado"],
                         "desconocido")
        self.assertEqual(self._webhook({"event": "message_updated", "id": 1, "status": "delivered"}).json()["resultado"],
                         "ignorado")
        self.assertEqual(
            self._webhook({"event": "message_created", "id": 2, "message_type": "incoming", "inbox": {"id": 31}})
            .json()["resultado"],
            "respuesta_registrada",
        )


@override_settings(**LYVIO_OK, LYVIO_WEBHOOK_SECRET="s3cr3t")
class CorreccionesRevisionTests(_BaseNumeroPropio):
    """Casos encontrados en la revision previa al commit."""

    def setUp(self):
        super().setUp()
        self.norte = self._numero("31", por_defecto=True)

    def _firma(self, **extra):
        return enviar_whatsapp(
            clinica=self.clinica, sede=self.sede_a, tipo=Tipo.FIRMA_DOCUMENTO, paciente=self.paciente,
            documento_tipo="consentimiento", link="https://f.test/x", metadata=None, **extra,
        )

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_telefono_cambiado_no_reutiliza_la_conversacion(self, req):
        _conversacion_ok(req)
        self._firma()
        self.paciente.telefono = "3109998877"
        self.paciente.save()
        req.side_effect = [
            _respuesta(200, {"payload": {"contact": {"id": 12}}}),
            _respuesta(200, {"payload": []}),
            _respuesta(200, {"id": 22}),
            _respuesta(200, {"id": 502}),
        ]
        self._firma()
        self.assertEqual(req.call_args_list[4].kwargs["json"]["phone_number"], "+573109998877")
        self.assertTrue(req.call_args.args[1].endswith("/conversations/22/messages"))

    @patch(f"{SERVICES}.enviar_link_firma_whatsapp")
    def test_fallo_que_llega_antes_del_message_id(self, compartido):
        """Meta rechaza tan rapido que el webhook llega mientras el POST del
        mensaje todavia no volvio: el envio se encuentra por conversacion, sale
        por el compartido y no queda como `enviado`."""
        from apps.notificaciones.numero_propio import procesar_webhook

        resultados = []

        def lyvio(method, url, **kwargs):
            if url.endswith("/contacts"):
                return _respuesta(200, {"payload": {"contact": {"id": 11}}})
            if url.endswith("/contacts/11/conversations"):
                return _respuesta(200, {"payload": []})
            if url.endswith("/conversations"):
                return _respuesta(200, {"id": 21})
            # POST del mensaje: el webhook de fallo llega antes de la respuesta
            resultados.append(procesar_webhook({
                "event": "message_updated", "id": 777, "status": "failed",
                "conversation": {"id": 21}, "content_attributes": {"external_error": "131026: undeliverable"},
            }))
            return _respuesta(200, {"id": 777})

        with patch("apps.notificaciones.lyvio.requests.request", side_effect=lyvio):
            self._firma()

        self.assertEqual(resultados, ["respaldo_enviado"])
        compartido.assert_called_once()
        propio = EnvioWhatsApp.objects.get(ruta="propio")
        self.assertEqual((propio.estado, propio.lyvio_message_id), ("fallido", "777"))

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_respaldo_que_tambien_falla_queda_registrado(self, req):
        from apps.notificaciones.models import NotificacionFallida

        req.return_value = _respuesta(422, {"error": "Template not found"})
        with patch(f"{SERVICES}.enviar_link_firma_whatsapp", side_effect=requests.ConnectionError("n8n caido")):
            with self.assertRaises(requests.ConnectionError):
                self._firma()
        self.assertEqual(EnvioWhatsApp.objects.get(ruta="propio").estado, "fallido")
        fallida = NotificacionFallida.objects.get()
        self.assertIn("Template not found", fallida.motivo)

    @patch("apps.notificaciones.lyvio.requests.request")
    def test_plantilla_rechazada_no_se_reenvia(self, req):
        from apps.notificaciones.numero_propio import crear_plantillas

        self.norte.plantillas.filter(tipo=Tipo.FIRMA_DOCUMENTO).update(estado="REJECTED")
        resultados = {r["nombre"]: r["resultado"] for r in crear_plantillas(self.norte)}
        self.assertEqual(resultados["cliniq_firma_documento_v1"], "requiere_version")
        req.assert_not_called()
        self.assertEqual(self.norte.plantillas.get(tipo=Tipo.FIRMA_DOCUMENTO).estado, "REJECTED")
