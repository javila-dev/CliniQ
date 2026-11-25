"""Reporte de citas por profesional: resultado, tipo y sesión de cada cita del mes."""
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, Sede, Servicio, TratamientoCatalogo
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.services import aceptar_cotizacion
from apps.historia_clinica.models import HistoriaClinica, NotaClinica
from apps.pacientes.models import Paciente
from apps.protocolos.models import SesionProcedimiento

User = get_user_model()
URL = "/api/v1/reportes/citas-profesional/"


def _en(dia, hora=9):
    """Enero de 2026, ya pasado: lo abierto ahí queda «sin cerrar»."""
    return timezone.make_aware(datetime(2026, 1, dia, hora, 0), timezone.get_current_timezone())


class CitasPorProfesionalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Citas Prof", nit="901555777")
        self.norte = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.sur = Sede.objects.create(
            clinica=self.clinica, nombre="Sur", ciudad="Bogota", direccion="Calle 2", telefono="3000000001",
        )
        self.admin = User.objects.create_user(
            email="admin-citasprof@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.ana = User.objects.create_user(
            email="ana-citasprof@example.com", password="secret123", first_name="Ana", last_name="Pérez",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.beto = User.objects.create_user(
            email="beto-citasprof@example.com", password="secret123", first_name="Beto", last_name="Ruiz",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.consulta = Servicio.objects.create(clinica=self.clinica, nombre="Valoración", duracion_min=30)
        rf = Servicio.objects.create(clinica=self.clinica, nombre="Radiofrecuencia", duracion_min=45, precio="100000")
        self.rf4 = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="RF x4")
        tipo = self.rf4.tipos_sesion.create(nombre="RF", cantidad=4, orden=1, es_compromiso=True)
        tipo.procedimientos.create(procedimiento=rf, orden=1)
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="1012345678",
            nombres="Marta", apellidos="Gómez", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 7", telefono="3001234567",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=self.norte,
        )
        self.item = cotizacion.items.create(
            tipo=ItemCotizacion.Tipo.TRATAMIENTO, tratamiento=self.rf4, descripcion="RF x4",
            num_citas=1, valor_unitario="400000.00",
        )
        aceptar_cotizacion(cotizacion, actor=self.admin)

    def _cita(self, inicio, *, profesional=None, estado=Cita.Estado.PENDIENTE, item=None, sede=None, **extra):
        return Cita.objects.create(
            paciente=self.paciente, sede=sede or self.norte, profesional=profesional or self.ana,
            servicio=None if item else self.consulta, servicio_nombre="RF" if item else "Valoración",
            item_cotizacion=item, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=estado, created_by=self.admin, **extra,
        )

    def _sesion_hecha(self, cita):
        sesion = SesionProcedimiento.objects.filter(
            tratamiento__cotizacion_item=self.item, estado=SesionProcedimiento.Estado.PENDIENTE,
        ).order_by("numero").first()
        sesion.cita = cita
        sesion.estado = SesionProcedimiento.Estado.COMPLETADO
        sesion.save()
        return sesion

    def _nota(self, cita, estado=NotaClinica.EstadoNota.COMPLETADA):
        NotaClinica.objects.create(historia=HistoriaClinica.del_paciente(self.paciente), cita=cita, estado=estado)

    def _get(self, **params):
        r = self.client.get(URL, {"mes": "2026-01", **params})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_resultado_tipo_y_sesion_de_cada_cita(self):
        primera = self._cita(_en(5), estado=Cita.Estado.COMPLETADA, item=self.item,
                             fecha_inicio_real=_en(5, 9), fecha_fin_real=_en(5, 10))
        self._sesion_hecha(primera)
        self._nota(primera)
        segunda = self._cita(_en(12), estado=Cita.Estado.COMPLETADA, item=self.item)
        self._sesion_hecha(segunda)
        self._nota(segunda, NotaClinica.EstadoNota.BORRADOR)
        self._cita(_en(19), estado=Cita.Estado.CANCELADA, item=self.item, motivo_cancelacion="Viaje")
        self._cita(_en(20), estado=Cita.Estado.NO_ASISTIO)
        self._cita(_en(21), estado=Cita.Estado.CONFIRMADA)  # pasó y nadie la cerró
        self._cita(_en(22), profesional=self.beto, estado=Cita.Estado.COMPLETADA)  # cita libre sin nota
        # Cerrada al día siguiente: la duración real no es creíble y cuenta la programada.
        self._cita(_en(23), profesional=self.beto, estado=Cita.Estado.COMPLETADA,
                   fecha_inicio_real=_en(23, 9), fecha_fin_real=_en(24, 8))

        data = self._get()
        self.assertEqual((data["desde"], data["hasta"]), ("2026-01-01", "2026-01-31"))
        filas = {c["fecha"]: c for c in data["citas"]}

        uno = filas["2026-01-05"]
        self.assertEqual((uno["resultado"], uno["tipo"]), ("atendida", "tratamiento"))
        self.assertEqual((uno["tratamiento"], uno["tipo_sesion"]), ("RF x4", "RF"))
        self.assertEqual((uno["sesion_numero"], uno["sesion_total"]), (1, 4))
        self.assertEqual((uno["historia"], uno["duracion_real_min"]), ("firmada", 60))
        self.assertEqual(uno["vendida_por"], "Ada Admin")
        self.assertEqual((filas["2026-01-12"]["sesion_numero"], filas["2026-01-12"]["historia"]), (2, "borrador"))

        cancelada = filas["2026-01-19"]
        self.assertEqual((cancelada["resultado"], cancelada["motivo_cancelacion"]), ("cancelada", "Viaje"))
        self.assertEqual(cancelada["tratamiento"], "RF x4")  # sin sesión asignada, el nombre sale del ítem
        self.assertIsNone(cancelada["sesion_numero"])
        self.assertEqual(filas["2026-01-20"]["resultado"], "no_asistio")
        self.assertEqual(filas["2026-01-21"]["resultado"], "sin_cerrar")
        libre = filas["2026-01-22"]
        self.assertEqual((libre["tipo"], libre["servicio"], libre["historia"]), ("cita_libre", "Valoración", "sin_nota"))

        ana, beto = data["profesionales"]
        self.assertEqual(ana["profesional"], "Ana Pérez")
        self.assertEqual(
            {k: ana[k] for k in ("total", "atendida", "cancelada", "no_asistio", "sin_cerrar", "programada")},
            {"total": 5, "atendida": 2, "cancelada": 1, "no_asistio": 1, "sin_cerrar": 1, "programada": 0},
        )
        self.assertEqual(ana["pct_asistencia"], 67)  # 2 de 3 que se resolvieron
        self.assertEqual(ana["atendidas_por_tipo"]["tratamiento"], 2)
        self.assertEqual(ana["atendidas_sin_nota_firmada"], 1)
        self.assertEqual(ana["minutos_atendidos"], 90)  # 60 reales + 30 programados
        self.assertEqual(ana["pacientes_atendidos"], 1)
        tarde = filas["2026-01-23"]
        self.assertEqual((tarde["inicio_real"], tarde["fin_real"], tarde["duracion_real_min"]), ("09:00", "24/01 08:00", None))
        self.assertEqual((beto["atendida"], beto["atendidas_por_tipo"]["cita_libre"]), (2, 2))
        self.assertEqual((beto["atendidas_sin_nota_firmada"], beto["minutos_atendidos"]), (2, 60))
        self.assertEqual((data["totales"]["total"], data["totales"]["atendida"]), (7, 4))

    def test_solo_el_mes_la_clinica_y_la_sede_pedidos(self):
        self._cita(_en(10))
        self._cita(_en(10), sede=self.sur, profesional=self.beto)
        self._cita(_en(10) + timedelta(days=30))  # febrero
        self._cita(_en(11), estado=Cita.Estado.COMPLETADA, es_migracion=True)  # sesión previa cargada
        otra = Clinica.objects.create(nombre="Otra", nit="901555778")
        sede_otra = Sede.objects.create(
            clinica=otra, nombre="Otra", ciudad="Bogota", direccion="Calle 9", telefono="3000000009",
        )
        self._cita(_en(10), sede=sede_otra)

        self.assertEqual(len(self._get()["citas"]), 2)
        solo_sur = self._get(sede_id=str(self.sur.id))
        self.assertEqual([c["profesional"] for c in solo_sur["citas"]], ["Beto Ruiz"])
        self.assertEqual(len(solo_sur["profesionales"]), 1)

    def test_lo_que_no_ha_llegado_queda_programado(self):
        manana = timezone.now() + timedelta(days=1)
        self._cita(manana, estado=Cita.Estado.CONFIRMADA)
        data = self.client.get(URL, {"desde": timezone.localdate(manana).isoformat(),
                                     "hasta": timezone.localdate(manana).isoformat()}).json()
        self.assertEqual(data["citas"][0]["resultado"], "programada")
        self.assertEqual(data["profesionales"][0]["pct_asistencia"], None)

    def test_documento_y_telefono_enmascarados_sin_permiso(self):
        self._cita(_en(10))
        self.assertEqual(self._get()["citas"][0]["documento"], "CC 1012345678")
        recepcion = User.objects.create_user(
            email="recepcion-citasprof@example.com", password="secret123", first_name="Rita", last_name="Recepción",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        fila = self._get()["citas"][0]
        self.assertEqual(fila["documento"], "CC ••••••5678")
        self.assertEqual(fila["telefono"], "••••••4567")
        self.assertEqual(fila["paciente"], "Marta Gómez")

    def test_sin_permiso_de_reportes_operativos(self):
        from apps.users.models import Permiso, Rol

        rol = Rol.objects.create(clinica=self.clinica, nombre="Solo agenda", slug="solo-agenda")
        rol.permisos.add(Permiso.objects.get(clave="agenda.citas.ver"))
        usuaria = User.objects.create_user(
            email="agenda-citasprof@example.com", password="secret123", first_name="Sol", last_name="Agenda",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(usuaria)
        self.assertEqual(self.client.get(URL, {"mes": "2026-01"}).status_code, 403)
