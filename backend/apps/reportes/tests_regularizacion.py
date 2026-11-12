"""Regularizar un paquete: registrar las sesiones hechas por fuera de la app."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.agenda.models import Cita
from apps.core.models import LogAccion
from apps.historia_clinica.models import NotaClinica
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente
from apps.reportes.tests_paquetes import URL as URL_REPORTE
from apps.reportes.tests_paquetes import PaquetesFixture, User


def url(item, sesion=None):
    base = f"{URL_REPORTE}{item.id}/regularizar/"
    return f"{base}{sesion}/deshacer/" if sesion else base


class RegularizarPaqueteTests(PaquetesFixture, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            email="admin-regularizar@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.client.credentials()
        self.hace_dias = 60
        self.item = self._venta("Ana", hace_dias=self.hace_dias)

    def _estado(self, item=None):
        r = self.client.get(url(item or self.item))
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _fila(self, sesion_id, *, dias=-10, modo="sesion", **extra):
        return {
            "sesion_id": sesion_id, "fecha": (timezone.localdate() + timedelta(days=dias)).isoformat(),
            "profesional_id": str(self.profesional.id), "modo": modo, **extra,
        }

    def _registrar(self, filas, item=None, esperado=200):
        r = self.client.post(url(item or self.item), {"sesiones": filas}, format="json")
        self.assertEqual(r.status_code, esperado, r.content)
        return r.json()

    def test_estado_lista_las_sesiones_pendientes_y_los_profesionales(self):
        data = self._estado()
        self.assertEqual((data["sesiones_total"], data["sin_agendar"], len(data["pendientes"])), (4, 4, 4))
        self.assertEqual([p["posicion"] for p in data["pendientes"]], [1, 2, 3, 4])
        self.assertEqual(data["origen"], "venta")
        self.assertEqual(data["fecha_minima"], (timezone.localdate() - timedelta(days=self.hace_dias)).isoformat())
        ids = {p["id"] for p in data["profesionales"]}
        self.assertIn(str(self.profesional.id), ids)
        self.assertIn(str(self.admin.id), ids)
        self.assertNotIn(str(self.laura.id), ids)  # recepción sin atender
        self.assertTrue(data["puede_nota_clinica"])

    def test_registrar_solo_la_sesion_descuenta_el_cupo_sin_crear_citas(self):
        sesion = self._estado()["pendientes"][0]["id"]
        data = self._registrar([self._fila(sesion, nota="La atendió en la sede sin agendar")])

        s = SesionProcedimiento.objects.get(pk=sesion)
        self.assertEqual(s.estado, SesionProcedimiento.Estado.COMPLETADO)
        self.assertIsNone(s.cita_id)
        self.assertEqual(s.fecha, timezone.localdate() - timedelta(days=10))
        self.assertIsNone(s.hora)
        self.assertEqual(s.profesional, self.profesional)
        self.assertEqual(s.observaciones, "La atendió en la sede sin agendar")
        self.assertEqual(s.registrada_despues_por, self.admin)
        self.assertIsNotNone(s.registrada_despues_en)
        self.assertIsNone(s.evolucion_regularizacion_id)

        self.item.refresh_from_db()
        self.assertEqual(self.item.sesiones_previas_consumidas, 1)
        self.assertEqual(self.item.citas_restantes(), 3)
        self.assertFalse(Cita.objects.filter(item_cotizacion=self.item).exists())
        self.assertFalse(NotaClinica.objects.filter(historia__paciente=self.item.cotizacion.paciente).exists())
        self.assertEqual((len(data["pendientes"]), len(data["registradas"])), (3, 1))
        self.assertTrue(LogAccion.objects.filter(accion="paquete.regularizar", objeto_id=str(self.item.id)).exists())

    def test_con_nota_clinica_escribe_una_evolucion_firmada_por_quien_registra(self):
        sesion = self._estado()["pendientes"][0]["id"]
        self._registrar([self._fila(sesion, modo="nota_clinica", nota_clinica="Buena tolerancia, sin eritema.")])

        s = SesionProcedimiento.objects.select_related("evolucion_regularizacion").get(pk=sesion)
        nota = s.evolucion_regularizacion
        self.assertIsNotNone(nota)
        self.assertIsNone(nota.cita_id)
        self.assertEqual(nota.estado, NotaClinica.EstadoNota.COMPLETADA)
        self.assertEqual(nota.firmada_por, self.admin)
        self.assertEqual(nota.historia.paciente, self.item.cotizacion.paciente)
        self.assertIn("Buena tolerancia, sin eritema.", nota.motivo_consulta)
        self.assertIn("Atendió: Pro Fesional", nota.motivo_consulta)
        self.assertIn("Registrada después por Ada Admin", nota.motivo_consulta)

    def test_nota_clinica_exige_texto_y_permiso_de_notas(self):
        sesion = self._estado()["pendientes"][0]["id"]
        r = self._registrar([self._fila(sesion, modo="nota_clinica")], esperado=400)
        self.assertEqual(r["code"], "NOTA_CLINICA_REQUERIDA")

        # Un rol con el permiso de regularizar pero sin escribir notas clínicas.
        from apps.users.models import Permiso, Rol

        rol = Rol.objects.create(clinica=self.clinica, nombre="Coordinación", slug="coordinacion")
        for clave in ("reportes.paquetes.regularizar", "reportes.ver_operativos"):
            rol.permisos.add(Permiso.objects.get(clave=clave))
        coordinadora = User.objects.create_user(
            email="coordina-regularizar@example.com", password="secret123", first_name="Coco", last_name="Ordina",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(coordinadora)
        self.assertFalse(self._estado()["puede_nota_clinica"])
        r = self._registrar([self._fila(sesion, modo="nota_clinica", nota_clinica="x")], esperado=403)
        self.assertEqual(r["code"], "SIN_PERMISO_NOTA_CLINICA")
        self._registrar([self._fila(sesion)])  # solo la sesión, sí

    def test_quien_vende_no_regulariza_sin_el_permiso(self):
        self.client.force_authenticate(self.laura)
        self.assertEqual(self.client.get(url(self.item)).status_code, 403)

    def test_fecha_entre_la_venta_y_hoy_y_profesional_obligatorio(self):
        sesion = self._estado()["pendientes"][0]["id"]
        casos = [
            (self._fila(sesion, dias=1), "FECHA_FUTURA"),
            (self._fila(sesion, dias=-(self.hace_dias + 1)), "FECHA_ANTERIOR_A_LA_VENTA"),
            ({**self._fila(sesion), "fecha": ""}, "FECHA_REQUERIDA"),
            ({**self._fila(sesion), "profesional_id": ""}, "PROFESIONAL_REQUERIDO"),
            ({**self._fila(sesion), "profesional_id": str(self.laura.id)}, "PROFESIONAL_REQUERIDO"),
        ]
        for fila, code in casos:
            with self.subTest(code=code):
                self.assertEqual(self._registrar([fila], esperado=400)["code"], code)
        self.assertFalse(SesionProcedimiento.objects.filter(
            tratamiento__cotizacion_item=self.item, estado=SesionProcedimiento.Estado.COMPLETADO,
        ).exists())
        # El mismo día de la venta y hoy sí valen.
        pendientes = self._estado()["pendientes"]
        self._registrar([self._fila(pendientes[0]["id"], dias=-self.hace_dias), self._fila(pendientes[1]["id"], dias=0)])

    def test_todo_o_nada(self):
        pendientes = self._estado()["pendientes"]
        r = self._registrar([self._fila(pendientes[0]["id"]), self._fila(pendientes[1]["id"], dias=5)], esperado=400)
        self.assertEqual(r["code"], "FECHA_FUTURA")
        self.assertEqual(SesionProcedimiento.objects.filter(registrada_despues_en__isnull=False).count(), 0)
        self.item.refresh_from_db()
        self.assertEqual(self.item.sesiones_previas_consumidas, 0)

    def test_no_registra_mas_sesiones_que_las_que_quedan_sin_agendar(self):
        # Una cita agendada ocupa una de las cuatro aunque su sesión aún no esté ligada.
        self._cita(self.item, dias=3, estado=Cita.Estado.PENDIENTE)
        data = self._estado()
        self.assertEqual(data["sin_agendar"], 3)
        filas = [self._fila(p["id"]) for p in data["pendientes"]]
        r = self._registrar(filas, esperado=400)
        self.assertEqual((r["code"], r["sin_agendar"]), ("SIN_CUPO", 3))
        self._registrar(filas[:3])

    def test_registrar_todas_completa_el_tratamiento_y_sale_del_reporte(self):
        filas = [self._fila(p["id"], dias=-50 + i * 7) for i, p in enumerate(self._estado()["pendientes"])]
        self._registrar(filas)
        tratamiento = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(tratamiento.estado, TratamientoPaciente.Estado.COMPLETADO)
        self.assertEqual(self._estado()["sin_agendar"], 0)

        reporte = self._reporte()
        self.assertIsNone(next((p for p in reporte["paquetes"] if p["item_id"] == str(self.item.id)), None))
        self.assertEqual(reporte["totales"]["registradas_despues"], 4)
        laura = next(g for g in reporte["por_responsable"] if g["id"] == str(self.laura.id))
        self.assertEqual((laura["nombre"], laura["activos"], laura["registradas_despues"]), ("Laura Asesora", 0, 4))
        norte = next(g for g in reporte["por_sede"] if g["id"] == str(self.norte.id))
        self.assertEqual((norte["nombre"], norte["registradas_despues"]), ("Norte", 4))

    def test_el_reporte_cuenta_la_ultima_sesion_registrada_como_movimiento(self):
        sesion = self._estado()["pendientes"][0]["id"]
        self._registrar([self._fila(sesion, dias=-40)])
        fila = next(p for p in self._reporte(dias=30)["paquetes"] if p["item_id"] == str(self.item.id))
        self.assertEqual((fila["sesiones_hechas"], fila["dias_sin_movimiento"], fila["registradas_despues"]), (1, 40, 1))
        self.assertIsNone(next(
            (p for p in self._reporte(dias=45)["paquetes"] if p["item_id"] == str(self.item.id)), None,
        ))

    def test_un_importado_usa_la_fecha_de_la_carga_y_su_responsable(self):
        self.client.force_authenticate(self.superadmin)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        item = self._importar("Isa", hechas=1, hace_dias=20)
        data = self._estado(item)
        self.assertEqual(data["origen"], "importado")
        self.assertEqual(data["fecha_minima"], (timezone.localdate() - timedelta(days=20)).isoformat())
        self.assertEqual((data["sin_agendar"], len(data["pendientes"])), (3, 3))
        self._registrar([self._fila(data["pendientes"][0]["id"], dias=-5)], item=item)
        item.refresh_from_db()
        self.assertEqual(item.sesiones_previas_consumidas, 2)
        reporte = self._reporte()
        superadmin = next(g for g in reporte["por_responsable"] if g["id"] == str(self.superadmin.id))
        self.assertEqual(superadmin["registradas_despues"], 1)

    def test_una_sesion_ya_hecha_o_de_otro_paquete_no_se_registra(self):
        otro = self._venta("Bea", hace_dias=10)
        ajena = SesionProcedimiento.objects.filter(tratamiento__cotizacion_item=otro).first()
        r = self._registrar([self._fila(str(ajena.id))], esperado=404)
        self.assertEqual(r["code"], "SESION_NO_ENCONTRADA")

        sesion = self._estado()["pendientes"][0]["id"]
        self._registrar([self._fila(sesion)])
        r = self._registrar([self._fila(sesion)], esperado=400)
        self.assertEqual(r["code"], "SESION_NO_PENDIENTE")
        r = self._registrar([self._fila(sesion), self._fila(sesion)], esperado=400)
        self.assertEqual(r["code"], "SESION_REPETIDA")

    def test_paquete_de_otra_clinica_no_existe(self):
        self.client.force_authenticate(self.superadmin)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.assertEqual(self.client.get(url(self.item)).status_code, 200)
        # De otra clínica: no existe.
        from apps.clinicas.models import Clinica

        otra = Clinica.objects.create(nombre="Otra", nit="901777334")
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(otra.id))
        self.assertEqual(self.client.get(url(self.item)).status_code, 404)

    def test_deshacer_devuelve_la_sesion_y_el_cupo(self):
        sesion = self._estado()["pendientes"][0]["id"]
        self._registrar([self._fila(sesion, modo="nota_clinica", nota_clinica="Sin novedad.")])
        r = self.client.post(url(self.item, sesion), {"motivo": ""}, format="json")
        self.assertEqual(r.json()["code"], "MOTIVO_REQUERIDO")

        r = self.client.post(url(self.item, sesion), {"motivo": "Era de otra paciente"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        s = SesionProcedimiento.objects.get(pk=sesion)
        self.assertEqual((s.estado, s.fecha, s.profesional_id, s.registrada_despues_en), ("pendiente", None, None, None))
        self.item.refresh_from_db()
        self.assertEqual(self.item.sesiones_previas_consumidas, 0)
        self.assertEqual(r.json()["registradas"], [])
        # La evolución no se borra: queda otra que anula el registro.
        notas = list(NotaClinica.objects.filter(historia__paciente=self.item.cotizacion.paciente).order_by("created_at"))
        self.assertEqual(len(notas), 2)
        self.assertIn("Era de otra paciente", notas[1].motivo_consulta)
        self.assertTrue(LogAccion.objects.filter(accion="paquete.regularizar.deshacer").exists())

        # Una sesión que no se registró después no se deshace por aquí.
        hecha = self._cita(self.item, dias=-2, estado=Cita.Estado.COMPLETADA)
        con_cita = SesionProcedimiento.objects.get(cita=hecha)
        r = self.client.post(url(self.item, con_cita.id), {"motivo": "x"}, format="json")
        self.assertEqual(r.status_code, 404)
