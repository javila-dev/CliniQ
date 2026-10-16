"""Regresiones de la revisión del flujo crítico (docs/verificacion/revision-flujo-critico.md)."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.cotizaciones.models import Cotizacion, ItemCotizacion


def _cita(fixture, inicio, **extra):
    return Cita.objects.create(
        paciente=fixture.paciente, sede=fixture.sede, profesional=fixture.profesional, servicio=fixture.servicio,
        servicio_nombre=fixture.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
        duracion_min=30, estado=Cita.Estado.PENDIENTE, canal_confirmacion=fixture.paciente.canal_confirmacion,
        canal_origen=Cita.CanalOrigen.PRESENCIAL, **extra,
    )


class EditarCitaSinTransaccionTests(ClinicaFixtureMixin, TransactionTestCase):
    """AG-01: sin la transacción de TestCase, como en un request real."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-ag01@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_ag01_editar_una_cita_no_da_500(self):
        cita = _cita(self, self.proximo_dia_habil_10am())
        r = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/", {"notas_internas": "Trae exámenes"}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        cita.refresh_from_db()
        self.assertEqual(cita.notas_internas, "Trae exámenes")


class ProcedimientoVendidoTests(ClinicaFixtureMixin, TestCase):
    """QF-01: el ítem de procedimiento guarda `procedimiento`, no `servicio`."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-qf01@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.ACEPTADA, aceptada_en=timezone.now(),
        )
        self.item = ItemCotizacion.objects.create(
            cotizacion=cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.servicio,
            descripcion=self.servicio.nombre, num_citas=1, valor_unitario="150000",
        )

    def test_qf01_hay_horarios_para_el_procedimiento_vendido(self):
        fecha = self.proximo_dia_habil_10am().date().isoformat()
        r = self.client.get("/api/v1/agenda/citas/slots_disponibles/", {
            "profesional_id": str(self.profesional.id), "sede_id": str(self.sede.id), "fecha": fecha,
            "item_cotizacion_id": str(self.item.id),
        })
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertTrue(r.json())

    def test_qf01_se_agenda_el_procedimiento_vendido_con_su_duracion(self):
        r = self.client.post("/api/v1/agenda/citas/", {
            "paciente": str(self.paciente.id), "sede": str(self.sede.id), "profesional": str(self.profesional.id),
            "fecha_inicio": self.proximo_dia_habil_10am().isoformat(), "canal_origen": "presencial",
            "item_cotizacion": str(self.item.id),
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content[:300])
        cita = Cita.objects.get(id=r.json()["id"])
        self.assertEqual(cita.duracion_min, self.servicio.duracion_min)


class AtencionTests(ClinicaFixtureMixin, TestCase):
    """AT-01/02/03/04 y QF-02."""

    def setUp(self):
        self.crear_clinica_base()
        self.otro = User.objects.create_user(
            email="otro-prof@test.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.recepcion = User.objects.create_user(
            email="recep-at@test.com", password="Secret123!", first_name="Re", last_name="Cep",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.historia = self.paciente.historia_clinica
        self.client = APIClient()

    def _en_curso(self, profesional=None):
        cita = _cita(self, timezone.now() - timedelta(minutes=5))
        Cita.objects.filter(id=cita.id).update(profesional=profesional or self.profesional, estado=Cita.Estado.EN_CURSO)
        cita.refresh_from_db()
        return cita

    def _nota(self, cita):
        self.client.force_authenticate(self.profesional)
        return self.client.post("/api/v1/historia-clinica/notas/", {
            "historia": str(self.historia.id), "cita": str(cita.id)}, format="json").json()["id"]

    def test_at04_crear_la_nota_dos_veces_devuelve_el_mismo_borrador(self):
        cita = self._en_curso()
        self.client.force_authenticate(self.profesional)
        datos = {"historia": str(self.historia.id), "cita": str(cita.id)}
        primera = self.client.post("/api/v1/historia-clinica/notas/", datos, format="json")
        segunda = self.client.post("/api/v1/historia-clinica/notas/", datos, format="json")
        self.assertEqual(primera.status_code, 201, primera.content[:200])
        self.assertEqual(segunda.status_code, 200)
        self.assertEqual(primera.json()["id"], segunda.json()["id"])

    def test_at02_otro_profesional_no_edita_ni_completa_la_nota(self):
        nota_id = self._nota(self._en_curso())
        self.client.force_authenticate(self.otro)
        editar = self.client.patch(f"/api/v1/historia-clinica/notas/{nota_id}/", {"motivo_consulta": "x"}, format="json")
        completar = self.client.post(f"/api/v1/historia-clinica/notas/{nota_id}/completar/", {}, format="json")
        self.assertEqual(editar.status_code, 403)
        self.assertEqual(completar.status_code, 403)

    def test_at01_otro_profesional_no_borra_examenes_ajenos(self):
        from apps.historia_clinica.models import ResultadoExamen

        examen = ResultadoExamen.objects.create(
            historia=self.historia, titulo="Perfil lipídico", fecha=timezone.localdate(), created_by=self.profesional,
        )
        self.client.force_authenticate(self.otro)
        self.assertEqual(self.client.delete(f"/api/v1/historia-clinica/resultados-examenes/{examen.id}/").status_code, 403)
        self.assertTrue(ResultadoExamen.objects.filter(id=examen.id).exists())
        self.client.force_authenticate(self.profesional)
        self.assertEqual(self.client.delete(f"/api/v1/historia-clinica/resultados-examenes/{examen.id}/").status_code, 204)

    def test_qf02_recepcion_no_inicia_la_atencion(self):
        cita = _cita(self, timezone.now() + timedelta(minutes=10))
        Cita.objects.filter(id=cita.id).update(estado=Cita.Estado.EN_ESPERA)
        self.client.force_authenticate(self.recepcion)
        r = self.client.post(f"/api/v1/agenda/citas/{cita.id}/cambiar_estado/", {"estado": "en_curso"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_at03_completar_atencion_es_una_sola_operacion_e_idempotente(self):
        from apps.historia_clinica.models import NotaClinica

        cita = self._en_curso()
        nota_id = self._nota(cita)
        self.client.patch(f"/api/v1/historia-clinica/notas/{nota_id}/", {"motivo_consulta": "Control"}, format="json")
        r = self.client.post(f"/api/v1/agenda/citas/{cita.id}/completar_atencion/", {"nota": nota_id}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        cita.refresh_from_db()
        self.assertEqual(cita.estado, Cita.Estado.COMPLETADA)
        self.assertEqual(NotaClinica.objects.get(id=nota_id).estado, NotaClinica.EstadoNota.COMPLETADA)
        # Reintentar (la respuesta se perdió) no es un error.
        otra_vez = self.client.post(f"/api/v1/agenda/citas/{cita.id}/completar_atencion/", {"nota": nota_id}, format="json")
        self.assertEqual(otra_vez.status_code, 200)
        completar = self.client.post(f"/api/v1/historia-clinica/notas/{nota_id}/completar/", {}, format="json")
        self.assertEqual(completar.status_code, 200)

    def test_at03_otro_profesional_no_cierra_la_atencion(self):
        cita = self._en_curso()
        self._nota(cita)
        self.client.force_authenticate(self.otro)
        r = self.client.post(f"/api/v1/agenda/citas/{cita.id}/completar_atencion/", {}, format="json")
        self.assertIn(r.status_code, {403, 404})


class PaqueteSesionesTests(ClinicaFixtureMixin, TestCase):
    """AG-02: las sesiones previas de la puesta en marcha cuentan como usadas."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-ag02@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.ACEPTADA, aceptada_en=timezone.now(),
        )
        self.item = ItemCotizacion.objects.create(
            cotizacion=cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.servicio,
            descripcion=self.servicio.nombre, num_citas=3, valor_unitario="150000", sesiones_previas_consumidas=2,
        )

    def _agendar(self, horas):
        return self.client.post("/api/v1/agenda/citas/", {
            "paciente": str(self.paciente.id), "sede": str(self.sede.id), "profesional": str(self.profesional.id),
            "fecha_inicio": (self.proximo_dia_habil_10am() + timedelta(hours=horas)).isoformat(),
            "canal_origen": "presencial", "item_cotizacion": str(self.item.id),
        }, format="json")

    def test_ag02_no_se_agenda_mas_alla_de_lo_que_queda(self):
        self.assertEqual(self._agendar(0).status_code, 201)
        segunda = self._agendar(2)
        self.assertEqual(segunda.status_code, 400)
        self.assertIn("SIN_SESIONES", str(segunda.content))

    def test_no_asistio_devuelve_la_sesion_y_el_horario(self):
        # Decisión del 15/10/2026: "no asistió" no consume sesión, queda como registro.
        primera = self._agendar(0)
        Cita.objects.filter(id=primera.json()["id"]).update(estado=Cita.Estado.NO_ASISTIO)
        self.item.refresh_from_db()
        self.assertEqual(self.item.citas_restantes(), 1)
        # Se vuelve a agendar, incluso a la misma hora (ya no ocupa el horario).
        self.assertEqual(self._agendar(0).status_code, 201, "la sesión y el horario debían quedar libres")


class DecisionesDelFlujoTests(ClinicaFixtureMixin, TestCase):
    """Decisiones del 15/10/2026: cobro al cancelar, cotizaciones de otro y montos al agendar."""

    def setUp(self):
        from apps.clinicas.models import FormaDePago
        from apps.cobros.models import Cobro, PagoRecibido

        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-dec@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.recepcion = User.objects.create_user(
            email="recep-dec@test.com", password="Secret123!", first_name="Re", last_name="Cep",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client = APIClient()
        self.cita = _cita(self, self.proximo_dia_habil_10am())
        cobro = Cobro.objects.create(
            origen=Cobro.Origen.CITA, cita=self.cita, paciente=self.paciente, sede=self.sede,
            created_by=self.admin, total="150000", subtotal="150000",
        )
        PagoRecibido.objects.create(
            cobro=cobro, medio_pago=FormaDePago.objects.filter(clinica=self.clinica).first(), valor="150000",
            fecha=timezone.now(), recibido_por=self.admin,
        )
        self.cobro = cobro

    def _cancelar(self, user, **extra):
        self.client.force_authenticate(user)
        return self.client.post(f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/", {
            "estado": "cancelada", "motivo_cancelacion": "Viaje", **extra}, format="json")

    def test_cancelar_cita_cobrada_pregunta_por_el_cobro(self):
        r = self._cancelar(self.recepcion)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "CITA_CON_COBRO_PAGADO")
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.PENDIENTE)

    def test_cancelar_manteniendo_el_cobro(self):
        r = self._cancelar(self.recepcion, accion_cobro="mantener")
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.cobro.refresh_from_db()
        self.assertNotEqual(self.cobro.estado, "anulado")
        self.assertTrue(self.cobro.pagos.exists())

    def test_anular_el_cobro_exige_permiso(self):
        self.assertEqual(self._cancelar(self.recepcion, accion_cobro="anular").status_code, 403)
        r = self._cancelar(self.admin, accion_cobro="anular")
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.cobro.refresh_from_db()
        self.assertEqual(self.cobro.estado, "anulado")
        self.assertFalse(self.cobro.pagos.exists())

    def test_quien_solo_ve_lo_suyo_lista_pero_no_abre_cotizaciones_ajenas(self):
        ajena = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.BORRADOR,
        )
        # El Profesional de sistema atiende y no tiene "ver toda la sede".
        self.client.force_authenticate(self.profesional)
        listado = self.client.get("/api/v1/cotizaciones/", {"paciente": str(self.paciente.id)})
        self.assertEqual(listado.status_code, 200)
        self.assertIn(str(ajena.id), [c["id"] for c in listado.json()["results"]])
        self.assertEqual(self.client.get(f"/api/v1/cotizaciones/{ajena.id}/").status_code, 403)

    def test_listado_para_agendar_sin_montos_para_quien_solo_agenda(self):
        Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.ACEPTADA, aceptada_en=timezone.now(),
        )
        from apps.users.models import Permiso, Rol, RolPermiso

        rol = Rol.objects.create(clinica=self.clinica, slug="agenda-sola", nombre="Agenda sola")
        for clave in ("agenda.citas.ver", "agenda.citas.crear"):
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        agenda = User.objects.create_user(
            email="agenda-dec@test.com", password="Secret123!", first_name="Ag", last_name="Enda",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(agenda)
        r = self.client.get("/api/v1/cotizaciones/", {"paciente": str(self.paciente.id), "estado": "aceptada"})
        self.assertEqual(r.status_code, 200)
        fila = r.json()["results"][0]
        for campo in ("total", "total_pagado", "saldo", "formas_pago", "items"):
            self.assertNotIn(campo, fila)


class HallazgosMediosTests(ClinicaFixtureMixin, TestCase):
    """AT-07, AT-12, CT-03, CT-04, CT-05, CT-06 y AG-07."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-medios@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _cotizacion(self, **extra):
        return Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.BORRADOR, **extra,
        )

    def test_at12_el_paciente_sin_historia_la_recibe_al_consultarla(self):
        from apps.historia_clinica.models import HistoriaClinica

        HistoriaClinica.objects.filter(paciente=self.paciente).delete()
        r = self.client.get("/api/v1/historia-clinica/historias/", {"paciente": str(self.paciente.id)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["results"]), 1)
        # "Datos clínicos" de la cotización ya no responde 500.
        HistoriaClinica.objects.filter(paciente=self.paciente).delete()
        cotizacion = self._cotizacion()
        self.assertEqual(self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/nota_clinica/").status_code, 200)

    def test_at07_cancelar_tras_desiniciar_devuelve_los_insumos(self):
        from apps.historia_clinica.models import ConsumoInsumo, NotaClinica
        from apps.historia_clinica.services import registrar_consumo_insumo
        from apps.inventario.models import Insumo, StockInsumoSede
        from apps.inventario.services import registrar_ajuste

        cita = _cita(self, timezone.now() + timedelta(minutes=10))
        Cita.objects.filter(id=cita.id).update(estado=Cita.Estado.EN_ESPERA)  # tras "Desiniciar"
        nota = NotaClinica.objects.create(historia=self.paciente.historia_clinica, cita=cita)
        insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gasa", unidad_medida="unidad")
        registrar_ajuste(insumo=insumo, sede=self.sede, cantidad_nueva=Decimal("10"), user=self.admin, motivo="Inicial")
        registrar_consumo_insumo(nota=nota, insumo=insumo, cantidad=Decimal("3"), user=self.admin, sede=self.sede)

        r = self.client.post(f"/api/v1/agenda/citas/{cita.id}/cambiar_estado/", {
            "estado": "cancelada", "motivo_cancelacion": "No pudo seguir"}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(StockInsumoSede.objects.get(insumo=insumo, sede=self.sede).stock_actual, Decimal("10"))
        self.assertFalse(ConsumoInsumo.objects.filter(nota=nota, activo=True).exists())

    def test_ct04_envios_enmascarados_sin_datos_sensibles(self):
        from apps.cotizaciones.models import CotizacionEnvio
        from apps.users.models import Permiso, Rol, RolPermiso

        cotizacion = self._cotizacion()
        CotizacionEnvio.objects.create(
            cotizacion=cotizacion, canal=CotizacionEnvio.Canal.WHATSAPP, destinatario="3001234567", enviado_por=self.admin,
        )
        CotizacionEnvio.objects.create(
            cotizacion=cotizacion, canal=CotizacionEnvio.Canal.EMAIL, destinatario="juana@correo.com", enviado_por=self.admin,
        )
        rol = Rol.objects.create(clinica=self.clinica, slug="solo-cotiza", nombre="Solo cotiza")
        RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave="cotizaciones.ver"))
        asesor = User.objects.create_user(
            email="asesor-ct04@test.com", password="Secret123!", first_name="As", last_name="Esor",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(asesor)
        r = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/envios/")
        self.assertEqual(r.status_code, 200, r.content[:300])
        destinatarios = {e["destinatario"] for e in r.json()}
        self.assertNotIn("3001234567", destinatarios)
        self.assertNotIn("juana@correo.com", destinatarios)
        self.assertIn("••••••4567", destinatarios)
        # Con el permiso se ven completos.
        self.client.force_authenticate(self.admin)
        destinatarios = {e["destinatario"] for e in self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/envios/").json()}
        self.assertIn("3001234567", destinatarios)

    def test_ct06_descartar_revoca_el_compromiso_y_su_firma_ya_no_cuenta(self):
        from apps.consentimientos.models import Consentimiento
        from apps.historia_clinica.webhooks import _handle_compromiso_pago

        cotizacion = self._cotizacion()
        compromiso = Consentimiento.objects.create(
            cotizacion=cotizacion, paciente=self.paciente, plantilla=None,
            contenido_snapshot="Compromiso", hash_contenido="a" * 64,
        )
        r = self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", {"estado": "descartada"}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        compromiso.refresh_from_db()
        self.assertEqual(compromiso.estado, Consentimiento.Estado.REVOCADO)
        _handle_compromiso_pago(f"compromiso_pago:{compromiso.id}:aaaa", "DOCUMENT_COMPLETED", "doc-1")
        compromiso.refresh_from_db()
        self.assertEqual(compromiso.estado, Consentimiento.Estado.REVOCADO)

    def test_ct05_descartar_una_de_dos_propuestas_no_cierra_la_oportunidad(self):
        from apps.seguimiento.models import Oportunidad
        from apps.seguimiento.services import al_aceptar_cotizacion

        oportunidad = Oportunidad.objects.create(
            clinica=self.clinica, paciente=self.paciente, contacto_nombre="Paciente",
            proximo_contacto=timezone.localdate(),
        )
        una = self._cotizacion(oportunidad=oportunidad)
        otra = self._cotizacion(oportunidad=oportunidad)
        detalle = self.client.get(f"/api/v1/cotizaciones/{una.id}/").json()
        self.assertEqual(detalle["oportunidad_otras_abiertas"], 1)
        r = self.client.post(f"/api/v1/cotizaciones/{una.id}/cambiar_estado/", {
            "estado": "descartada", "cerrar_oportunidad": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.estado, Oportunidad.Estado.ABIERTA)
        # Si igual se dio por perdida, la venta posterior la gana.
        Oportunidad.objects.filter(id=oportunidad.id).update(estado=Oportunidad.Estado.PERDIDA, motivo_perdida="precio")
        otra.refresh_from_db()
        al_aceptar_cotizacion(otra)
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.estado, Oportunidad.Estado.GANADA)
        self.assertEqual(oportunidad.motivo_perdida, "")

    def test_ct03_la_autorizacion_no_cubre_mas_citas_ni_una_brecha_mayor(self):
        from apps.cotizaciones.autorizaciones import _cubierto

        autorizado = {"p:1": [{"precio": Decimal("80"), "num_citas": 2, "brecha": Decimal("20")}]}
        base = {"clave": "p:1", "precio_efectivo": Decimal("80"), "num_citas": 2, "minimo": Decimal("100")}
        self.assertTrue(_cubierto(base, autorizado))
        self.assertTrue(_cubierto({**base, "precio_efectivo": Decimal("90")}, autorizado))
        self.assertFalse(_cubierto({**base, "num_citas": 3}, autorizado))
        # Otra sede con precio de lista más alto: el mismo precio es más descuento.
        self.assertFalse(_cubierto({**base, "minimo": Decimal("120")}, autorizado))
        self.assertFalse(_cubierto({**base, "precio_efectivo": Decimal("70")}, autorizado))

    def test_ag07_la_sesion_elegida_define_la_duracion(self):
        from types import SimpleNamespace

        from apps.agenda.services import _resolver_duracion

        item = SimpleNamespace(
            id=1, tratamiento_id=1, tratamiento=SimpleNamespace(nombre="paquete facial"), descripcion="Paquete",
            servicio_id=None,
        )
        sesion = SimpleNamespace(tipo_sesion=SimpleNamespace(duracion_min=30, nombre="Control"), procedimiento_id=None)
        self.assertEqual(_resolver_duracion(None, item, None, sesion), (30, "Paquete Facial"))


class HallazgosBajosTests(ClinicaFixtureMixin, TestCase):
    """CT-09, CT-14, CT-15, AG-11, AG-12, AG-14, AT-21 y AT-22."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-bajos@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _cotizacion(self, **extra):
        return Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.BORRADOR, **extra,
        )

    def test_ct15_descuento_y_valor_fuera_de_rango(self):
        from rest_framework.exceptions import ValidationError

        from apps.cotizaciones.serializers import ItemCotizacionSerializer

        serializer = ItemCotizacionSerializer()
        with self.assertRaises(ValidationError):
            serializer.validate_descuento_porcentaje(Decimal("150"))
        with self.assertRaises(ValidationError):
            serializer.validate_valor_unitario(Decimal("-1"))
        self.assertEqual(serializer.validate_descuento_porcentaje(Decimal("100")), Decimal("100"))

    def test_ct14_no_se_acepta_una_cotizacion_eliminada(self):
        cotizacion = self._cotizacion(activo=False)
        r = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/?activo=false", {"estado": "aceptada"}, format="json",
        )
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertEqual(r.json()["code"], "COTIZACION_ELIMINADA")

    def test_ct09_la_diferencia_de_centavos_va_a_la_ultima_cuota(self):
        from apps.clinicas.models import FormaDePago
        from apps.cotizaciones.models import FormaPagoCotizacion
        from apps.cotizaciones.services import aceptar_cotizacion

        cotizacion = self._cotizacion()
        ItemCotizacion.objects.create(
            cotizacion=cotizacion, tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.servicio,
            descripcion=self.servicio.nombre, num_citas=1, valor_unitario="100000.48",
        )
        tipo = FormaDePago.objects.filter(clinica=self.clinica).first()
        FormaPagoCotizacion.objects.create(cotizacion=cotizacion, tipo=tipo, valor="50000.00")
        FormaPagoCotizacion.objects.create(cotizacion=cotizacion, tipo=tipo, valor="50000.00")
        aceptar_cotizacion(cotizacion, actor=self.admin)
        cuotas = list(cotizacion.cartera.cuotas.values_list("valor_esperado", flat=True))
        self.assertEqual(sum(cuotas), Decimal("100000.48"))

    def test_ag11_aprobar_un_bloqueo_avisa_las_citas_del_horario(self):
        from apps.agenda.models import BloqueoAgenda

        inicio = self.proximo_dia_habil_10am()
        bloqueo = BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, profesional=self.profesional, fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(hours=2), motivo="Congreso", estado=BloqueoAgenda.Estado.PENDIENTE,
            creado_por=self.profesional,
        )
        _cita(self, inicio + timedelta(minutes=30))  # agendada mientras estaba pendiente
        r = self.client.post(f"/api/v1/agenda/bloqueos/{bloqueo.id}/aprobar/", {}, format="json")
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertEqual(r.json()["code"], "BLOQUEO_CON_CITAS")
        r = self.client.post(
            f"/api/v1/agenda/bloqueos/{bloqueo.id}/aprobar/", {"confirmar_citas_afectadas": True}, format="json",
        )
        self.assertEqual(r.status_code, 200, r.content[:300])

    def test_ag12_la_firma_de_asistencia_no_se_marca_sin_verificar(self):
        from unittest import mock

        cita = _cita(self, self.proximo_dia_habil_10am())
        with mock.patch("apps.consentimientos.services.ESPERA_CONFIRMAR_FIRMA_SEG", 0):
            r = self.client.post(f"/api/v1/agenda/citas/{cita.id}/confirmar_firma_asistencia/", {}, format="json")
        self.assertEqual(r.status_code, 409)
        cita.refresh_from_db()
        self.assertNotEqual(cita.firma_asistencia_estado, "firmada")

    def test_ag14_no_se_confirma_una_cita_cancelada(self):
        cita = _cita(self, self.proximo_dia_habil_10am())
        Cita.objects.filter(id=cita.id).update(estado=Cita.Estado.CANCELADA)
        r = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/confirmar_manual/", {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_at21_put_sobre_la_historia_no_da_500(self):
        historia = self.paciente.historia_clinica
        r = self.client.put(f"/api/v1/historia-clinica/historias/{historia.id}/", {}, format="json")
        self.assertEqual(r.status_code, 405)

    def test_at22_no_se_agenda_al_profesional_fuera_de_sus_sedes(self):
        from datetime import date

        from apps.clinicas.models import Sede
        from apps.colaboradores.models import Colaborador

        otra = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 9", telefono="3000000001",
            horario=dict(self.sede.horario),
        )
        Colaborador.objects.create(
            user=self.profesional, sede_principal=self.sede, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(), numero_documento="99887766",
        )
        r = self.client.post("/api/v1/agenda/citas/", {
            "paciente": str(self.paciente.id), "sede": str(otra.id), "profesional": str(self.profesional.id),
            "fecha_inicio": self.proximo_dia_habil_10am().isoformat(), "canal_origen": "presencial",
            "servicio": str(self.servicio.id),
        }, format="json")
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertIn("PROFESIONAL_FUERA_DE_SEDE", str(r.content))


class FirmasDocumensoTests(ClinicaFixtureMixin, TestCase):
    """Las tres firmas por embed se confirman con la API de Documenso, no con el aviso del navegador."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-firmas@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        from apps.consentimientos.models import Consentimiento

        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, sede=self.sede, profesional=self.admin,
            estado=Cotizacion.Estado.BORRADOR,
        )
        self.compromiso = Consentimiento.objects.create(
            cotizacion=self.cotizacion, paciente=self.paciente, plantilla=None,
            contenido_snapshot="Compromiso", hash_contenido="a" * 64, documenso_documento_id="env-1",
        )
        self.url = f"/api/v1/consentimientos/{self.compromiso.id}/confirmar_firma_documenso/"

    def _confirmar(self, respuesta_documenso):
        from unittest import mock

        with mock.patch("apps.consentimientos.services.ESPERA_CONFIRMAR_FIRMA_SEG", 0), mock.patch(
            "apps.historia_clinica.services._fetch_documenso_json", return_value=respuesta_documenso,
        ), mock.patch("apps.consentimientos.services.recuperar_pdf_compromiso_pago", return_value=False):
            return self.client.post(self.url, {}, format="json")

    def test_compromiso_sin_firma_en_documenso_no_se_marca(self):
        from apps.consentimientos.models import Consentimiento

        r = self._confirmar({"status": "PENDING", "recipients": [{"role": "SIGNER", "signingStatus": "NOT_SIGNED"}]})
        self.assertEqual(r.status_code, 409, r.content[:300])
        self.assertEqual(r.json()["code"], "FIRMA_NO_CONFIRMADA")
        self.compromiso.refresh_from_db()
        self.assertEqual(self.compromiso.estado, Consentimiento.Estado.PENDIENTE)
        self.cotizacion.refresh_from_db()
        self.assertEqual(self.cotizacion.estado, Cotizacion.Estado.BORRADOR)

    def test_compromiso_confirmado_por_documenso_queda_firmado(self):
        from apps.consentimientos.models import Consentimiento

        r = self._confirmar({"status": "COMPLETED"})
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.compromiso.refresh_from_db()
        self.assertEqual(self.compromiso.estado, Consentimiento.Estado.FIRMADO)

    def test_compromiso_revocado_no_se_marca_aunque_documenso_diga_firmado(self):
        from apps.consentimientos.models import Consentimiento

        Consentimiento.objects.filter(id=self.compromiso.id).update(estado=Consentimiento.Estado.REVOCADO)
        r = self._confirmar({"status": "COMPLETED"})
        self.assertEqual(r.status_code, 409)
        self.compromiso.refresh_from_db()
        self.assertEqual(self.compromiso.estado, Consentimiento.Estado.REVOCADO)

    def test_asistencia_confirmada_por_documenso_queda_firmada(self):
        cita = _cita(self, self.proximo_dia_habil_10am())
        Cita.objects.filter(id=cita.id).update(firma_asistencia_documento_id="env-2", firma_asistencia_estado="enviada")
        from unittest import mock

        with mock.patch("apps.consentimientos.services.ESPERA_CONFIRMAR_FIRMA_SEG", 0), mock.patch(
            "apps.historia_clinica.services._fetch_documenso_json", return_value={"status": "COMPLETED"},
        ), mock.patch("apps.consentimientos.services.recuperar_pdf_asistencia", return_value=False):
            r = self.client.post(f"/api/v1/agenda/citas/{cita.id}/confirmar_firma_asistencia/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        cita.refresh_from_db()
        self.assertEqual(cita.firma_asistencia_estado, "firmada")


class FirmaDiferidaProfesionalTests(ClinicaFixtureMixin, TestCase):
    """Consentimiento con firma posterior del médico: basta la firma del paciente, aunque el sobre siga abierto."""

    SOBRE = {
        "status": "PENDING",
        "recipients": [
            {"id": 11, "role": "SIGNER", "signingOrder": 1, "signingStatus": "SIGNED"},
            {"id": 12, "role": "SIGNER", "signingOrder": 2, "signingStatus": "NOT_SIGNED"},
        ],
    }

    def setUp(self):
        self.crear_clinica_base()

    def _consentimiento(self, recipient_paciente_id):
        from apps.historia_clinica.models import ConsentimientoInformado

        return ConsentimientoInformado.objects.create(
            paciente=self.paciente, clinica=self.clinica, tipo="general", documenso_template_token="tpl",
            documenso_document_id="env-9", requiere_firma_profesional=True,
            documenso_recipient_paciente_id=recipient_paciente_id, documenso_recipient_profesional_id="12",
        )

    def test_firmo_el_paciente_y_falta_el_medico(self):
        from apps.historia_clinica.services import paciente_firmo_en_envelope

        self.assertTrue(paciente_firmo_en_envelope(self._consentimiento("11"), self.SOBRE))

    def test_registro_viejo_sin_id_del_paciente_usa_el_primer_firmante(self):
        from apps.historia_clinica.services import paciente_firmo_en_envelope

        self.assertTrue(paciente_firmo_en_envelope(self._consentimiento(""), self.SOBRE))

    def test_sin_firma_del_paciente_no_se_confirma(self):
        from apps.historia_clinica.services import paciente_firmo_en_envelope

        sobre = {**self.SOBRE, "recipients": [{**r, "signingStatus": "NOT_SIGNED"} for r in self.SOBRE["recipients"]]}
        self.assertFalse(paciente_firmo_en_envelope(self._consentimiento("11"), sobre))
