"""Mensajes entrantes al número propio → interesados en Seguimiento (16/10/2026)."""

from rest_framework.test import APIClient

from apps.notificaciones.tests import _BaseNumeroPropio
from apps.seguimiento.models import Oportunidad, TelefonoDescartado
from apps.seguimiento.whatsapp_entrante import registrar_mensaje_entrante
from apps.users.models import User


def _mensaje(inbox="31", telefono="+57 310 555 4433", nombre="Laura Pérez", texto="Hola, ¿precio del bótox?"):
    return {
        "event": "message_created", "id": 99, "message_type": "incoming", "content": texto,
        "inbox": {"id": inbox},
        "sender": {"type": "contact", "name": nombre, "phone_number": telefono},
        "conversation": {"id": 5, "inbox_id": inbox, "meta": {"sender": {"name": nombre, "phone_number": telefono}}},
    }


class WhatsappEntranteTests(_BaseNumeroPropio):
    def setUp(self):
        super().setUp()
        self.numero = self._numero("31", por_defecto=True)

    def _oportunidades(self):
        return Oportunidad.objects.filter(clinica=self.clinica)

    def test_telefono_nuevo_crea_un_interesado_con_el_mensaje(self):
        self.assertEqual(registrar_mensaje_entrante(_mensaje()), "interesado")
        op = self._oportunidades().get()
        self.assertIsNone(op.paciente_id)
        self.assertEqual(op.contacto_nombre, "Laura Pérez")
        self.assertEqual(op.motivo, Oportunidad.Motivo.WHATSAPP)
        self.assertEqual(op.origen, Oportunidad.Origen.WHATSAPP)
        self.assertEqual(op.interes, "Hola, ¿precio del bótox?")
        self.assertEqual(op.estado, Oportunidad.Estado.ABIERTA)

    def test_varios_mensajes_de_la_misma_persona_no_duplican(self):
        registrar_mensaje_entrante(_mensaje())
        self.assertEqual(registrar_mensaje_entrante(_mensaje(telefono="3105554433", texto="¿Me responden?")), "ya_en_seguimiento")
        self.assertEqual(self._oportunidades().count(), 1)

    def test_interesado_perdido_que_vuelve_a_escribir_se_reabre(self):
        registrar_mensaje_entrante(_mensaje())
        op = self._oportunidades().get()
        Oportunidad.objects.filter(id=op.id).update(estado=Oportunidad.Estado.PERDIDA, motivo_perdida="no_responde")
        self.assertEqual(registrar_mensaje_entrante(_mensaje(texto="Ya me decidí")), "reabierta")
        op.refresh_from_db()
        self.assertEqual(op.estado, Oportunidad.Estado.ABIERTA)
        self.assertEqual(op.interes, "Ya me decidí")
        self.assertEqual(self._oportunidades().count(), 1)

    def test_paciente_sin_seguimiento_entra_como_recompra(self):
        self.assertEqual(registrar_mensaje_entrante(_mensaje(telefono="+573001112233")), "recompra")
        op = self._oportunidades().get()
        self.assertEqual(op.paciente_id, self.paciente.id)
        self.assertEqual(op.tipo, Oportunidad.Tipo.RECOMPRA)

    def test_no_es_cliente_no_vuelve_a_entrar(self):
        registrar_mensaje_entrante(_mensaje())
        op = self._oportunidades().get()
        admin = User.objects.create_user(
            email="admin-wa@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        client = APIClient()
        client.force_authenticate(admin)
        r = client.post(f"/api/v1/seguimiento/oportunidades/{op.id}/no_es_cliente/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertTrue(TelefonoDescartado.objects.filter(clinica=self.clinica, telefono="3105554433").exists())
        self.assertEqual(registrar_mensaje_entrante(_mensaje()), "descartado")
        self.assertEqual(self._oportunidades().filter(estado=Oportunidad.Estado.ABIERTA).count(), 0)

    def test_no_entran_el_equipo_ni_otros_casos(self):
        User.objects.create_user(
            email="recep-wa@test.com", password="Secret123!", first_name="Re", last_name="Cep",
            rol=User.Role.RECEPCION, clinica=self.clinica, telefono="3105554433",
        )
        self.assertEqual(registrar_mensaje_entrante(_mensaje()), "equipo")
        self.assertEqual(registrar_mensaje_entrante(_mensaje(inbox="999")), "inbox_desconocido")
        self.assertEqual(registrar_mensaje_entrante(_mensaje(telefono="")), "sin_telefono")
        self.assertFalse(self._oportunidades().exists())

    def test_sede_del_numero(self):
        # Norte usa este número; Sur, otro: el interesado queda en Norte.
        otro = self._numero("32")
        self._asignar(self.sede_a, "numero", self.numero)
        self._asignar(self.sede_b, "numero", otro)
        registrar_mensaje_entrante(_mensaje())
        self.assertEqual(self._oportunidades().get().sede_id, self.sede_a.id)

    def test_frase_en_para_hoy(self):
        from django.utils import timezone

        from apps.seguimiento.serializers import _frase

        registrar_mensaje_entrante(_mensaje())
        frase = _frase(self._oportunidades().get(), timezone.localdate())
        self.assertEqual(frase, "Escribió por WhatsApp · «Hola, ¿precio del bótox?»")
