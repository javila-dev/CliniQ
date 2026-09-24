"""Catálogo de tratamientos: aviso de pacientes que ya lo tienen y edición de bloques sin recrearlos."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Servicio, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo
from apps.pacientes.models import Paciente
from apps.protocolos.models import TratamientoPaciente


User = get_user_model()
URL = "/api/v1/clinicas/tratamientos/"


class TratamientosCatalogoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Tratamientos", nit="900999001")
        self.admin = User.objects.create_user(
            email="admin-trat@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.laser = Servicio.objects.create(clinica=self.clinica, nombre="Laser facial", duracion_min=60)
        self.control = Servicio.objects.create(clinica=self.clinica, nombre="Control medico", duracion_min=30)
        self.tratamiento = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="Rejuvenecimiento")
        self.bloque = TipoSesion.objects.create(
            tratamiento=self.tratamiento, nombre="Laser facial", cantidad=5, orden=1, es_compromiso=True,
            duracion_min=60,
        )
        self.relacion = TipoSesionProcedimiento.objects.create(
            tipo_sesion=self.bloque, procedimiento=self.laser, orden=1
        )

    def _paciente(self):
        return Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="1010",
            nombres="Juan", apellidos="Perez", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )

    def test_sin_ventas_no_hay_pacientes(self):
        response = self.client.get(f"{URL}{self.tratamiento.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["pacientes_con_tratamiento"], 0)

    def test_cuenta_los_pacientes_que_ya_lo_tienen_en_detalle_y_en_lista(self):
        TratamientoPaciente.objects.create(
            paciente=self._paciente(), servicio=self.laser, tratamiento_catalogo=self.tratamiento,
            fecha_inicio=timezone.localdate(),
        )

        detalle = self.client.get(f"{URL}{self.tratamiento.id}/").json()
        lista = self.client.get(URL).json()["results"]

        self.assertEqual(detalle["pacientes_con_tratamiento"], 1)
        self.assertEqual(lista[0]["pacientes_con_tratamiento"], 1)

    def test_el_conteo_no_se_puede_escribir(self):
        response = self.client.patch(
            f"{URL}{self.tratamiento.id}/", {"pacientes_con_tratamiento": 99}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["pacientes_con_tratamiento"], 0)

    def test_editar_con_el_id_del_bloque_lo_actualiza_sin_recrearlo(self):
        payload = {
            "tipos_sesion": [
                {
                    "id": str(self.bloque.id), "nombre": "Laser facial", "cantidad": 8, "orden": 1,
                    "es_compromiso": True, "duracion_min": 60,
                    "procedimientos": [
                        {"id": str(self.relacion.id), "procedimiento": str(self.laser.id), "orden": 1},
                    ],
                },
                {
                    "nombre": "Control medico", "cantidad": 1, "orden": 2, "es_compromiso": True,
                    "duracion_min": 30,
                    "procedimientos": [{"procedimiento": str(self.control.id), "orden": 1}],
                },
            ]
        }

        response = self.client.patch(f"{URL}{self.tratamiento.id}/", payload, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        self.bloque.refresh_from_db()
        self.assertTrue(self.bloque.activo)
        self.assertEqual(self.bloque.cantidad, 8)
        self.assertEqual(TipoSesion.objects.filter(tratamiento=self.tratamiento, activo=True).count(), 2)
        self.assertEqual(response.json()["total_sesiones"], 9)

    def test_editar_sin_el_id_reemplaza_el_bloque(self):
        """Comportamiento del formulario anterior: sin id, cada guardado recrea todos los bloques."""
        payload = {
            "tipos_sesion": [
                {
                    "nombre": "Laser facial", "cantidad": 5, "orden": 1, "es_compromiso": True, "duracion_min": 60,
                    "procedimientos": [{"procedimiento": str(self.laser.id), "orden": 1}],
                }
            ]
        }

        self.client.patch(f"{URL}{self.tratamiento.id}/", payload, format="json")

        self.bloque.refresh_from_db()
        self.assertFalse(self.bloque.activo)
