"""Corrección de soporte (console): cambiar el tratamiento de una venta ya aceptada."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita, CorreccionSoporte
from apps.clinicas.models import Clinica, Sede, Servicio, TratamientoCatalogo
from apps.consentimientos.models import Consentimiento
from apps.core.models import LogAccion
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.services import aceptar_cotizacion
from apps.pacientes.models import Paciente
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

User = get_user_model()
BASE = "/api/v1/admin/soporte/cambiar-tratamiento"


class CambiarTratamientoVentaTests(TestCase):
    """A Marcela le vendieron «RF x6» cuando había comprado «HIFU x4». Ya se hizo
    una sesión (RF #1) y tiene otra agendada (RF #2)."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="soporte-cambio@example.com", password="secret123", first_name="Sopo", last_name="Rte",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Cambio", nit="901555777")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.profesional = User.objects.create_user(
            email="prof-cambio@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="555000333",
            nombres="Marcela", apellidos="Ruiz",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365), sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 7", telefono="3000000005", canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.rf = Servicio.objects.create(clinica=self.clinica, nombre="Radiofrecuencia", duracion_min=30, precio="100000.00")
        self.hifu = Servicio.objects.create(clinica=self.clinica, nombre="HIFU facial", duracion_min=45, precio="200000.00")
        self.equivocado = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="RF x6")
        tipo_rf = self.equivocado.tipos_sesion.create(nombre="RF", cantidad=6, orden=1, es_compromiso=True)
        tipo_rf.procedimientos.create(procedimiento=self.rf, orden=1)
        self.correcto = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="HIFU x4")
        self.tipo_hifu = self.correcto.tipos_sesion.create(nombre="HIFU", cantidad=4, orden=1, es_compromiso=True)
        self.tipo_hifu.procedimientos.create(procedimiento=self.hifu, orden=1)
        self.correcto.tipos_sesion.create(nombre="Control", cantidad=1, orden=2, es_compromiso=False)

        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.superadmin, sede=self.sede,
        )
        self.item = self.cotizacion.items.create(
            tipo=ItemCotizacion.Tipo.TRATAMIENTO, tratamiento=self.equivocado, descripcion="RF x6",
            num_citas=1, valor_unitario="1200000.00", descuento_porcentaje="10.00",
        )
        aceptar_cotizacion(self.cotizacion, actor=self.superadmin)
        self.cotizacion.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(self.cotizacion.estado, Cotizacion.Estado.ACEPTADA)

        self.hecha = self._cita(dias=-7, estado=Cita.Estado.COMPLETADA, numero=1)
        self.agendada = self._cita(dias=7, estado=Cita.Estado.PENDIENTE, numero=2)

    def _cita(self, *, dias, estado, numero):
        inicio = timezone.now() + timedelta(days=dias)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.rf,
            servicio_nombre="Radiofrecuencia", item_cotizacion=self.item, fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=30), duracion_min=30, estado=estado,
        )
        sesion = SesionProcedimiento.objects.get(tratamiento__cotizacion_item=self.item, numero=numero)
        sesion.cita = cita
        if estado == Cita.Estado.COMPLETADA:
            sesion.estado = SesionProcedimiento.Estado.COMPLETADO
            sesion.profesional = self.profesional
            sesion.fecha = timezone.localdate(inicio)
        sesion.save()
        return cita

    def _ranura(self, numero):
        return f"{self.tipo_hifu.id}:{numero}"

    def _ventas(self):
        r = self.client.get(f"{BASE}/", {"clinica": str(self.clinica.id), "paciente": str(self.paciente.id)})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _cambiar(self, asignaciones=None, *, tratamiento=None, item=None, confirmar=True):
        if asignaciones is None:
            asignaciones = [(self.hecha, self._ranura(1)), (self.agendada, self._ranura(2))]
        datos = {
            "clinica": str(self.clinica.id), "item": str((item or self.item).id),
            "tratamiento": str((tratamiento or self.correcto).id),
            "asignaciones": [{"cita": str(c.id), "sesion": clave} for c, clave in asignaciones],
        }
        if not confirmar:
            return self.client.post(f"{BASE}/previsualizar/", datos, format="json")
        return self.client.post(f"{BASE}/confirmar/", {**datos, "motivo": "Compró HIFU, se cotizó RF"}, format="json")

    def test_lista_la_venta_con_sus_atenciones(self):
        [venta] = self._ventas()
        self.assertEqual((venta["item_id"], venta["descripcion"], venta["total"]), (str(self.item.id), "RF x6", 6))
        self.assertEqual(Decimal(venta["valor"]), Decimal("1080000.00"))
        self.assertIsNone(venta["bloqueo_tratamiento"])
        self.assertEqual(venta["avisos"], [])
        self.assertEqual(
            [(a["cita_id"], a["sesion"]["numero"]) for a in venta["atenciones"]],
            [(str(self.hecha.id), 1), (str(self.agendada.id), 2)],
        )

    def test_no_lista_cotizaciones_sin_aceptar_ni_migradas(self):
        borrador = Cotizacion.objects.create(clinica=self.clinica, paciente=self.paciente)
        borrador.items.create(
            tipo=ItemCotizacion.Tipo.TRATAMIENTO, tratamiento=self.correcto, descripcion="HIFU x4",
            num_citas=1, valor_unitario="1.00",
        )
        migrada = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, estado=Cotizacion.Estado.ACEPTADA, es_migracion=True,
        )
        migrada.items.create(
            tipo=ItemCotizacion.Tipo.TRATAMIENTO, tratamiento=self.correcto, descripcion="HIFU x4",
            num_citas=1, valor_unitario="1.00",
        )
        self.assertEqual([v["item_id"] for v in self._ventas()], [str(self.item.id)])

    def test_cambia_el_tratamiento_y_pasa_cada_atencion_a_su_sesion(self):
        vieja = SesionProcedimiento.objects.get(cita=self.hecha)
        protocolo_viejo = vieja.tratamiento_id
        r = self._cambiar()
        self.assertEqual(r.status_code, 201, r.content)

        self.item.refresh_from_db()
        self.assertEqual((self.item.tratamiento_id, self.item.descripcion, self.item.num_citas),
                         (self.correcto.id, "HIFU x4", 1))
        self.assertEqual(self.item.num_sesiones_efectivas(), 4)
        self.assertEqual(self.item.citas_restantes(), 2)
        self.assertFalse(TratamientoPaciente.objects.filter(pk=protocolo_viejo).exists())

        nuevo = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(nuevo.tratamiento_catalogo_id, self.correcto.id)
        protocolo = [(s.tipo_sesion.nombre, s.numero, s.estado, s.cita_id) for s in nuevo.sesiones.all()]
        self.assertEqual(protocolo, [
            ("HIFU", 1, "completado", self.hecha.id), ("HIFU", 2, "pendiente", self.agendada.id),
            ("HIFU", 3, "pendiente", None), ("HIFU", 4, "pendiente", None),
        ])
        # La sesión hecha es la misma: conserva profesional y fecha.
        vieja.refresh_from_db()
        self.assertEqual((vieja.tratamiento_id, vieja.profesional_id), (nuevo.id, self.profesional.id))

    def test_lo_vendido_en_dinero_no_cambia(self):
        total_antes = self.cotizacion.total
        subtotal_antes = self.item.subtotal
        self.assertEqual(self._cambiar().status_code, 201)
        self.item.refresh_from_db()
        self.cotizacion.refresh_from_db()
        self.assertEqual(self.item.subtotal, subtotal_antes)
        self.assertEqual((self.item.valor_unitario, self.item.descuento_porcentaje), (Decimal("1200000.00"), Decimal("10.00")))
        self.assertEqual(self.cotizacion.total, total_antes)
        self.assertEqual(self.cotizacion.estado, Cotizacion.Estado.ACEPTADA)

    def test_la_cita_agendada_pasa_al_procedimiento_nuevo_y_la_hecha_no(self):
        self.assertEqual(self._cambiar().status_code, 201)
        self.agendada.refresh_from_db()
        self.hecha.refresh_from_db()
        self.assertEqual((self.agendada.servicio_id, self.agendada.servicio_nombre), (self.hifu.id, "HIFU facial"))
        self.assertEqual((self.hecha.servicio_id, self.hecha.servicio_nombre), (self.rf.id, "Radiofrecuencia"))
        movidas = CorreccionSoporte.objects.get().resumen["atenciones_movidas"]
        agendada = next(m for m in movidas if m["cita"] == str(self.agendada.id))
        self.assertEqual((agendada["servicio_antes"], agendada["servicio_despues"]), ("Radiofrecuencia", "HIFU facial"))
        self.assertNotIn("servicio_despues", next(m for m in movidas if m["cita"] == str(self.hecha.id)))

    def test_queda_registrado(self):
        self.assertEqual(self._cambiar().status_code, 201)
        correccion = CorreccionSoporte.objects.get()
        self.assertEqual(
            (correccion.tipo, correccion.item_origen_id, correccion.realizado_por_id),
            (CorreccionSoporte.Tipo.CAMBIAR_TRATAMIENTO, self.item.id, self.superadmin.id),
        )
        self.assertEqual(
            (correccion.resumen["sesiones_total_antes"], correccion.resumen["sesiones_total_despues"]), (6, 4),
        )
        self.assertTrue(LogAccion.objects.filter(accion="cotizacion.cambiar_tratamiento").exists())
        [hecha] = self.client.get(
            "/api/v1/admin/soporte/correcciones/", {"clinica": str(self.clinica.id), "tipo": "cambiar_tratamiento"},
        ).json()
        self.assertEqual((hecha["tratamiento_antes"], hecha["tratamiento_despues"]), ("RF x6", "HIFU x4"))

    def test_la_vista_previa_muestra_el_protocolo_y_no_cambia_nada(self):
        r = self._cambiar(confirmar=False)
        self.assertEqual(r.status_code, 200, r.content)
        filas = [(f["nombre"], f["numero"], f["origen"]) for f in r.json()["protocolo"]]
        self.assertEqual(filas, [
            ("HIFU", 1, "atencion"), ("HIFU", 2, "atencion"), ("HIFU", 3, "pendiente"), ("HIFU", 4, "pendiente"),
        ])
        self.assertEqual(r.json()["restantes"], 2)
        self.item.refresh_from_db()
        self.agendada.refresh_from_db()
        self.assertEqual(self.item.descripcion, "RF x6")
        self.assertEqual(self.agendada.servicio_id, self.rf.id)
        self.assertFalse(CorreccionSoporte.objects.exists())

    def test_cada_atencion_necesita_su_sesion(self):
        r = self._cambiar([(self.hecha, self._ranura(1))])
        self.assertEqual(r.json()["code"], "ASIGNACIONES_INCOMPLETAS")
        r = self._cambiar([(self.hecha, self._ranura(1)), (self.agendada, self._ranura(1))])
        self.assertEqual(r.json()["code"], "SESION_REPETIDA")

    def test_mismo_tratamiento_no_cambia_nada(self):
        r = self._cambiar(tratamiento=self.equivocado)
        self.assertEqual(r.json()["code"], "SIN_CAMBIOS")

    def test_motivo_requerido(self):
        datos = {
            "clinica": str(self.clinica.id), "item": str(self.item.id), "tratamiento": str(self.correcto.id),
            "asignaciones": [], "motivo": "  ",
        }
        self.assertEqual(self.client.post(f"{BASE}/confirmar/", datos, format="json").status_code, 400)

    def test_un_obsequio_del_tratamiento_bloquea(self):
        self.cotizacion.items.create(
            tipo=ItemCotizacion.Tipo.LIBRE, descripcion="Sesión RF de cortesía", num_citas=1,
            valor_unitario="0", es_obsequio=True, agendable=True, item_origen=self.item,
            tipo_sesion_origen=self.equivocado.tipos_sesion.get(),
        )
        [venta] = self._ventas()
        self.assertIsNotNone(venta["bloqueo_tratamiento"])
        self.assertEqual(self._cambiar().json()["code"], "TRATAMIENTO_NO_CAMBIABLE")

    def test_cotizacion_sin_aceptar_o_migrada_no_se_cambia(self):
        Cotizacion.objects.filter(pk=self.cotizacion.pk).update(estado=Cotizacion.Estado.BORRADOR)
        self.assertEqual(self._cambiar().json()["code"], "VENTA_NO_ACEPTADA")
        Cotizacion.objects.filter(pk=self.cotizacion.pk).update(estado=Cotizacion.Estado.ACEPTADA, es_migracion=True)
        self.assertEqual(self._cambiar().json()["code"], "ITEM_MIGRADO")

    def test_avisa_el_compromiso_de_pago_firmado(self):
        Consentimiento.objects.create(
            cotizacion=self.cotizacion, paciente=self.paciente, plantilla=None,
            contenido_snapshot="Compromiso RF x6", hash_contenido="x" * 64, estado=Consentimiento.Estado.FIRMADO,
        )
        [venta] = self._ventas()
        [aviso] = venta["avisos"]
        self.assertEqual(aviso["code"], "COMPROMISO_FIRMADO")
        self.assertIn("documento de aceptación", aviso["texto"])
        # Avisa, no bloquea.
        self.assertEqual(self._cambiar().status_code, 201)

    def test_avisa_las_condiciones_de_compra_promocional_firmadas(self):
        Consentimiento.objects.create(
            cotizacion=self.cotizacion, paciente=self.paciente, plantilla=None,
            alcance_aceptacion=Consentimiento.AlcanceAceptacion.PROMOCIONAL,
            contenido_snapshot="Promo", hash_contenido="x" * 64, estado=Consentimiento.Estado.FIRMADO,
        )
        [venta] = self._ventas()
        codigos = [aviso["code"] for aviso in venta["avisos"]]
        self.assertEqual(codigos, ["COMPROMISO_FIRMADO", "COMPRA_PROMOCIONAL_FIRMADA"])
        self.assertEqual(self._cambiar().status_code, 201)

    def test_venta_de_otra_clinica(self):
        otra = Clinica.objects.create(nombre="Otra", nit="901000999")
        r = self.client.post(f"{BASE}/previsualizar/", {
            "clinica": str(otra.id), "item": str(self.item.id), "tratamiento": str(self.correcto.id), "asignaciones": [],
        }, format="json")
        self.assertEqual(r.json()["code"], "ITEM_NO_ENCONTRADO")

    def test_solo_superadmin(self):
        self.client.force_authenticate(self.profesional)
        r = self.client.get(f"{BASE}/", {"clinica": str(self.clinica.id), "paciente": str(self.paciente.id)})
        self.assertEqual(r.status_code, 403)
