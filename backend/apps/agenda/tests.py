from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita, RegistroConfirmacion
from apps.clinicas.models import Clinica, Sede, Servicio, ServicioConsentimiento
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.cotizaciones.models import Cotizacion
from apps.historia_clinica.models import ConsentimientoInformado
from apps.pacientes.models import Paciente


User = get_user_model()


class CitaEnEsperaFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root@example.com",
            password="secret123",
            first_name="Super",
            last_name="Admin",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)

        self.clinica = Clinica.objects.create(nombre="Clinica Demo", nit="900123456")
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario={
                "lunes": ["08:00", "18:00"],
                "martes": ["08:00", "18:00"],
                "miercoles": ["08:00", "18:00"],
                "jueves": ["08:00", "18:00"],
                "viernes": ["08:00", "18:00"],
            },
        )
        self.profesional = User.objects.create_user(
            email="prof@example.com",
            password="secret123",
            first_name="Ana",
            last_name="Lopez",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="123456789",
            nombres="Juan",
            apellidos="Perez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO,
            direccion="Calle 2",
            telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.servicio = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Toxina",
            descripcion="Aplicacion",
            duracion_min=30,
            precio="150000.00",
        )
        self.template = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica,
            tipo=ConsentimientoInformado.TipoConsentimiento.TOXINA_BOTULINICA,
            template_token="toxina-botulinica",
        )
        ServicioConsentimiento.objects.create(servicio=self.servicio, template=self.template, orden=1)
        inicio = timezone.now() + timedelta(hours=2)
        self.cita = Cita.objects.create(
            paciente=self.paciente,
            sede=self.sede,
            servicio=self.servicio,
            profesional=self.profesional,
            fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=self.servicio.duracion_min),
            estado=Cita.Estado.CONFIRMADA,
            estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO,
            canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
            created_by=self.superadmin,
        )

    def test_confirmada_pasa_a_en_espera_y_crea_registro(self):
        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": Cita.Estado.EN_ESPERA, "medio": RegistroConfirmacion.Medio.PRESENCIAL},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.EN_ESPERA)
        self.assertEqual(response.json()["estado"], Cita.Estado.EN_ESPERA)
        self.assertTrue(
            RegistroConfirmacion.objects.filter(
                cita=self.cita,
                estado_resultante=Cita.Estado.EN_ESPERA,
            ).exists()
        )
        self.assertFalse(response.json()["consentimiento_info"]["todos_firmados"])

    def test_profesional_asignado_puede_cambiar_estado_de_su_cita(self):
        self.client.force_authenticate(self.profesional)

        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": Cita.Estado.EN_ESPERA, "medio": RegistroConfirmacion.Medio.PRESENCIAL},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.EN_ESPERA)

    def test_profesional_no_puede_cambiar_estado_de_cita_ajena(self):
        otro_profesional = User.objects.create_user(
            email="otro-prof@example.com",
            password="secret123",
            first_name="Luis",
            last_name="Mora",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
        )
        self.client.force_authenticate(otro_profesional)

        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": Cita.Estado.EN_ESPERA, "medio": RegistroConfirmacion.Medio.PRESENCIAL},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_confirmada_a_en_curso_retorna_invalid_transition(self):
        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": Cita.Estado.EN_CURSO},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {
                "error": "La cita debe pasar primero por en_espera antes de iniciar la atencion.",
                "code": "INVALID_TRANSITION",
            },
        )

    def test_en_espera_a_en_curso_valida_consentimiento(self):
        self.cita.estado = Cita.Estado.EN_ESPERA
        self.cita.save(update_fields=["estado", "updated_at"])

        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": Cita.Estado.EN_CURSO},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CONSENTIMIENTO_REQUERIDO")

        ConsentimientoInformado.objects.create(
            paciente=self.paciente,
            clinica=self.clinica,
            tipo=ConsentimientoInformado.TipoConsentimiento.OTROS,
            documenso_template_token=self.template.template_token,
            documenso_template_nombre=self.template.get_tipo_display(),
            firmado=True,
            fecha_firma=timezone.localdate(),
        )

        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": Cita.Estado.EN_CURSO},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.EN_CURSO)
        self.assertIsNotNone(self.cita.fecha_inicio_real)


class CitaCotizacionItemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-cita-item@example.com",
            password="secret123",
            first_name="Root",
            last_name="Item",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Item", nit="900777123")
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario={
                "lunes": ["08:00", "18:00"],
                "martes": ["08:00", "18:00"],
                "miercoles": ["08:00", "18:00"],
                "jueves": ["08:00", "18:00"],
                "viernes": ["08:00", "18:00"],
            },
        )
        self.profesional = User.objects.create_user(
            email="prof-item@example.com",
            password="secret123",
            first_name="Ana",
            last_name="Lopez",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="987654321",
            nombres="Maria",
            apellidos="Lopez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=31 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 7",
            telefono="3001110000",
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
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.BORRADOR,
        )
        self.item = self.cotizacion.items.create(
            servicio=self.servicio,
            descripcion="Peeling quimico",
            num_citas=1,
            valor_unitario="150000.00",
            descuento_porcentaje="0.00",
        )

    def _payload(self, days=1, hours=0):
        fecha = timezone.localtime()
        while fecha.weekday() >= 5:
            fecha += timedelta(days=1)
        fecha = fecha.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=days, hours=hours)
        return {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "servicio": str(self.servicio.id),
            "profesional": str(self.profesional.id),
            "fecha_inicio": fecha.isoformat(),
            "canal_origen": "presencial",
            "item_cotizacion": str(self.item.id),
        }

    def test_rechaza_item_de_cotizacion_no_aceptada(self):
        response = self.client.post("/api/v1/agenda/citas/", self._payload(), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COTIZACION_NO_ACEPTADA")

    def test_rechaza_item_sin_sesiones_disponibles(self):
        self.cotizacion.estado = Cotizacion.Estado.ACEPTADA
        self.cotizacion.save(update_fields=["estado", "updated_at"])

        first = self.client.post("/api/v1/agenda/citas/", self._payload(days=1, hours=0), format="json")
        second = self.client.post("/api/v1/agenda/citas/", self._payload(days=1, hours=1), format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.json()["code"], "SIN_SESIONES_DISPONIBLES")
