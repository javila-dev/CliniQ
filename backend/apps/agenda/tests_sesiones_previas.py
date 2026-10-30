"""Corrección de soporte (console): las sesiones previas de un paciente migrado."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita, CorreccionSoporte
from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio, TratamientoCatalogo
from apps.core.models import LogAccion
from apps.cotizaciones.models import ItemCotizacion
from apps.migracion.models import LoteMigracion
from apps.pacientes.models import Paciente
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

User = get_user_model()
BASE = "/api/v1/admin/soporte"
PREVIA = "Sesión previa a CliniQ (puesta en marcha)"


class SesionesPreviasTests(TestCase):
    """Marcela llegó con un paquete de 6 sesiones de RF y se cargaron 3 hechas."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="soporte-previas@example.com", password="secret123", first_name="Sopo", last_name="Rte",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Previas", nit="901555444", modo_puesta_en_marcha=True)
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.profesional = User.objects.create_user(
            email="prof-previas@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="555000222",
            nombres="Marcela", apellidos="Ruiz",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365), sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 7", telefono="3000000005", canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        proc = Servicio.objects.create(clinica=self.clinica, nombre="Radiofrecuencia", duracion_min=30, precio="100000.00")
        trat = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="RF x6")
        tipo = trat.tipos_sesion.create(nombre="RF", cantidad=6, orden=1, es_compromiso=True)
        tipo.procedimientos.create(procedimiento=proc, orden=1)

        efectivo = str(FormaDePago.objects.get(clinica=self.clinica, tipo_base="efectivo").id)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        r = self.client.post("/api/v1/migracion/paciente-en-curso/", {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "tratamiento": {
                "tipo": "tratamiento", "tratamiento": str(trat.id), "descripcion": "RF x6",
                "num_sesiones_total": 6, "precio_total_pactado": "600000.00",
            },
            "sesiones_realizadas": [{}, {}, {}],
            "pagos": [{"valor": "600000.00", "medio_pago": efectivo, "fecha": "2026-01-15"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.client.credentials()
        self.lote = LoteMigracion.objects.get()
        self.item = ItemCotizacion.objects.get(cotizacion__paciente=self.paciente)

    def _cargas(self):
        r = self.client.get(f"{BASE}/sesiones-previas/", {"clinica": str(self.clinica.id), "paciente": str(self.paciente.id)})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _corregir(self, sesiones, **extra):
        return self.client.post(f"{BASE}/sesiones-previas/corregir/", {
            "clinica": str(self.clinica.id), "item": str(self.item.id), "sesiones": sesiones,
            "motivo": "La clínica marcó 3 y eran otras", **extra,
        }, format="json")

    def _previas_en_protocolo(self):
        return SesionProcedimiento.objects.filter(
            tratamiento__cotizacion_item=self.item, estado=SesionProcedimiento.Estado.COMPLETADO, cita__isnull=True,
        ).count()

    def _cita_en_app(self, estado):
        inicio = timezone.now() + timedelta(days=1)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio_nombre="RF",
            item_cotizacion=self.item, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=estado,
        )

    def test_lista_la_carga_con_sus_sesiones(self):
        [carga] = self._cargas()
        self.assertEqual(carga["item_id"], str(self.item.id))
        self.assertEqual(carga["total"], 6)
        self.assertEqual(carga["previas"], 3)
        self.assertEqual(carga["minimo"], 0)
        self.assertEqual(carga["maximo"], 6)
        self.assertEqual(carga["restantes"], 3)
        self.assertIsNone(carga["bloqueo"])
        self.assertEqual([s["previa"] for s in carga["sesiones"]], [True] * 3 + [False] * 3)

    def test_sube_las_sesiones_previas(self):
        r = self._corregir(5)
        self.assertEqual(r.status_code, 201, r.content)

        self.item.refresh_from_db()
        self.assertEqual(self.item.sesiones_previas_consumidas, 5)
        self.assertEqual(self.item.citas_restantes(), 1)
        self.assertEqual(self._previas_en_protocolo(), 5)
        self.lote.refresh_from_db()
        self.assertEqual(self.lote.manifest["resumen"]["sesiones_realizadas"], 5)
        self.assertEqual(self.lote.manifest["resumen"]["sesiones_pendientes"], 1)

        correccion = CorreccionSoporte.objects.get()
        self.assertEqual(correccion.tipo, CorreccionSoporte.Tipo.CORREGIR_SESIONES_PREVIAS)
        self.assertIsNone(correccion.cita_id)
        self.assertEqual(correccion.item_origen_id, self.item.id)
        self.assertEqual((correccion.resumen["sesiones_antes"], correccion.resumen["sesiones_despues"]), (3, 5))
        log = LogAccion.objects.get(accion="cotizacion.corregir_sesiones_previas")
        self.assertEqual(log.clinica_id, self.clinica.id)

        # El panel de sesiones de la cotización y el listado de correcciones lo reflejan.
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        sesiones = self.client.get(f"/api/v1/cotizaciones/{self.item.cotizacion_id}/sesiones/").json()["items"][0]
        self.assertEqual((sesiones["citas_completadas"], sesiones["citas_restantes"]), (5, 1))
        self.client.credentials()
        [hecha] = self.client.get(
            f"{BASE}/correcciones/", {"clinica": str(self.clinica.id), "tipo": "corregir_sesiones_previas"},
        ).json()
        self.assertIsNone(hecha["fecha_atencion"])
        self.assertEqual(hecha["paquete"], "RF x6")
        self.assertEqual((hecha["sesiones_antes"], hecha["sesiones_despues"]), (3, 5))

    def test_baja_las_sesiones_previas(self):
        r = self._corregir(1)
        self.assertEqual(r.status_code, 201, r.content)
        self.item.refresh_from_db()
        self.assertEqual(self.item.sesiones_previas_consumidas, 1)
        self.assertEqual(self.item.citas_restantes(), 5)
        self.assertEqual(self._previas_en_protocolo(), 1)
        pendiente = SesionProcedimiento.objects.filter(
            tratamiento__cotizacion_item=self.item, estado=SesionProcedimiento.Estado.PENDIENTE,
        ).first()
        self.assertEqual(pendiente.observaciones, "")
        self.assertIsNone(pendiente.fecha)

    def test_todas_hechas_cierra_el_protocolo_y_al_bajar_se_reabre(self):
        self.assertEqual(self._corregir(6).status_code, 201)
        tratamiento = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(tratamiento.estado, TratamientoPaciente.Estado.COMPLETADO)

        self.assertEqual(self._corregir(4).status_code, 201)
        tratamiento.refresh_from_db()
        self.assertEqual(tratamiento.estado, TratamientoPaciente.Estado.ACTIVO)
        self.assertEqual(self._previas_en_protocolo(), 4)

    def test_no_se_corrige_si_ya_hizo_una_sesion_en_la_app(self):
        self._cita_en_app(Cita.Estado.COMPLETADA)
        [carga] = self._cargas()
        self.assertIn("dentro de la app", carga["bloqueo"])

        r = self._corregir(5)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "SESIONES_HECHAS_EN_APP")
        self.item.refresh_from_db()
        self.assertEqual(self.item.sesiones_previas_consumidas, 3)
        self.assertFalse(CorreccionSoporte.objects.exists())

    def test_tampoco_con_una_atencion_en_curso(self):
        self._cita_en_app(Cita.Estado.EN_CURSO)
        self.assertEqual(self._corregir(5).json()["code"], "SESIONES_HECHAS_EN_APP")

    def test_una_sesion_marcada_a_mano_en_el_protocolo_bloquea(self):
        sesion = SesionProcedimiento.objects.filter(
            tratamiento__cotizacion_item=self.item, estado=SesionProcedimiento.Estado.PENDIENTE,
        ).first()
        sesion.estado = SesionProcedimiento.Estado.COMPLETADO
        sesion.save(update_fields=["estado"])
        self.assertEqual(self._corregir(5).json()["code"], "SESIONES_HECHAS_EN_APP")

    def test_las_citas_agendadas_en_la_app_bajan_el_maximo(self):
        self._cita_en_app(Cita.Estado.PENDIENTE)
        self._cita_en_app(Cita.Estado.CANCELADA)
        [carga] = self._cargas()
        self.assertIsNone(carga["bloqueo"])
        self.assertEqual(carga["maximo"], 5)

        r = self._corregir(6)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "SESIONES_SOBRE_MAXIMO")
        self.assertEqual(self._corregir(5).status_code, 201)
        self.item.refresh_from_db()
        self.assertEqual(self.item.citas_restantes(), 0)

    def test_sin_cambios_falla(self):
        self.assertEqual(self._corregir(3).json()["code"], "SIN_CAMBIOS")

    def test_motivo_requerido(self):
        self.assertEqual(self._corregir(5, motivo="  ").status_code, 400)

    def test_carga_revertida_no_aparece_ni_se_corrige(self):
        self.lote.revertido_en = timezone.now()
        self.lote.save(update_fields=["revertido_en"])
        self.assertEqual(self._cargas(), [])
        self.assertEqual(self._corregir(5).json()["code"], "ITEM_NO_MIGRADO")

    def test_paquete_de_otra_clinica(self):
        otra = Clinica.objects.create(nombre="Otra", nit="901000999")
        r = self.client.post(f"{BASE}/sesiones-previas/corregir/", {
            "clinica": str(otra.id), "item": str(self.item.id), "sesiones": 5, "motivo": "No es de esta clínica",
        }, format="json")
        self.assertEqual(r.json()["code"], "ITEM_NO_ENCONTRADO")

    def test_la_carga_se_puede_revertir_despues_de_corregir(self):
        self.assertEqual(self._corregir(5).status_code, 201)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        r = self.client.post(f"/api/v1/migracion/lotes/{self.lote.id}/revertir/")
        self.assertIn(r.status_code, (200, 204), r.content)
        self.assertFalse(ItemCotizacion.objects.filter(pk=self.item.pk).exists())

    def test_solo_superadmin(self):
        self.client.force_authenticate(self.profesional)
        self.assertEqual(self._corregir(5).status_code, 403)
