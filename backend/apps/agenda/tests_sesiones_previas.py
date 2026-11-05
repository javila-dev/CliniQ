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
        # El que en realidad compró: 4 sesiones de compromiso y un control que no cuenta.
        self.correcto = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="HIFU x4")
        hifu = self.correcto.tipos_sesion.create(nombre="HIFU", cantidad=4, orden=1, es_compromiso=True)
        hifu.procedimientos.create(procedimiento=proc, orden=1)
        self.correcto.tipos_sesion.create(nombre="Control", cantidad=1, orden=2, es_compromiso=False)

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

    # ── Cambiar el tratamiento ──────────────────────────────────────────────

    def test_lista_los_tratamientos_con_sus_sesiones(self):
        r = self.client.get(f"{BASE}/sesiones-previas/tratamientos/", {"clinica": str(self.clinica.id)})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({t["nombre"]: t["total_sesiones"] for t in r.json()}, {"HIFU x4": 4, "RF x6": 6})
        hifu = next(t for t in r.json() if t["nombre"] == "HIFU x4")
        self.assertEqual([(x["nombre"], x["numero"]) for x in hifu["sesiones"]], [("HIFU", n) for n in range(1, 5)])

    def test_cambia_a_otro_tratamiento_del_catalogo(self):
        viejo = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        r = self._corregir(2, tratamiento={"tipo": "tratamiento", "tratamiento": str(self.correcto.id)})
        self.assertEqual(r.status_code, 201, r.content)

        self.item.refresh_from_db()
        self.assertEqual((self.item.tratamiento_id, self.item.descripcion), (self.correcto.id, "HIFU x4"))
        self.assertEqual(self.item.num_sesiones_efectivas(), 4)
        self.assertEqual(self.item.citas_restantes(), 2)
        self.assertFalse(TratamientoPaciente.objects.filter(pk=viejo.pk).exists())
        nuevo = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(nuevo.tratamiento_catalogo_id, self.correcto.id)
        self.assertEqual(self._previas_en_protocolo(), 2)

        self.lote.refresh_from_db()
        self.assertEqual(self.lote.manifest["tratamientos_paciente"], [str(nuevo.id)])
        self.assertEqual(self.lote.manifest["resumen"]["sesiones_total"], 4)
        self.assertEqual(self.lote.manifest["resumen"]["sesiones_pendientes"], 2)
        [hecha] = self.client.get(f"{BASE}/correcciones/", {"clinica": str(self.clinica.id)}).json()
        self.assertEqual((hecha["tratamiento_antes"], hecha["tratamiento_despues"]), ("RF x6", "HIFU x4"))

        # La carga se sigue pudiendo revertir completa, con el protocolo nuevo.
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        r = self.client.post(f"/api/v1/migracion/lotes/{self.lote.id}/revertir/")
        self.assertIn(r.status_code, (200, 204), r.content)
        self.assertFalse(TratamientoPaciente.objects.filter(pk=nuevo.pk).exists())

    def test_cambia_a_un_tratamiento_libre(self):
        r = self._corregir(3, tratamiento={"tipo": "libre", "descripcion": "Láser 8 sesiones", "num_sesiones_total": 8})
        self.assertEqual(r.status_code, 201, r.content)
        self.item.refresh_from_db()
        self.assertEqual((self.item.tipo, self.item.tratamiento_id, self.item.num_citas), ("libre", None, 8))
        self.assertEqual(self.item.citas_restantes(), 5)
        self.assertFalse(TratamientoPaciente.objects.filter(cotizacion_item=self.item).exists())

    def test_libre_pide_descripcion_y_sesiones(self):
        self.assertEqual(self._corregir(3, tratamiento={"tipo": "libre"}).status_code, 400)

    def test_mas_sesiones_que_el_tratamiento_nuevo_no_cambia_nada(self):
        r = self._corregir(5, tratamiento={"tipo": "tratamiento", "tratamiento": str(self.correcto.id)})
        self.assertEqual(r.json()["code"], "SESIONES_SOBRE_MAXIMO")
        self.item.refresh_from_db()
        self.assertEqual(self.item.descripcion, "RF x6")
        self.assertEqual(self._previas_en_protocolo(), 3)

    # ── Cambiar el tratamiento con atenciones en la app ─────────────────────

    def _ranura(self, numero):
        tipo = self.correcto.tipos_sesion.get(nombre="HIFU")
        return f"{tipo.id}:{numero}"

    def _atencion_en_rf4(self, estado=Cita.Estado.COMPLETADA):
        """Una atención en la app que ocupó la sesión RF #4 del paquete equivocado."""
        cita = self._cita_en_app(estado)
        sesion = SesionProcedimiento.objects.get(tratamiento__cotizacion_item=self.item, numero=4)
        sesion.cita = cita
        if estado == Cita.Estado.COMPLETADA:
            sesion.estado = SesionProcedimiento.Estado.COMPLETADO
            sesion.profesional = self.profesional
        sesion.save()
        return cita, sesion

    def _a_hifu(self, sesiones, asignaciones=(), confirmar=True):
        datos = {
            "clinica": str(self.clinica.id), "item": str(self.item.id), "sesiones": sesiones,
            "tratamiento": {"tipo": "tratamiento", "tratamiento": str(self.correcto.id)},
            "asignaciones": [{"cita": str(c.id), "sesion": clave} for c, clave in asignaciones],
        }
        if not confirmar:
            return self.client.post(f"{BASE}/sesiones-previas/previsualizar/", datos, format="json")
        return self.client.post(f"{BASE}/sesiones-previas/corregir/", {**datos, "motivo": "Era HIFU, no RF"}, format="json")

    def test_la_carga_con_atencion_permite_cambiar_el_tratamiento(self):
        self._atencion_en_rf4()
        [carga] = self._cargas()
        self.assertIsNotNone(carga["bloqueo"])
        self.assertIsNone(carga["bloqueo_tratamiento"])
        [atencion] = carga["atenciones"]
        self.assertEqual((atencion["sesion"]["nombre"], atencion["sesion"]["numero"]), ("RF", 4))

    def test_la_atencion_pasa_a_la_sesion_elegida_y_conserva_lo_registrado(self):
        cita, sesion = self._atencion_en_rf4()
        r = self._a_hifu(2, [(cita, self._ranura(3))])
        self.assertEqual(r.status_code, 201, r.content)

        sesion.refresh_from_db()
        nuevo = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(sesion.tratamiento_id, nuevo.id)
        self.assertEqual((sesion.tipo_sesion.nombre, sesion.numero), ("HIFU", 3))
        self.assertEqual((sesion.cita_id, sesion.estado, sesion.profesional_id),
                         (cita.id, SesionProcedimiento.Estado.COMPLETADO, self.profesional.id))
        protocolo = [
            (s.numero, s.estado, s.cita_id is not None)
            for s in nuevo.sesiones.order_by("numero")
        ]
        self.assertEqual(protocolo, [
            (1, "completado", False), (2, "completado", False), (3, "completado", True), (4, "pendiente", False),
        ])
        self.item.refresh_from_db()
        self.assertEqual(self.item.citas_restantes(), 1)
        correccion = CorreccionSoporte.objects.get()
        [movida] = correccion.resumen["atenciones_movidas"]
        self.assertEqual((movida["de"], movida["a"]), ("RF #4", "HIFU #3"))

    def test_la_vista_previa_muestra_cada_sesion_y_no_cambia_nada(self):
        cita, sesion = self._atencion_en_rf4()
        r = self._a_hifu(2, [(cita, self._ranura(4))], confirmar=False)
        self.assertEqual(r.status_code, 200, r.content)
        filas = [(f["nombre"], f["numero"], f["origen"]) for f in r.json()["protocolo"]]
        self.assertEqual(filas, [
            ("HIFU", 1, "previa"), ("HIFU", 2, "previa"), ("HIFU", 3, "pendiente"), ("HIFU", 4, "atencion"),
        ])
        self.assertEqual(r.json()["protocolo"][3]["atencion"]["cita_id"], str(cita.id))

        self.item.refresh_from_db()
        self.assertEqual(self.item.descripcion, "RF x6")
        sesion.refresh_from_db()
        self.assertEqual(sesion.tipo_sesion.nombre, "RF")
        self.assertFalse(CorreccionSoporte.objects.exists())

    def test_una_cita_agendada_tambien_se_asigna(self):
        cita, sesion = self._atencion_en_rf4(Cita.Estado.PENDIENTE)
        self.assertEqual(self._a_hifu(2).json()["code"], "ASIGNACIONES_INCOMPLETAS")
        self.assertEqual(self._a_hifu(2, [(cita, self._ranura(3))]).status_code, 201)
        sesion.refresh_from_db()
        self.assertEqual((sesion.numero, sesion.estado, sesion.cita_id), (3, "pendiente", cita.id))

    def test_una_atencion_sin_sesion_marca_la_elegida(self):
        cita = self._cita_en_app(Cita.Estado.COMPLETADA)
        self.assertEqual(self._a_hifu(1, [(cita, self._ranura(2))]).status_code, 201)
        destino = SesionProcedimiento.objects.get(tratamiento__cotizacion_item=self.item, numero=2)
        self.assertEqual((destino.cita_id, destino.estado, destino.profesional_id),
                         (cita.id, SesionProcedimiento.Estado.COMPLETADO, self.profesional.id))

    def test_dos_atenciones_no_van_a_la_misma_sesion(self):
        cita, _ = self._atencion_en_rf4()
        otra = self._cita_en_app(Cita.Estado.COMPLETADA)
        r = self._a_hifu(1, [(cita, self._ranura(3)), (otra, self._ranura(3))])
        self.assertEqual(r.json()["code"], "SESION_REPETIDA")

    def test_la_sesion_elegida_debe_ser_del_tratamiento_nuevo(self):
        cita, sesion = self._atencion_en_rf4()
        r = self._a_hifu(2, [(cita, f"{sesion.tipo_sesion_id}:4")])
        self.assertEqual(r.json()["code"], "SESION_NO_ENCONTRADA")

    def test_previas_y_atenciones_no_pasan_del_total(self):
        cita, _ = self._atencion_en_rf4()
        r = self._a_hifu(4, [(cita, self._ranura(4))])
        self.assertEqual(r.json()["code"], "SESIONES_SOBRE_MAXIMO")
        self.item.refresh_from_db()
        self.assertEqual(self.item.descripcion, "RF x6")

    def test_con_atenciones_no_se_cambia_a_libre(self):
        cita, _ = self._atencion_en_rf4()
        r = self._corregir(1, tratamiento={"tipo": "libre", "descripcion": "Láser", "num_sesiones_total": 8},
                           asignaciones=[{"cita": str(cita.id), "sesion": self._ranura(1)}])
        self.assertEqual(r.json()["code"], "ATENCIONES_REQUIEREN_CATALOGO")

    def test_tratamiento_de_otra_clinica(self):
        otra = Clinica.objects.create(nombre="Otra", nit="901000998")
        ajeno = TratamientoCatalogo.objects.create(clinica=otra, nombre="Ajeno")
        r = self._corregir(2, tratamiento={"tipo": "tratamiento", "tratamiento": str(ajeno.id)})
        self.assertEqual(r.json()["code"], "TRATAMIENTO_NO_ENCONTRADO")

    # ── Marcar las previas una a una (no siempre se hicieron en orden) ─────

    def _sesion_rf(self, numero):
        return SesionProcedimiento.objects.get(tratamiento__cotizacion_item=self.item, numero=numero)

    def _hechas(self):
        return sorted(
            SesionProcedimiento.objects.filter(
                tratamiento__cotizacion_item=self.item, estado=SesionProcedimiento.Estado.COMPLETADO,
            ).values_list("numero", flat=True)
        )

    def test_marca_las_previas_elegidas_aunque_no_sean_seguidas(self):
        elegidas = [str(self._sesion_rf(n).id) for n in (1, 3, 5)]
        r = self._corregir(3, previas=elegidas)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self._hechas(), [1, 3, 5])
        self.assertEqual(self._sesion_rf(2).observaciones, "")

    def test_las_marcadas_deben_cuadrar_con_el_numero(self):
        r = self._corregir(3, previas=[str(self._sesion_rf(1).id)])
        self.assertEqual(r.json()["code"], "PREVIAS_NO_CUADRAN")

    def test_con_otro_tratamiento_marca_las_previas_elegidas(self):
        cita, _ = self._atencion_en_rf4()
        datos = {
            "clinica": str(self.clinica.id), "item": str(self.item.id), "sesiones": 2,
            "tratamiento": {"tipo": "tratamiento", "tratamiento": str(self.correcto.id)},
            "asignaciones": [{"cita": str(cita.id), "sesion": self._ranura(3)}],
            "previas": [self._ranura(1), self._ranura(4)],
        }
        r = self.client.post(f"{BASE}/sesiones-previas/previsualizar/", datos, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(
            [f["origen"] for f in r.json()["protocolo"]], ["previa", "pendiente", "atencion", "previa"],
        )
        r = self.client.post(f"{BASE}/sesiones-previas/corregir/", {**datos, "motivo": "Era HIFU, no RF"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self._hechas(), [1, 3, 4])

    def test_una_previa_no_puede_ir_en_la_sesion_de_una_atencion(self):
        cita, _ = self._atencion_en_rf4()
        r = self.client.post(f"{BASE}/sesiones-previas/corregir/", {
            "clinica": str(self.clinica.id), "item": str(self.item.id), "sesiones": 1,
            "tratamiento": {"tipo": "tratamiento", "tratamiento": str(self.correcto.id)},
            "asignaciones": [{"cita": str(cita.id), "sesion": self._ranura(3)}],
            "previas": [self._ranura(3)], "motivo": "Era HIFU, no RF",
        }, format="json")
        self.assertEqual(r.json()["code"], "PREVIA_NO_ENCONTRADA")
