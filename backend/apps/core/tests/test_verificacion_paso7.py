"""Regresiones del paso 7 de la verificación transversal (lo restante, por severidad)."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cartera.models import Cartera
from apps.clinicas.models import PrecioSede, Sede, ServicioConsentimiento
from apps.colaboradores.models import Colaborador
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.core.models import LogAccion
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.registro_publico import (
    RegistroPublicoConsultaThrottle,
    RegistroPublicoFotoThrottle,
    RegistroPublicoThrottle,
)
from apps.users.models import Permiso, Rol, RolPermiso
from apps.users.serializers import build_auth_user_payload


class VerificacionPaso7AltosTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.sede_b = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota",
            direccion="Calle 20", telefono="3000000001", horario={},
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _recepcion_de_la_sede_a(self):
        recep = User.objects.create_user(
            email="recep@test.com", password="Secret123!", first_name="Rita", last_name="Recepcion",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        colab = Colaborador.objects.create(
            user=recep, sede_principal=self.sede, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=timezone.localdate(), numero_documento="900900900",
        )
        colab.sedes.set([self.sede])
        self.client.force_authenticate(recep)
        return recep

    def _cotizacion(self, sede):
        return Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=sede,
            estado=Cotizacion.Estado.BORRADOR,
        )

    # ── M0-13: el login trae lo mismo que /auth/me/ ────────────────────────
    def test_m013_el_login_trae_telefono_y_firma(self):
        self.admin.telefono = "3001234567"
        self.admin.save(update_fields=["telefono"])
        datos = build_auth_user_payload(self.admin)
        self.assertEqual(datos["telefono"], "3001234567")
        for campo in ("firma_digital_url", "registro_profesional", "created_at", "permissions", "sedes"):
            self.assertIn(campo, datos)
        self.assertEqual(datos["id"], str(self.admin.id))

    # ── M1-03: la clínica en prueba ve los días que le quedan ──────────────
    def test_m103_mi_clinica_trae_los_dias_de_prueba(self):
        self.clinica.trial_expires_at = timezone.now() + timedelta(days=5, hours=3)
        self.clinica.save(update_fields=["trial_expires_at"])
        datos = self.client.get("/api/v1/clinicas/mi-clinica/").json()
        self.assertEqual(datos["trial_days_remaining"], 6)
        self.assertIn("plan_nombre", datos)

    def test_m103_el_ultimo_dia_no_figura_como_vencido(self):
        self.clinica.trial_expires_at = timezone.now() + timedelta(hours=10)
        self.clinica.save(update_fields=["trial_expires_at"])
        self.assertEqual(self.client.get("/api/v1/clinicas/mi-clinica/").json()["trial_days_remaining"], 1)

    # ── M1-04: el precio de una sede desactivada no bloquea el guardado ────
    def test_m104_se_guarda_el_procedimiento_con_precio_de_una_sede_inactiva(self):
        PrecioSede.objects.create(sede=self.sede_b, procedimiento=self.servicio, precio=Decimal("200000"))
        self.sede_b.activo = False
        self.sede_b.save(update_fields=["activo"])
        response = self.client.patch(f"/api/v1/clinicas/servicios/{self.servicio.id}/", {
            "nombre": "Procedimiento base editado",
            "precios_sede": [{"sede": str(self.sede_b.id), "precio": "200000"}],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(PrecioSede.objects.filter(sede=self.sede_b, procedimiento=self.servicio).exists())

    # ── M1-05: borrar una plantilla deja de exigirla ───────────────────────
    def test_m105_borrar_una_plantilla_la_quita_de_los_procedimientos(self):
        plantilla = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Toxina", template_token="tok-1",
        )
        relacion = ServicioConsentimiento.objects.create(servicio=self.servicio, template=plantilla)
        response = self.client.delete(f"/api/v1/configuracion/plantillas-consentimiento/{plantilla.id}/")
        self.assertEqual(response.status_code, 204, response.content)
        relacion.refresh_from_db()
        self.assertFalse(relacion.activo)

    # ── M2-06: el autorregistro tiene cupo propio por vista ────────────────
    def test_m206_cada_vista_del_autorregistro_tiene_su_limite(self):
        claves = {RegistroPublicoThrottle.alcance, RegistroPublicoConsultaThrottle.alcance, RegistroPublicoFotoThrottle.alcance}
        self.assertEqual(len(claves), 3)
        self.assertEqual(RegistroPublicoConsultaThrottle.rate, "300/hour")
        self.assertEqual(RegistroPublicoThrottle.rate, "60/hour")

    # ── M5-01: cotizaciones por sede ───────────────────────────────────────
    def test_m501_recepcion_no_ve_ni_edita_cotizaciones_de_otra_sede(self):
        propia = self._cotizacion(self.sede)
        ajena = self._cotizacion(self.sede_b)
        self._recepcion_de_la_sede_a()
        ids = [c["id"] for c in self.client.get("/api/v1/cotizaciones/").json()["results"]]
        self.assertIn(str(propia.id), ids)
        self.assertNotIn(str(ajena.id), ids)
        response = self.client.patch(f"/api/v1/cotizaciones/{ajena.id}/", {"notas": "x"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_m501_la_ficha_del_paciente_ve_todas_sus_cotizaciones(self):
        ajena = self._cotizacion(self.sede_b)
        self._recepcion_de_la_sede_a()
        response = self.client.get("/api/v1/cotizaciones/", {"paciente": str(self.paciente.id)})
        self.assertIn(str(ajena.id), [c["id"] for c in response.json()["results"]])

    # ── M6-10: cartera por sede ────────────────────────────────────────────
    def test_m610_recepcion_solo_ve_la_cartera_de_su_sede(self):
        propia = Cartera.objects.create(cotizacion=self._cotizacion(self.sede), paciente=self.paciente, total=Decimal("100"))
        ajena = Cartera.objects.create(cotizacion=self._cotizacion(self.sede_b), paciente=self.paciente, total=Decimal("200"))
        self._recepcion_de_la_sede_a()
        ids = [c["id"] for c in self.client.get("/api/v1/cartera/").json()["results"]]
        self.assertIn(str(propia.id), ids)
        self.assertNotIn(str(ajena.id), ids)
        self.assertEqual(self.client.get(f"/api/v1/cartera/{ajena.id}/").status_code, 404)


class VerificacionPaso7MediosM0Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    # ── M0-11: filtro de usuario en el log por nombre ──────────────────────
    def test_m011_el_log_se_filtra_por_nombre_de_usuario(self):
        LogAccion.objects.create(clinica=self.clinica, usuario=self.admin, accion="x", objeto_tipo="t", objeto_id="1")
        LogAccion.objects.create(clinica=self.clinica, usuario=self.profesional, accion="y", objeto_tipo="t", objeto_id="2")
        response = self.client.get("/api/v1/core/log-acciones/", {"usuario": "ana prof"})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([r["accion"] for r in response.json()["results"]], ["y"])
        self.assertEqual(self.client.get("/api/v1/core/log-acciones/", {"fecha_desde": "ayer"}).status_code, 400)

    # ── M0-16: crear roles ─────────────────────────────────────────────────
    def test_m016_un_nombre_repetido_se_explica_en_el_campo(self):
        Rol.objects.create(clinica=self.clinica, slug="recepcion_x", nombre="Recepción")
        response = self.client.post("/api/v1/usuarios/roles/", {"nombre": "recepcion"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Ya existe un rol", str(response.json()["nombre"]))

    def test_m016_el_rol_se_crea_con_sus_permisos_y_slug_propio(self):
        Rol.objects.create(clinica=self.clinica, slug="auxiliar", nombre="Otro nombre")
        response = self.client.post("/api/v1/usuarios/roles/", {
            "nombre": "Auxiliar", "permission_keys": ["agenda.citas.ver"],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["slug"], "auxiliar_2")
        self.assertEqual(response.json()["permission_keys"], ["agenda.citas.ver"])

    def test_m016_permisos_invalidos_no_dejan_un_rol_vacio(self):
        response = self.client.post("/api/v1/usuarios/roles/", {
            "nombre": "Auxiliar", "permission_keys": ["no.existe"],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Rol.objects.filter(clinica=self.clinica, nombre="Auxiliar").exists())


class VerificacionPaso7MediosM1Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    # ── M1-15: "Mostrar inactivas" en plantillas de órdenes ────────────────
    def test_m115_las_plantillas_inactivas_se_pueden_listar(self):
        from apps.historia_clinica.models import PlantillaOrden

        inactiva = PlantillaOrden.objects.create(clinica=self.clinica, nombre="Vieja", contenido="x", activa=False)
        url = "/api/v1/historia-clinica/plantillas-ordenes/"
        ids = lambda r: [p["id"] for p in (r.json() if isinstance(r.json(), list) else r.json()["results"])]  # noqa: E731
        self.assertNotIn(str(inactiva.id), ids(self.client.get(url)))
        self.assertIn(str(inactiva.id), ids(self.client.get(url, {"activa": "todas"})))

    # ── M1-16: promoción e ítems en una sola operación ─────────────────────
    def _promo(self, items):
        hoy = timezone.localdate()
        return self.client.post("/api/v1/clinicas/campanas/", {
            "nombre": "Octubre", "fecha_inicio": hoy.isoformat(),
            "fecha_fin": (hoy + timedelta(days=10)).isoformat(), "items": items,
        }, format="json")

    def test_m116_un_item_invalido_no_deja_la_promocion_creada(self):
        from apps.clinicas.models import Campana

        response = self._promo([{"procedimiento": str(self.servicio.id), "descuento_pct": "150"}])
        self.assertEqual(response.status_code, 400)
        self.assertIn("Ítem 1", str(response.json()["items"]))
        self.assertFalse(Campana.objects.filter(clinica=self.clinica).exists())

    def test_m116_la_promocion_se_crea_con_sus_items(self):
        response = self._promo([{"procedimiento": str(self.servicio.id), "precio_campana": "90000"}])
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(len(response.json()["items"]), 1)


class VerificacionPaso7MediosM2Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    # ── M2-08: borrar un dato opcional al editar ───────────────────────────
    def test_m208_borrar_el_correo_y_la_eps_se_guarda(self):
        self.paciente.email = "viejo@example.com"
        self.paciente.eps = "Sura"
        self.paciente.save(update_fields=["email", "eps"])
        response = self.client.patch(f"/api/v1/pacientes/{self.paciente.id}/", {"email": "", "eps": ""}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.paciente.refresh_from_db()
        self.assertEqual((self.paciente.email, self.paciente.eps), ("", ""))

    # ── M2-09: totales de Ingresos del paciente ────────────────────────────
    def test_m209_el_resumen_de_ingresos_se_filtra_por_paciente(self):
        response = self.client.get("/api/v1/cobros/cobros/resumen/", {"paciente": str(self.paciente.id)})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.client.get("/api/v1/cobros/cobros/resumen/", {"paciente": "x"}).status_code, 400)

    # ── M2-13: consentimientos manuales ────────────────────────────────────
    def test_m213_solo_ver_pacientes_no_registra_consentimientos(self):
        rol = Rol.objects.create(clinica=self.clinica, slug="solo_ver", nombre="Solo ver")
        RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave="pacientes.ver"))
        usuario = User.objects.create_user(
            email="ver@test.com", password="Secret123!", first_name="Ve", last_name="R",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(usuario)
        url = f"/api/v1/pacientes/{self.paciente.id}/consentimientos/"
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 403)

    def test_m213_el_pdf_del_consentimiento_debe_ser_pdf(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.exceptions import ValidationError

        from apps.pacientes.views import validar_archivo_pdf

        with self.assertRaises(ValidationError):
            validar_archivo_pdf(SimpleUploadedFile("firma.pdf", b"<html>no</html>", content_type="application/pdf"))
        validar_archivo_pdf(SimpleUploadedFile("firma.pdf", b"%PDF-1.7 ...", content_type="application/pdf"))

    # ── M2-16: revertir una carga con movimientos posteriores ──────────────
    def test_m216_revertir_con_pagos_posteriores_se_explica(self):
        from apps.clinicas.models import FormaDePago
        from apps.cobros.models import Cobro, PagoRecibido
        from apps.migracion.models import LoteMigracion

        self.clinica.modo_puesta_en_marcha = True
        self.clinica.save(update_fields=["modo_puesta_en_marcha"])
        cobro = Cobro.objects.create(
            origen=Cobro.Origen.LIBRE, paciente=self.paciente, profesional=self.admin, sede=self.sede,
            created_by=self.admin, total="100.00", subtotal="100.00",
        )
        PagoRecibido.objects.create(
            cobro=cobro, medio_pago=FormaDePago.objects.filter(clinica=self.clinica).first(),
            valor="50.00", recibido_por=self.admin,
        )
        lote = LoteMigracion.objects.create(
            clinica=self.clinica, paciente=self.paciente, tipo=LoteMigracion.Tipo.PACIENTE_EN_CURSO,
            creado_por=self.admin, manifest={"cobros": [str(cobro.id)], "pagos": []},
        )
        response = self.client.post(f"/api/v1/migracion/lotes/{lote.id}/revertir/")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["code"], "LOTE_CON_MOVIMIENTOS")
        self.assertTrue(Cobro.objects.filter(id=cobro.id).exists())


class VerificacionPaso7MediosM4Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        from apps.historia_clinica.models import HistoriaClinica, NotaClinica

        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica, es_profesional=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        historia, _ = HistoriaClinica.objects.get_or_create(paciente=self.paciente, defaults={"clinica": self.clinica})
        inicio = self.proximo_dia_habil_10am()
        from apps.agenda.models import Cita

        self.cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.admin,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), duracion_min=30,
            estado=Cita.Estado.EN_CURSO, canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.nota = NotaClinica.objects.create(historia=historia, cita=self.cita)

    # ── M4-11: tipo y tamaño de las fotos clínicas ─────────────────────────
    def test_m411_solo_se_suben_imagenes(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        archivo = SimpleUploadedFile("virus.exe", b"MZ...", content_type="application/octet-stream")
        response = self.client.post("/api/v1/historia-clinica/fotos/", {
            "nota": str(self.nota.id), "tipo": "antes", "archivo": archivo,
        }, format="multipart")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("archivo", response.json())

    # ── M4-16: cancelar una atención iniciada devuelve los insumos ─────────
    def test_m416_cancelar_una_atencion_iniciada_devuelve_el_stock(self):
        from apps.historia_clinica.services import registrar_consumo_insumo
        from apps.inventario.models import Insumo, StockInsumoSede
        from apps.inventario.services import registrar_ajuste

        insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gasa", unidad_medida="unidad")
        registrar_ajuste(insumo=insumo, sede=self.sede, cantidad_nueva=Decimal("10"), user=self.admin, motivo="Inicial")
        registrar_consumo_insumo(nota=self.nota, insumo=insumo, cantidad=Decimal("3"), user=self.admin, sede=self.sede)
        self.assertEqual(StockInsumoSede.objects.get(insumo=insumo, sede=self.sede).stock_actual, Decimal("7"))
        response = self.client.post(
            f"/api/v1/agenda/citas/{self.cita.id}/cambiar_estado/",
            {"estado": "cancelada", "motivo_cancelacion": "El paciente se sintió mal"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(StockInsumoSede.objects.get(insumo=insumo, sede=self.sede).stock_actual, Decimal("10"))

    # ── M4-18: rechazo del consentimiento desde el enlace ──────────────────
    def test_m418_verificar_firma_avisa_si_el_paciente_rechazo(self):
        from unittest.mock import patch

        from apps.historia_clinica.models import ConsentimientoInformado

        consentimiento = ConsentimientoInformado.objects.create(
            clinica=self.clinica, paciente=self.paciente, tipo=ConsentimientoInformado.TipoConsentimiento.choices[0][0],
            documenso_document_id="envelope_9",
        )
        envelope = {"status": "PENDING", "recipients": [{"signingStatus": "REJECTED", "rejectionReason": "No"}]}
        with patch("apps.historia_clinica.services._fetch_documenso_json", return_value=envelope), \
                patch("apps.historia_clinica.documenso_firmantes.resolver_envelope_id", return_value="envelope_9"):
            response = self.client.post(f"/api/v1/historia-clinica/consentimientos/{consentimiento.id}/verificar_firma/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["rechazado"])
        self.assertFalse(response.json()["firmado"])


class VerificacionPaso7MediosM5Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _cotizacion(self, *, total="100000.00", plan=("100000.00",)):
        from apps.clinicas.models import FormaDePago

        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=self.sede,
            estado=Cotizacion.Estado.BORRADOR,
        )
        cotizacion.items.create(descripcion="Sesión", num_citas=1, valor_unitario=total, descuento_porcentaje="0.00")
        forma = FormaDePago.objects.filter(clinica=self.clinica).first()
        for n, valor in enumerate(plan, start=1):
            cotizacion.formas_pago.create(tipo=forma, descripcion=f"Cuota {n}", valor=valor)
        return cotizacion

    # ── M5-08: teléfono y correo del paciente para "Enviar" ────────────────
    def test_m508_la_cotizacion_trae_el_contacto_del_paciente(self):
        self.paciente.email = "juan@example.com"
        self.paciente.save(update_fields=["email"])
        datos = self.client.get(f"/api/v1/cotizaciones/{self._cotizacion().id}/").json()
        self.assertEqual(datos["paciente_email"], "juan@example.com")
        self.assertEqual(datos["paciente_telefono"], self.paciente.telefono)

    # ── M5-14: aceptar dos veces no duplica la cartera ─────────────────────
    def test_m514_aceptar_dos_veces_no_duplica_cuotas(self):
        from apps.cartera.models import CuotaCartera
        from apps.cotizaciones.services import aceptar_cotizacion

        cotizacion = self._cotizacion(plan=("50000.00", "50000.00"))
        aceptar_cotizacion(cotizacion, actor=self.admin)
        aceptar_cotizacion(Cotizacion.objects.get(pk=cotizacion.pk), actor=self.admin)
        self.assertEqual(CuotaCartera.objects.filter(cartera__cotizacion=cotizacion).count(), 2)

    # ── M5-16: la firma no acepta un plan de pagos que no cuadra ───────────
    def test_m516_firmar_con_un_plan_que_no_suma_no_acepta_la_venta(self):
        from apps.configuracion.models import ConfiguracionCartera
        from apps.consentimientos.models import Consentimiento
        from apps.cotizaciones.services import aceptar_cotizacion_por_firma_compromiso

        ConfiguracionCartera.objects.update_or_create(
            clinica=self.clinica, defaults={"requiere_consentimiento_promocional": True},
        )
        cotizacion = self._cotizacion(plan=("40000.00",))
        compromiso = Consentimiento.objects.create(
            cotizacion=cotizacion, paciente=self.paciente, contenido_snapshot="x", hash_contenido="h",
            estado=Consentimiento.Estado.FIRMADO,
        )
        aceptar_cotizacion_por_firma_compromiso(compromiso)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.BORRADOR)


class VerificacionPaso7MediosM6Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        from apps.caja.models import Caja, CategoriaGasto
        from apps.clinicas.models import FormaDePago

        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.efectivo = FormaDePago.objects.filter(clinica=self.clinica, tipo_base="efectivo").first()
        self.tarjeta = FormaDePago.objects.filter(clinica=self.clinica).exclude(tipo_base="efectivo").first()
        self.categoria = CategoriaGasto.objects.create(clinica=self.clinica, nombre="Transporte")
        self.caja = Caja.objects.create(sede=self.sede, saldo_inicial=Decimal("100000"))

    def _cita(self):
        from apps.agenda.models import Cita

        inicio = timezone.now() + timedelta(hours=1)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional,
            servicio=self.servicio, servicio_nombre=self.servicio.nombre,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), duracion_min=30,
            estado=Cita.Estado.EN_ESPERA, canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )

    def _cobrar(self, cita, pagos, precio="200000"):
        return self.client.post("/api/v1/cobros/cobros/", {
            "cita": str(cita.id), "paciente": str(self.paciente.id), "sede": str(self.sede.id),
            "items": [{"tipo": "servicio", "servicio": str(self.servicio.id), "precio_unitario": precio, "cantidad": "1"}],
            "pagos": pagos,
        }, format="json")

    def _gasto(self, valor, descripcion="Taxi al banco"):
        return self.client.post("/api/v1/caja/gastos/", {
            "sede": str(self.sede.id), "categoria": str(self.categoria.id),
            "descripcion": descripcion, "valor": valor,
        }, format="json")

    # ── M6-13 / M6-14: cobro y pagos juntos, mixto o parcial ───────────────
    def test_m614_cobro_con_pago_mixto(self):
        from apps.cobros.models import Cobro

        cita = self._cita()
        response = self._cobrar(cita, [
            {"medio_pago": str(self.efectivo.id), "valor": "100000"},
            {"medio_pago": str(self.tarjeta.id), "valor": "100000"},
        ])
        self.assertEqual(response.status_code, 201, response.content)
        cobro = Cobro.objects.get(cita=cita)
        self.assertEqual(cobro.estado, Cobro.Estado.PAGADO)
        self.assertEqual(cobro.pagos.count(), 2)
        datos = self.client.get(f"/api/v1/agenda/citas/{cita.id}/").json()
        self.assertEqual(datos["cobro_estado"], "pagado")

    def test_m614_pago_parcial_deja_saldo(self):
        from apps.cobros.models import Cobro

        cita = self._cita()
        response = self._cobrar(cita, [{"medio_pago": str(self.efectivo.id), "valor": "50000"}])
        self.assertEqual(response.status_code, 201, response.content)
        cobro = Cobro.objects.get(cita=cita)
        self.assertEqual(cobro.estado, Cobro.Estado.PAGADO_PARCIAL)
        self.assertEqual(cobro.saldo_pendiente, Decimal("150000"))

    def test_m614_no_se_cobra_de_mas(self):
        from apps.cobros.models import Cobro

        cita = self._cita()
        response = self._cobrar(cita, [{"medio_pago": str(self.efectivo.id), "valor": "250000"}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PAGO_SUPERA_SALDO")
        self.assertFalse(Cobro.objects.filter(cita=cita).exists())

    def test_m613_si_un_pago_falla_no_queda_el_cobro_a_medias(self):
        from apps.cobros.models import Cobro

        cita = self._cita()
        response = self._cobrar(cita, [
            {"medio_pago": str(self.efectivo.id), "valor": "150000"},
            {"medio_pago": str(self.tarjeta.id), "valor": "100000"},
        ])
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Cobro.objects.filter(cita=cita).exists())
        datos = self.client.get(f"/api/v1/agenda/citas/{cita.id}/").json()
        self.assertIsNone(datos["cobro_estado"])

    def test_m613_reintento_paga_el_cobro_que_quedo_pendiente(self):
        from apps.cobros.models import Cobro

        cita = self._cita()
        self.assertEqual(self._cobrar(cita, []).status_code, 201)
        self.assertEqual(Cobro.objects.get(cita=cita).estado, Cobro.Estado.PENDIENTE)
        response = self._cobrar(cita, [{"medio_pago": str(self.efectivo.id), "valor": "200000"}])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(Cobro.objects.get(cita=cita).estado, Cobro.Estado.PAGADO)
        # Una vez pagado, otro intento no duplica pagos.
        otra = self._cobrar(cita, [{"medio_pago": str(self.efectivo.id), "valor": "200000"}])
        self.assertEqual(otra.status_code, 400)
        self.assertEqual(otra.json()["code"], "COBRO_YA_REGISTRADO")
        self.assertEqual(Cobro.objects.get(cita=cita).pagos.count(), 1)

    # ── M6-17: gastos y fondo de apertura negativos ────────────────────────
    def test_m617_gasto_en_cero_o_negativo_se_rechaza(self):
        self.client.post("/api/v1/caja/sesiones/abrir/", {"caja": str(self.caja.id)}, format="json")
        self.assertEqual(self._gasto("-5000").status_code, 400)
        self.assertEqual(self._gasto("0").status_code, 400)
        self.assertEqual(self._gasto("5000").status_code, 201)

    def test_m617_fondo_de_apertura_negativo_se_rechaza(self):
        response = self.client.post(
            "/api/v1/caja/sesiones/abrir/", {"caja": str(self.caja.id), "monto_apertura": "-100"}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    # ── M6-21: buscar en egresos ───────────────────────────────────────────
    def test_m621_buscar_gasto_por_descripcion(self):
        self.client.post("/api/v1/caja/sesiones/abrir/", {"caja": str(self.caja.id)}, format="json")
        self._gasto("5000", "Taxi al banco")
        self._gasto("8000", "Papelería")
        datos = self.client.get("/api/v1/caja/gastos/", {"search": "taxi"}).json()
        self.assertEqual([g["descripcion"] for g in datos["results"]], ["Taxi al banco"])

    # ── M6-22: cuotas vencidas desde el servidor ───────────────────────────
    def test_m622_cuotas_vencidas_no_incluye_la_de_hoy(self):
        from apps.cartera.models import CuotaCartera

        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        cartera = Cartera.objects.create(cotizacion=cotizacion, paciente=self.paciente, total="300000.00")
        hoy = timezone.localdate()
        for dias, valor in ((-10, "100000.00"), (0, "100000.00"), (10, "100000.00")):
            CuotaCartera.objects.create(
                cartera=cartera, tipo=self.efectivo, valor_esperado=valor,
                fecha_esperada=hoy + timedelta(days=dias),
            )
        response = self.client.get("/api/v1/cartera/cuotas-vencidas/")
        self.assertEqual(response.status_code, 200, response.content)
        datos = response.json()
        self.assertEqual(len(datos), 1)
        self.assertEqual(datos[0]["dias_vencida"], 10)
        self.assertEqual(datos[0]["numero_cuota"], 1)
        self.assertEqual(datos[0]["total_cuotas"], 3)
        self.assertEqual(datos[0]["tipo"], self.efectivo.nombre)
        self.assertEqual(self.client.get("/api/v1/cartera/cuotas-vencidas/", {"desde": "mal"}).status_code, 400)


class VerificacionPaso7MediosM7Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _con_rol(self, claves, email="custom@test.com"):
        rol = Rol.objects.create(clinica=self.clinica, slug=email.split("@")[0], nombre=email)
        for clave in claves:
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        usuario = User.objects.create_user(
            email=email, password="Secret123!", first_name="Cu", last_name="Stom",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(usuario)
        return usuario

    # ── M7-10: envíos fallidos con permiso y teléfono enmascarado ──────────
    def test_m710_envios_fallidos_piden_permiso_y_enmascaran_el_telefono(self):
        from apps.notificaciones.models import NotificacionFallida

        fallida = NotificacionFallida.objects.create(
            clinica=self.clinica, paciente=self.paciente, tipo_notificacion="recordatorio_cita",
            telefono="3001234567", motivo="Número inválido",
        )
        url = "/api/v1/notificaciones/fallidas/"
        self.assertEqual(self.client.get(url).json()["results"][0]["telefono"], "3001234567")

        self._con_rol(["inventario.ver"], email="sinpacientes@test.com")
        self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.post(f"{url}{fallida.id}/resolver/").status_code, 403)

        self._con_rol(["pacientes.ver"], email="conpacientes@test.com")
        self.assertEqual(self.client.get(url).json()["results"][0]["telefono"], "••••••4567")

    # ── M7-12: la dueña que no creó la contraseña no queda bloqueada ───────
    def _registro_confirmado(self):
        from apps.clinicas.models import RegistroPendiente
        from apps.clinicas.services import confirmar_registro_clinica

        registro = RegistroPendiente.create(
            nombre_clinica="Clínica Nueva", nit="900111222", nombre_admin="Laura", apellido_admin="Díaz",
            email="laura@nueva.com", telefono="3009998877",
        )
        primer_token = confirmar_registro_clinica(registro.token)
        return registro, primer_token

    def test_m712_volver_a_abrir_la_verificacion_reemite_la_invitacion(self):
        from apps.clinicas.services import confirmar_registro_clinica

        registro, primer_token = self._registro_confirmado()
        segundo_token = confirmar_registro_clinica(registro.token)
        self.assertTrue(segundo_token)
        self.assertNotEqual(primer_token, segundo_token)

        # Si ya creó la contraseña, el enlace usado ya no sirve.
        admin = User.objects.get(email="laura@nueva.com")
        admin.set_password("Secret123!")
        admin.activo = True
        admin.save()
        with self.assertRaises(ValueError):
            confirmar_registro_clinica(registro.token)

    def test_m712_olvide_mi_contrasena_reenvia_la_invitacion_pendiente(self):
        from unittest.mock import patch

        from apps.users.services import request_password_reset

        self._registro_confirmado()
        with patch("apps.users.services.send_invitation_email") as invitacion, \
                patch("apps.users.services.send_password_reset_email") as reset:
            request_password_reset("laura@nueva.com")
        invitacion.assert_called_once()
        reset.assert_not_called()

    # ── M7-14: filtro de activas en la consola ─────────────────────────────
    def test_m714_consola_filtra_clinicas_inactivas(self):
        from apps.clinicas.models import Clinica

        Clinica.objects.create(nombre="Cerrada", nit="800000001", activo=False)
        superadmin = User.objects.create_user(
            email="root@test.com", password="Secret123!", first_name="Ro", last_name="Ot",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(superadmin)
        nombres = [c["nombre"] for c in self.client.get("/api/v1/admin/tenants/", {"activo": "false"}).json()["results"]]
        self.assertEqual(nombres, ["Cerrada"])

    # ── M7-16: WhatsApp a un paciente sin teléfono ─────────────────────────
    def test_m716_cotizacion_sin_telefono_no_se_envia(self):
        from apps.cotizaciones.models import CotizacionEnvio

        self.paciente.telefono = ""
        self.paciente.save(update_fields=["telefono"])
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=self.sede,
            estado=Cotizacion.Estado.BORRADOR,
        )
        response = self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/enviar_whatsapp/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PACIENTE_SIN_TELEFONO")
        self.assertFalse(CotizacionEnvio.objects.filter(cotizacion=cotizacion).exists())

    def test_m716_el_servicio_no_envia_ni_cobra_cupo_sin_telefono(self):
        from apps.notificaciones.models import EnvioWhatsApp
        from apps.notificaciones.services import WhatsAppNoDisponibleError, enviar_whatsapp

        self.paciente.telefono = ""
        with self.assertRaises(WhatsAppNoDisponibleError) as ctx:
            enviar_whatsapp(tipo=EnvioWhatsApp.Tipo.ENVIO_FORMULA, paciente=self.paciente, clinica=self.clinica)
        self.assertEqual(ctx.exception.code, "PACIENTE_SIN_TELEFONO")
        self.assertFalse(EnvioWhatsApp.objects.exists())

    # ── M7-17: el PDF de WhatsApp va al bucket privado con enlace temporal ─
    def test_m717_pdf_de_whatsapp_privado_con_enlace_temporal(self):
        from unittest.mock import patch

        from apps.notificaciones.services import WHATSAPP_PDF_URL_TTL_SEGUNDOS, subir_pdf_whatsapp

        with patch("apps.notificaciones.services.upload_private_file") as subir, \
                patch("apps.notificaciones.services.get_signed_url", return_value="https://firmada") as firmar:
            url = subir_pdf_whatsapp(b"%PDF-1.4", "cotizacion.pdf")
        self.assertEqual(url, "https://firmada")
        subir.assert_called_once()
        self.assertEqual(firmar.call_args.kwargs["expires_in"], WHATSAPP_PDF_URL_TTL_SEGUNDOS)

    # ── Categorías de insumos fuera de la UI (decisión del usuario) ────────
    def test_roles_no_ofrecen_el_permiso_de_categorias_de_insumos(self):
        from apps.users.rbac import ensure_default_roles_for_clinica

        ensure_default_roles_for_clinica(self.clinica)  # carga el catálogo completo de permisos
        datos = self.client.get("/api/v1/usuarios/capacidades/").json()
        capacidades = [p for a in datos["areas"] for c in a["capacidades"] for p in c["permisos"]]
        tecnicos = [p["clave"] for m in datos["permisos_tecnicos"] for p in m["permisos"]]
        catalogo = [p["clave"] for m in self.client.get("/api/v1/usuarios/permisos/").json() for p in m["permisos"]]
        self.assertTrue(Permiso.objects.filter(clave="inventario.categorias.gestionar", activo=True).exists())
        for lista in (capacidades, tecnicos, catalogo):
            self.assertTrue(lista)
            self.assertNotIn("inventario.categorias.gestionar", lista)

    # ── M7-07: lo que pide la nueva pantalla de inventario y compras ───────
    def test_m707_categoria_repetida_da_400_y_se_filtra_por_activo(self):
        url = "/api/v1/inventario/categorias/"
        self.assertEqual(self.client.post(url, {"nombre": "Jeringas"}, format="json").status_code, 201)
        repetida = self.client.post(url, {"nombre": "jeringas "}, format="json")
        self.assertEqual(repetida.status_code, 400)
        self.assertIn("nombre", repetida.json())
        otra = self.client.post(url, {"nombre": "Guantes"}, format="json").json()
        self.client.patch(f"{url}{otra['id']}/", {"activo": False}, format="json")
        activas = [c["nombre"] for c in self.client.get(url, {"activo": "true"}).json()["results"]]
        self.assertEqual(activas, ["Jeringas"])

    def test_m707_solo_se_cancela_una_compra_sin_recibir(self):
        from apps.proveedores.models import OrdenCompra, Proveedor

        proveedor = Proveedor.objects.create(
            clinica=self.clinica, nombre="Dist", nit="900", telefono="3000000000",
            categoria=Proveedor.Categoria.OTRO,
        )

        def orden(estado):
            return OrdenCompra.objects.create(
                proveedor=proveedor, sede=self.sede, fecha=timezone.localdate(), estado=estado,
                numero_factura_proveedor="F-1", created_by=self.admin,
            )

        recibida = orden(OrdenCompra.Estado.RECIBIDA_TOTAL)
        response = self.client.delete(f"/api/v1/proveedores/ordenes-compra/{recibida.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "ORDEN_NO_CANCELABLE")
        borrador = orden(OrdenCompra.Estado.BORRADOR)
        self.assertEqual(self.client.delete(f"/api/v1/proveedores/ordenes-compra/{borrador.id}/").status_code, 204)
        borrador.refresh_from_db()
        self.assertEqual(borrador.estado, OrdenCompra.Estado.CANCELADA)
