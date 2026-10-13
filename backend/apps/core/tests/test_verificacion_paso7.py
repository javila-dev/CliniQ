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
