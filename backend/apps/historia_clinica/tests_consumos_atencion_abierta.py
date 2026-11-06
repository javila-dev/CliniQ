"""Quitar un consumo de insumo de la atención mientras sigue abierta (06/11/2026):
basta con el check "atiende pacientes", que da `inventario.consumo.registrar`,
como con las fotos. Con la atención cerrada hace falta `inventario.consumo.eliminar`."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import ConsumoInsumo, HistoriaClinica, NotaClinica
from apps.historia_clinica.services import registrar_consumo_insumo
from apps.inventario.models import Insumo, StockInsumoSede
from apps.inventario.services import registrar_ajuste
from apps.users.models import Permiso, Rol, RolPermiso


class QuitarConsumoAtencionAbiertaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        # Rol sin permisos de inventario: los de atención los da solo el check.
        self.rol = Rol.objects.create(clinica=self.clinica, slug="cosmetologa", nombre="Cosmetóloga")
        self.cosmetologa = User.objects.create_user(
            email="cosme-insumos@example.com", password="Secret123!", first_name="Cami", last_name="Lopez",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True, rol_dinamico=self.rol,
        )
        inicio = timezone.now() - timedelta(minutes=10)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.cosmetologa, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=Cita.Estado.EN_CURSO, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.nota = NotaClinica.objects.create(historia=HistoriaClinica.del_paciente(self.paciente), cita=cita)
        self.insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gasa", unidad_medida="unidad")
        registrar_ajuste(
            insumo=self.insumo, sede=self.sede, cantidad_nueva=Decimal("10"), user=self.cosmetologa, motivo="Inicial",
        )
        self.consumo = registrar_consumo_insumo(
            nota=self.nota, insumo=self.insumo, cantidad=Decimal("3"), user=self.cosmetologa,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.cosmetologa)

    def _stock(self):
        return StockInsumoSede.objects.get(insumo=self.insumo, sede=self.sede).stock_actual

    def test_con_la_atencion_abierta_quita_su_consumo_sin_permiso_de_eliminar(self):
        r = self.client.delete(f"/api/v1/historia-clinica/consumos-insumo/{self.consumo.id}/")

        self.assertEqual(r.status_code, 204, r.content[:300])
        self.assertFalse(ConsumoInsumo.objects.filter(id=self.consumo.id, activo=True).exists())
        self.assertEqual(self._stock(), Decimal("10"))

    def test_con_la_atencion_cerrada_no_lo_quita_sin_permiso_de_eliminar(self):
        NotaClinica.objects.filter(id=self.nota.id).update(estado=NotaClinica.EstadoNota.COMPLETADA)

        r = self.client.delete(f"/api/v1/historia-clinica/consumos-insumo/{self.consumo.id}/")

        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(ConsumoInsumo.objects.filter(id=self.consumo.id, activo=True).exists())
        self.assertEqual(self._stock(), Decimal("7"))

    def test_con_permiso_de_eliminar_lo_quita_aunque_la_atencion_este_cerrada(self):
        NotaClinica.objects.filter(id=self.nota.id).update(estado=NotaClinica.EstadoNota.COMPLETADA)
        RolPermiso.objects.create(rol=self.rol, permiso=Permiso.objects.get(clave="inventario.consumo.eliminar"))

        r = self.client.delete(f"/api/v1/historia-clinica/consumos-insumo/{self.consumo.id}/")

        self.assertEqual(r.status_code, 204, r.content[:300])
        self.assertEqual(self._stock(), Decimal("10"))

    def test_sin_el_check_ni_permisos_de_insumos_no_lo_quita(self):
        User.objects.filter(id=self.cosmetologa.id).update(es_profesional=False)
        self.cosmetologa.refresh_from_db()

        r = self.client.delete(f"/api/v1/historia-clinica/consumos-insumo/{self.consumo.id}/")

        self.assertEqual(r.status_code, 403)
        self.assertTrue(ConsumoInsumo.objects.filter(id=self.consumo.id, activo=True).exists())
