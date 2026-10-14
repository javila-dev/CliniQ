"""Regresiones del paso 7c de la verificación transversal (los bajos).

Los de M2 y M5 están en `test_verificacion_paso7.py` (clases `VerificacionPaso7c…`)."""

from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import BloqueoAgenda, Cita
from apps.cartera.models import Cartera, CuotaCartera
from apps.clinicas.models import FormaDePago, Plan, Sede
from apps.cobros.models import Cobro
from apps.consentimientos.models import Consentimiento
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.cotizaciones.models import Cotizacion


class VerificacionPaso7cTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _cita(self, inicio=None, minutos=30, **extra):
        inicio = inicio or (timezone.now() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional,
            servicio=self.servicio, servicio_nombre=self.servicio.nombre,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=minutos), duracion_min=minutos,
            estado=extra.pop("estado", Cita.Estado.PENDIENTE), canal_confirmacion=self.paciente.canal_confirmacion,
            canal_origen=Cita.CanalOrigen.PRESENCIAL, **extra,
        )

    # ── M0-19: los errores del perfil llegan por campo ─────────────────────
    def test_m019_perfil_devuelve_errores_por_campo(self):
        response = self.client.patch("/api/v1/auth/me/", {"first_name": "x" * 300}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("first_name", response.json())

    # ── M0-29: login a clínica inactiva no cierra la otra sesión ───────────
    def test_m029_login_con_clinica_inactiva_no_rota_la_sesion(self):
        self.admin.sesion_actual_id = "sesion-abierta"
        self.admin.save(update_fields=["sesion_actual_id"])
        self.clinica.activo = False
        self.clinica.save(update_fields=["activo"])
        response = APIClient().post(
            "/api/v1/auth/login/", {"email": "admin@test.com", "password": "Secret123!"}, format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.sesion_actual_id, "sesion-abierta")

    # ── M1-27: reactivar una sede respeta el límite del plan ───────────────
    def test_m127_reactivar_sede_respeta_el_limite_del_plan(self):
        plan = Plan.objects.create(nombre="Uno", max_usuarios=10, max_sedes=1, precio=0)
        self.clinica.plan = plan
        self.clinica.save(update_fields=["plan"])
        cerrada = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 2",
            telefono="3000000001", horario={}, activo=False,
        )
        response = self.client.patch(f"/api/v1/clinicas/sedes/{cerrada.id}/", {"activo": True}, format="json")
        self.assertEqual(response.status_code, 400)
        cerrada.refresh_from_db()
        self.assertFalse(cerrada.activo)

    # ── M3-28: un bloqueo de clínica se ve al filtrar por sede ─────────────
    def test_m328_bloqueo_de_clinica_aparece_al_filtrar_por_sede(self):
        inicio = timezone.now() + timedelta(days=2)
        BloqueoAgenda.objects.create(
            clinica=self.clinica, fecha_inicio=inicio, fecha_fin=inicio + timedelta(hours=2),
            motivo="Festivo", estado=BloqueoAgenda.Estado.APROBADO, creado_por=self.admin,
        )
        datos = self.client.get("/api/v1/agenda/bloqueos/", {"sede": str(self.sede.id)}).json()
        resultados = datos["results"] if isinstance(datos, dict) else datos
        self.assertEqual([b["motivo"] for b in resultados], ["Festivo"])

    # ── M3-29: borrar una cita con cobro responde 400 ──────────────────────
    def test_m329_borrar_cita_con_cobro_da_400(self):
        cita = self._cita()
        Cobro.objects.create(cita=cita, paciente=self.paciente, sede=self.sede, created_by=self.admin)
        response = self.client.delete(f"/api/v1/agenda/citas/{cita.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CITA_CON_REGISTROS")
        self.assertTrue(Cita.objects.filter(pk=cita.pk).exists())

    # ── M3-30: token fuera del listado y aviso de cruce del paciente ───────
    def test_m330_el_listado_no_expone_el_token_de_firma(self):
        cita = self._cita()
        Cita.objects.filter(pk=cita.pk).update(firma_asistencia_signing_token="secreto")
        listado = self.client.get("/api/v1/agenda/citas/").json()["results"]
        self.assertNotIn("firma_asistencia_signing_token", listado[0])
        detalle = self.client.get(f"/api/v1/agenda/citas/{cita.id}/").json()
        self.assertEqual(detalle["firma_asistencia_signing_token"], "secreto")

    def test_m330_paciente_con_otra_cita_avisa_y_se_puede_confirmar(self):
        from apps.agenda import services

        inicio = (timezone.now() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        self._cita(inicio=inicio)
        with self.assertRaises(Exception) as ctx:
            services.avisar_si_paciente_tiene_otra_cita(self.paciente, inicio, inicio + timedelta(minutes=30))
        self.assertEqual(ctx.exception.detail["code"], "PACIENTE_CON_OTRA_CITA")
        # Una cita cancelada no cuenta.
        Cita.objects.update(estado=Cita.Estado.CANCELADA)
        services.avisar_si_paciente_tiene_otra_cita(self.paciente, inicio, inicio + timedelta(minutes=30))

    # ── M4-24 / M4-25: consentimientos ─────────────────────────────────────
    def test_m424_generar_con_plantilla_inexistente_da_400(self):
        import uuid

        response = self.client.post(
            "/api/v1/consentimientos/generar/",
            {"plantilla_id": str(uuid.uuid4()), "cita_id": str(self._cita().id)}, format="json",
        )
        self.assertIn(response.status_code, (400, 404))
        self.assertNotEqual(response.status_code, 500)

    def _consentimiento(self, **extra):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=self.sede,
            estado=Cotizacion.Estado.BORRADOR,
        )
        return Consentimiento.objects.create(
            cotizacion=cotizacion, paciente=self.paciente, contenido_snapshot="x", hash_contenido="h", **extra,
        )

    def test_m425_la_pagina_publica_no_expone_ip_ni_navegador(self):
        consentimiento = self._consentimiento(
            estado=Consentimiento.Estado.FIRMADO, token="tok-publico", firma_ip="1.2.3.4",
            firma_user_agent="Navegador", documenso_signing_token="doc-token",
        )
        datos = APIClient().get(f"/api/v1/consentimientos/firmar/{consentimiento.token}/").json()
        self.assertNotIn("firma_ip", datos)
        self.assertNotIn("firma_user_agent", datos)
        self.assertNotIn("documenso_signing_token", datos)

    def test_m425_revocar_dos_veces_da_400_y_queda_en_el_log(self):
        from apps.core.models import LogAccion

        consentimiento = self._consentimiento(estado=Consentimiento.Estado.FIRMADO)
        url = f"/api/v1/consentimientos/{consentimiento.id}/revocar/"
        self.assertEqual(self.client.post(url, {"motivo_revocacion": "Error"}, format="json").status_code, 200)
        self.assertTrue(LogAccion.objects.filter(accion="consentimiento.revocar").exists())
        self.assertEqual(self.client.post(url, {"motivo_revocacion": "Otra"}, format="json").status_code, 400)

    # ── M6-26: monto de una cuota ──────────────────────────────────────────
    def test_m626_cuota_no_baja_de_lo_abonado_y_recalcula_el_total(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        cartera = Cartera.objects.create(cotizacion=cotizacion, paciente=self.paciente, total="200000.00")
        forma = FormaDePago.objects.filter(clinica=self.clinica).first()
        cuota = CuotaCartera.objects.create(
            cartera=cartera, tipo=forma, valor_esperado="100000.00", valor_pagado="60000.00",
            fecha_esperada=timezone.localdate() + timedelta(days=5),
        )
        CuotaCartera.objects.create(
            cartera=cartera, tipo=forma, valor_esperado="100000.00",
            fecha_esperada=timezone.localdate() + timedelta(days=35),
        )
        url = f"/api/v1/cartera/cuotas/{cuota.id}/"
        self.assertEqual(self.client.patch(url, {"monto": "50000"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"monto": "120000"}, format="json").status_code, 200)
        cartera.refresh_from_db()
        self.assertEqual(cartera.total, Decimal("220000.00"))

    # ── M7-21: borrador de compra sin factura ──────────────────────────────
    def test_m721_borrador_sin_factura_y_recibir_la_exige(self):
        from apps.inventario.models import Insumo
        from apps.proveedores.models import OrdenCompra, Proveedor

        proveedor = Proveedor.objects.create(
            clinica=self.clinica, nombre="Dist", nit="900", telefono="3000000000",
            categoria=Proveedor.Categoria.OTRO,
        )
        insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gasa", es_consumo_interno=True)
        response = self.client.post("/api/v1/proveedores/ordenes-compra/", {
            "proveedor": str(proveedor.id), "sede": str(self.sede.id), "fecha": timezone.localdate().isoformat(),
            "items": [{"insumo": str(insumo.id), "cantidad": "5", "precio_unitario": "1000"}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        orden = OrdenCompra.objects.get(pk=response.json()["id"])
        self.assertEqual(orden.numero_factura_proveedor, "")
        item = orden.items.first()
        recibir = self.client.post(f"/api/v1/proveedores/ordenes-compra/{orden.id}/recibir/", {
            "items_recibidos": [{"item_id": str(item.id), "cantidad": "5"}],
        }, format="json")
        self.assertEqual(recibir.status_code, 400)
        self.assertEqual(recibir.json()["code"], "FACTURA_REQUERIDA")

    # ── M7-25: un voto por artículo de ayuda ───────────────────────────────
    def test_m725_ayuda_un_voto_por_usuario(self):
        from apps.ayuda.models import ArticuloAyuda, CategoriaAyuda

        cache.clear()
        superadmin = User.objects.create_user(
            email="root@test.com", password="Secret123!", first_name="Ro", last_name="Ot", rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(superadmin)
        categoria = CategoriaAyuda.objects.create(nombre="General")
        articulo = ArticuloAyuda.objects.create(
            categoria=categoria, titulo="Cómo agendar", estado=ArticuloAyuda.Estado.PUBLICADO,
        )
        url = f"/api/v1/ayuda/articulos/{articulo.slug}/feedback/"
        for _ in range(3):
            self.assertEqual(self.client.post(url, {"util": True}, format="json").status_code, 200)
        articulo.refresh_from_db()
        self.assertEqual(articulo.util_si, 1)
