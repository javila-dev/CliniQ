"""Lo vendido es inmutable: las sesiones de una cotización aceptada salen del tratamiento tal como se
vendió, no del catálogo vigente. Editar un tratamiento solo afecta a las ventas futuras."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo
from apps.cotizaciones.models import ItemCotizacion
from apps.cotizaciones.services import aceptar_cotizacion
from apps.pacientes.models import Paciente
from apps.protocolos.models import TratamientoPaciente

User = get_user_model()


class LoVendidoEsInmutableTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin-inmutable@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.admin)
        self.clinica = Clinica.objects.create(nombre="Clinica Inmutable", nit="901444555")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario={"lunes": ["08:00", "18:00"]},
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="7070",
            nombres="Ana", apellidos="Compradora", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3011111111",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.laser = Servicio.objects.create(clinica=self.clinica, nombre="Laser facial", duracion_min=60)
        self.control = Servicio.objects.create(clinica=self.clinica, nombre="Control medico", duracion_min=30)
        self.tratamiento = TratamientoCatalogo.objects.create(
            clinica=self.clinica, nombre="Rejuvenecimiento", precio_estimado="700000.00",
        )
        self.bloque = TipoSesion.objects.create(
            tratamiento=self.tratamiento, nombre="Laser facial", cantidad=2, orden=1, duracion_min=60,
        )
        TipoSesionProcedimiento.objects.create(tipo_sesion=self.bloque, procedimiento=self.laser, orden=1)

    def _cotizar(self, obsequio_clon=False):
        items = [{"tratamiento": str(self.tratamiento.id), "num_citas": 1}]
        if obsequio_clon:
            items.append({
                "tipo": "libre", "es_obsequio": True, "agendable": True,
                "tipo_sesion_origen": str(self.bloque.id), "origen_indice": 0, "num_citas": 1,
                "valor_referencia": "120000.00",
            })
        response = self.client.post(
            "/api/v1/cotizaciones/",
            {
                "paciente": str(self.paciente.id), "validez_dias": 30, "notas": "", "items": items,
                "formas_pago": [{
                    "tipo": str(FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia").id),
                    "descripcion": "Banco", "valor": "700000.00",
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"], response.json()["items"][0]["id"]

    def _aceptar(self, cotizacion_id):
        from apps.cotizaciones.models import Cotizacion

        aceptar_cotizacion(Cotizacion.objects.get(id=cotizacion_id), actor=self.admin)

    def _editar_catalogo(self):
        """Lo que hace quien edita el tratamiento después de venderlo: más sesiones y un bloque nuevo."""
        self.bloque.cantidad = 5
        self.bloque.save(update_fields=["cantidad", "updated_at"])
        nuevo = TipoSesion.objects.create(
            tratamiento=self.tratamiento, nombre="Control medico", cantidad=3, orden=2, duracion_min=30,
        )
        TipoSesionProcedimiento.objects.create(tipo_sesion=nuevo, procedimiento=self.control, orden=1)

    def _sesiones(self, cotizacion_id):
        return self.client.get(f"/api/v1/cotizaciones/{cotizacion_id}/sesiones/").json()["items"][0]

    def test_una_cotizacion_sin_aceptar_sigue_el_catalogo(self):
        _, item_id = self._cotizar()

        self._editar_catalogo()

        self.assertEqual(ItemCotizacion.objects.get(id=item_id).num_sesiones_efectivas(), 8)

    def test_una_cotizacion_aceptada_conserva_las_sesiones_que_se_vendieron(self):
        cotizacion_id, item_id = self._cotizar()
        self._aceptar(cotizacion_id)
        self.assertEqual(TratamientoPaciente.objects.get().sesiones.count(), 2)

        self._editar_catalogo()

        item = ItemCotizacion.objects.get(id=item_id)
        self.assertEqual(item.num_sesiones_efectivas(), 2)
        self.assertEqual(item.citas_restantes(), 2)
        self.assertEqual(self._sesiones(cotizacion_id)["num_citas"], 2)
        self.assertEqual(self._sesiones(cotizacion_id)["citas_restantes"], 2)
        # El detalle por bloque tampoco cambia: un solo bloque de 2, sin el control que se agregó después.
        self.assertEqual(
            self._sesiones(cotizacion_id)["sesiones_detalle"],
            [{"nombre": "Laser facial", "cantidad": 2, "duracion_min": 60}],
        )

    def test_quitar_sesiones_del_catalogo_tampoco_cambia_lo_vendido(self):
        cotizacion_id, item_id = self._cotizar()
        self._aceptar(cotizacion_id)

        self.bloque.activo = False
        self.bloque.save(update_fields=["activo", "updated_at"])

        self.assertEqual(ItemCotizacion.objects.get(id=item_id).num_sesiones_efectivas(), 2)

    def test_los_obsequios_de_sesion_siguen_sumando_a_lo_vendido(self):
        cotizacion_id, item_id = self._cotizar(obsequio_clon=True)
        self._aceptar(cotizacion_id)
        self.assertEqual(ItemCotizacion.objects.get(id=item_id).num_sesiones_efectivas(), 3)

        self._editar_catalogo()

        self.assertEqual(ItemCotizacion.objects.get(id=item_id).num_sesiones_efectivas(), 3)

    def test_una_venta_anterior_sin_copia_guardada_sigue_usando_el_catalogo(self):
        """Ventas viejas sin sesiones guardadas: no hay otra fuente, así que se conserva el comportamiento anterior."""
        cotizacion_id, item_id = self._cotizar()
        self._aceptar(cotizacion_id)
        TratamientoPaciente.objects.all().delete()

        self._editar_catalogo()

        self.assertEqual(ItemCotizacion.objects.get(id=item_id).num_sesiones_efectivas(), 8)
