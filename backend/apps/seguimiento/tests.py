"""Seguimiento (fase 2 del embudo): interesados, Para hoy, gestiones y avance automático."""

import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.agenda.models import Cita
from apps.cotizaciones import tests as cotizaciones_tests
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
from apps.seguimiento.models import Oportunidad

URL = "/api/v1/seguimiento/oportunidades/"


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class SeguimientoTests(TestCase):
    _forma_pago = cotizaciones_tests.CotizacionFlowTests._forma_pago
    _payload = cotizaciones_tests.CotizacionFlowTests._payload

    def setUp(self):
        cotizaciones_tests.CotizacionFlowTests.setUp(self)
        # El superadmin trabaja sobre la clínica que manda en el header.
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))

    def _crear_interesado(self, **extra):
        data = {"nombre": "Laura Pérez", "telefono": "300 555 1234", "interes": "Depilación axilas", "origen": "instagram"}
        data.update(extra)
        response = self.client.post(URL, data, format="json")
        return response

    def _cotizacion(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return Cotizacion.objects.get(pk=response.json()["id"])

    def _cita(self, dias=2):
        inicio = timezone.now() + timedelta(days=dias)
        with self.captureOnCommitCallbacks(execute=True):
            return Cita.objects.create(
                paciente=self.paciente, sede=self.sede, profesional=self.superadmin,
                fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
                canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
            )

    # ── Interesados ──

    def test_crear_interesado_sin_ficha_queda_para_hoy(self):
        response = self._crear_interesado()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertIsNone(data["paciente"])
        self.assertEqual(data["etapa"], "nuevo")
        self.assertEqual(data["tipo"], "nueva")
        self.assertEqual(data["proximo_contacto"], timezone.localdate().isoformat())
        self.assertEqual(data["responsable"], str(self.superadmin.id))
        self.assertIn("le interesa Depilación axilas", data["frase"])

        response = self.client.get(f"{URL}?para_hoy=1")
        self.assertEqual([o["id"] for o in response.json()["results"]], [data["id"]])

    def test_crear_interesado_con_sede(self):
        response = self._crear_interesado(sede=str(self.sede.id))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["sede"], str(self.sede.id))

        from apps.clinicas.models import Clinica, Sede

        otra = Sede.objects.create(
            clinica=Clinica.objects.create(nombre="Otra", nit="900000001"),
            nombre="Ajena", ciudad="Cali", direccion="x", telefono="1",
        )
        response = self._crear_interesado(nombre="Otro", telefono="3105550000", sede=str(otra.id))
        self.assertEqual(response.status_code, 400)

    def test_interesado_sin_sede_toma_la_de_la_clinica(self):
        # Sin elegir sede y con una sola en la clínica: queda en esa (si no, lo verían todas).
        response = self._crear_interesado()
        self.assertEqual(response.json()["sede"], str(self.sede.id))

    def test_telefono_de_un_paciente_lo_vincula_y_no_duplica(self):
        # El paciente del setUp tiene 3010000000.
        response = self._crear_interesado(nombre="Kelly", telefono="+57 301 000 0000")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["paciente"], str(self.paciente.id))

        response = self._crear_interesado(nombre="Kelly otra vez", telefono="3010000000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "OPORTUNIDAD_ABIERTA")

    # ── Gestiones ──

    def test_gestion_mueve_el_proximo_contacto(self):
        oportunidad_id = self._crear_interesado().json()["id"]
        hoy = timezone.localdate()

        response = self.client.post(
            f"{URL}{oportunidad_id}/gestiones/", {"canal": "llamada", "resultado": "sin_respuesta"}, format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["proximo_contacto"], (hoy + timedelta(days=1)).isoformat())
        self.assertEqual(response.json()["ultima_gestion"]["resultado"], "sin_respuesta")
        # Ya no está en "Para hoy".
        self.assertEqual(self.client.get(f"{URL}?para_hoy=1").json()["count"], 0)

        elegida = hoy + timedelta(days=7)
        response = self.client.post(
            f"{URL}{oportunidad_id}/gestiones/",
            {"canal": "whatsapp_manual", "resultado": "interesado", "proximo_contacto": elegida.isoformat()},
            format="json",
        )
        self.assertEqual(response.json()["proximo_contacto"], elegida.isoformat())
        self.assertEqual(len(self.client.get(f"{URL}{oportunidad_id}/gestiones/").json()), 2)

    def test_agendo_sin_cita_vuelve_manana(self):
        oportunidad_id = self._crear_interesado().json()["id"]
        response = self.client.post(
            f"{URL}{oportunidad_id}/gestiones/", {"canal": "llamada", "resultado": "agendo"}, format="json",
        )
        self.assertEqual(response.json()["proximo_contacto"], (timezone.localdate() + timedelta(days=1)).isoformat())

    def test_agendo_con_cita_vuelve_el_dia_despues(self):
        oportunidad_id = self._crear_interesado(telefono="3010000000").json()["id"]
        cita = self._cita(dias=4)
        response = self.client.post(
            f"{URL}{oportunidad_id}/gestiones/", {"canal": "llamada", "resultado": "agendo"}, format="json",
        )
        esperado = timezone.localdate(cita.fecha_inicio) + timedelta(days=1)
        self.assertEqual(response.json()["proximo_contacto"], esperado.isoformat())

    def test_abierta_no_se_puede_dejar_sin_fecha(self):
        oportunidad_id = self._crear_interesado().json()["id"]
        response = self.client.patch(f"{URL}{oportunidad_id}/", {"proximo_contacto": None}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_perder_y_reabrir(self):
        oportunidad_id = self._crear_interesado().json()["id"]
        response = self.client.post(f"{URL}{oportunidad_id}/perder/", {"motivo": "precio"}, format="json")
        self.assertEqual(response.json()["estado"], "perdida")
        self.assertIsNone(response.json()["proximo_contacto"])
        self.assertEqual(self.client.get(URL).json()["count"], 0)

        response = self.client.post(f"{URL}{oportunidad_id}/reabrir/")
        self.assertEqual(response.json()["estado"], "abierta")

    # ── Avance automático ──

    def test_embudo_avanza_con_cita_envio_y_aceptacion(self):
        oportunidad_id = self._crear_interesado(telefono="3010000000").json()["id"]

        cita = self._cita(dias=2)
        oportunidad = Oportunidad.objects.get(pk=oportunidad_id)
        self.assertEqual(oportunidad.etapa, "valoracion")
        self.assertEqual(oportunidad.cita, cita)
        self.assertEqual(oportunidad.proximo_contacto, timezone.localdate(cita.fecha_inicio) + timedelta(days=1))

        cotizacion = self._cotizacion()
        self.assertEqual(cotizacion.oportunidad_id, oportunidad.id)

        with self.captureOnCommitCallbacks(execute=True):
            CotizacionEnvio.objects.create(cotizacion=cotizacion, canal=CotizacionEnvio.Canal.PDF)
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.etapa, "cotizado")
        self.assertEqual(oportunidad.valor_estimado, cotizacion.total)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", {"estado": "aceptada"}, format="json")
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.estado, "ganada")
        self.assertIsNone(oportunidad.proximo_contacto)

    def test_ficha_creada_desde_la_agenda_se_vincula_al_interesado(self):
        from apps.pacientes.models import Paciente

        oportunidad_id = self._crear_interesado(nombre="Valentina", telefono="+57 310 555 7788").json()["id"]
        self.assertIsNone(Oportunidad.objects.get(pk=oportunidad_id).paciente_id)

        # Recepción crea la ficha y la cita sin pasar por Seguimiento.
        with self.captureOnCommitCallbacks(execute=True):
            nueva = Paciente.objects.create(
                clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="99887766",
                nombres="Valentina", apellidos="Ríos", fecha_nacimiento=timezone.localdate() - timedelta(days=25 * 365),
                sexo=Paciente.Sexo.FEMENINO, direccion="Calle 1", telefono="3105557788",
                canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            )
        oportunidad = Oportunidad.objects.get(pk=oportunidad_id)
        self.assertEqual(oportunidad.paciente_id, nueva.id)

        inicio = timezone.now() + timedelta(days=2)
        with self.captureOnCommitCallbacks(execute=True):
            Cita.objects.create(
                paciente=nueva, sede=self.sede, profesional=self.superadmin,
                fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
                canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
            )
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.etapa, "valoracion")

    def test_un_error_del_seguimiento_no_impide_aceptar(self):
        self._crear_interesado(telefono="3010000000")
        cotizacion = self._cotizacion()
        with patch("apps.seguimiento.services.abiertas_de_venta", side_effect=RuntimeError("boom")):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(
                    f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", {"estado": "aceptada"}, format="json",
                )
        self.assertEqual(response.status_code, 200, response.content)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.ACEPTADA)

    def test_descartar_cotizacion_puede_cerrar_el_seguimiento(self):
        oportunidad_id = self._crear_interesado(telefono="3010000000").json()["id"]
        cotizacion = self._cotizacion()
        response = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/",
            {"estado": "descartada", "motivo_descarte": "precio", "cerrar_oportunidad": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["oportunidad"], oportunidad_id)
        oportunidad = Oportunidad.objects.get(pk=oportunidad_id)
        self.assertEqual(oportunidad.estado, "perdida")
        self.assertEqual(oportunidad.motivo_perdida, "precio")

    def test_cotizacion_sin_oportunidad_no_crea_una(self):
        self._cotizacion()
        self.assertFalse(Oportunidad.objects.exists())

    # ── Embudo ──

    def test_embudo_cuenta_por_etapa(self):
        self._crear_interesado(valor_estimado="200000.00")
        perdida_id = self._crear_interesado(nombre="Otra", telefono="3109998877").json()["id"]
        self.client.post(f"{URL}{perdida_id}/perder/", {"motivo": "otra_clinica"}, format="json")

        data = self.client.get(f"{URL}embudo/").json()
        etapas = {e["etapa"]: e for e in data["etapas"]}
        self.assertEqual(etapas["nuevo"]["cantidad"], 1)
        self.assertEqual(etapas["nuevo"]["valor"], "200000.00")
        self.assertEqual(data["perdidas"]["cantidad"], 1)
        self.assertEqual(data["perdidas"]["por_motivo"][0]["motivo"], "otra_clinica")
        self.assertEqual(data["por_origen"][0]["origen"], "instagram")
        self.assertEqual(data["para_hoy"], 1)


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class RitmoYDeteccionTests(TestCase):
    """Cuándo debería ser la siguiente sesión y los paquetes atrasados en "Para hoy"."""

    _forma_pago = cotizaciones_tests.CotizacionFlowTests._forma_pago

    def setUp(self):
        cotizaciones_tests.CotizacionFlowTests.setUp(self)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))

    def _paquete(self, sesiones=3, cada_dias=30, comprado_hace=0):
        payload = cotizaciones_tests.CotizacionFlowTests._payload(self)
        payload["items"][0].update({"num_citas": sesiones, "cada_dias": cada_dias})
        payload["formas_pago"][0]["valor"] = str(350000 * sesiones) + ".00"
        response = self.client.post("/api/v1/cotizaciones/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        cotizacion = Cotizacion.objects.get(pk=response.json()["id"])
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", {"estado": "aceptada"}, format="json")
        Cotizacion.objects.filter(pk=cotizacion.pk).update(aceptada_en=timezone.now() - timedelta(days=comprado_hace))
        cotizacion.refresh_from_db()
        return cotizacion, cotizacion.items.get(activo=True)

    def _cita(self, item, dias, estado=Cita.Estado.COMPLETADA):
        inicio = timezone.now() + timedelta(days=dias)
        with self.captureOnCommitCallbacks(execute=True):
            return Cita.objects.create(
                paciente=self.paciente, sede=self.sede, profesional=self.superadmin, item_cotizacion=item,
                fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=estado,
                canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
            )

    def _ritmo(self, cotizacion):
        response = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/sesiones/")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["items"][0]["ritmo"]

    def test_recien_comprado_le_toca_pronto(self):
        cotizacion, _ = self._paquete(comprado_hace=0)
        ritmo = self._ritmo(cotizacion)
        self.assertEqual(ritmo["estado"], "pronto")
        self.assertEqual(ritmo["proxima_esperada"], (timezone.localdate() + timedelta(days=7)).isoformat())

    def test_compro_y_no_agendo_queda_atrasado(self):
        cotizacion, _ = self._paquete(comprado_hace=20)
        ritmo = self._ritmo(cotizacion)
        self.assertEqual(ritmo["estado"], "atrasada")
        self.assertEqual(ritmo["dias_atraso"], 13)

    def test_primera_sesion_se_avisa_al_dia_siguiente(self):
        # 7 días tras la compra le toca; el día 8 ya está atrasada (sin tolerancia).
        cotizacion, _ = self._paquete(comprado_hace=7)
        self.assertEqual(self._ritmo(cotizacion)["estado"], "pronto")
        cotizacion, _ = self._paquete(comprado_hace=8)
        ritmo = self._ritmo(cotizacion)
        self.assertEqual(ritmo["estado"], "atrasada")
        self.assertEqual(ritmo["dias_atraso"], 1)

    def test_entre_sesiones_aplica_la_tolerancia(self):
        cotizacion, item = self._paquete(cada_dias=30, comprado_hace=90)
        self._cita(item, dias=-33)  # le tocaba hace 3 días: dentro de los 5 de tolerancia
        self.assertEqual(self._ritmo(cotizacion)["estado"], "pronto")

    def test_cuenta_desde_la_ultima_sesion_realizada(self):
        cotizacion, item = self._paquete(cada_dias=30, comprado_hace=60)
        self._cita(item, dias=-10)
        ritmo = self._ritmo(cotizacion)
        self.assertEqual(ritmo["estado"], "a_tiempo")
        self.assertEqual(ritmo["proxima_esperada"], (timezone.localdate() + timedelta(days=20)).isoformat())
        self.assertEqual(ritmo["realizadas"], 1)

    def test_con_cita_futura_esta_agendada(self):
        cotizacion, item = self._paquete(comprado_hace=60)
        self._cita(item, dias=-40)
        self._cita(item, dias=3, estado=Cita.Estado.PENDIENTE)
        self.assertEqual(self._ritmo(cotizacion)["estado"], "agendada")

    def test_deteccion_lo_pone_para_hoy_y_lo_cierra_al_agendar(self):
        from apps.seguimiento.deteccion import detectar_paquetes

        cotizacion, item = self._paquete(cada_dias=30, comprado_hace=90)
        self._cita(item, dias=-45)
        resultado = detectar_paquetes(self.clinica)
        self.assertEqual(resultado["creadas"], 1)
        # Idempotente: otra corrida no duplica.
        self.assertEqual(detectar_paquetes(self.clinica)["creadas"], 0)

        filas = self.client.get(f"{URL}?para_hoy=1").json()["results"]
        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]["tipo"], "paquete")
        self.assertIn("sesión 2 de 3", filas[0]["frase"])
        self.assertIn("debía agendar hace 15 días", filas[0]["frase"])
        self.assertEqual(filas[0]["item_cotizacion"], str(item.id))

        self._cita(item, dias=2, estado=Cita.Estado.PENDIENTE)
        oportunidad = Oportunidad.objects.get()
        self.assertEqual(oportunidad.estado, "ganada")
        self.assertEqual(self.client.get(f"{URL}?para_hoy=1").json()["count"], 0)

    def test_ritmo_del_bloque_se_copia_al_vender(self):
        from apps.clinicas.models import TipoSesion, TratamientoCatalogo
        from apps.protocolos.services import crear_tratamiento_desde_cotizacion

        tratamiento = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="Láser axilas")
        TipoSesion.objects.create(tratamiento=tratamiento, nombre="Sesión", cantidad=2, cada_dias=28, duracion_min=30)
        cotizacion, item = self._paquete(comprado_hace=0)
        item.tratamiento = tratamiento
        item.tipo = "tratamiento"
        item.save(update_fields=["tratamiento", "tipo"])
        item.tratamientos_paciente.all().delete()
        tp = crear_tratamiento_desde_cotizacion(item)
        self.assertEqual({s.cada_dias for s in tp.sesiones.all()}, {28})

    def test_si_cancela_la_cita_el_paquete_vuelve_a_para_hoy(self):
        from apps.seguimiento.deteccion import detectar_paquetes

        _, item = self._paquete(cada_dias=30, comprado_hace=90)
        self._cita(item, dias=-45)
        detectar_paquetes(self.clinica)
        cita = self._cita(item, dias=2, estado=Cita.Estado.PENDIENTE)
        self.assertEqual(Oportunidad.objects.get().estado, "ganada")

        Cita.objects.filter(pk=cita.pk).update(estado=Cita.Estado.CANCELADA)
        resultado = detectar_paquetes(self.clinica)
        self.assertEqual(resultado["reabiertas"], 1)
        self.assertEqual(resultado["abiertas"], 1)
        self.assertEqual(Oportunidad.objects.get().estado, "abierta")

    def test_cerrada_a_mano_no_se_reabre(self):
        from apps.seguimiento.deteccion import detectar_paquetes

        _, item = self._paquete(cada_dias=30, comprado_hace=90)
        self._cita(item, dias=-45)
        detectar_paquetes(self.clinica)
        oportunidad = Oportunidad.objects.get()
        self.client.post(f"{URL}{oportunidad.id}/perder/", {"motivo": "precio"}, format="json")
        self.assertEqual(detectar_paquetes(self.clinica)["reabiertas"], 0)
        self.assertEqual(Oportunidad.objects.get().estado, "perdida")

    def test_ventas_viejas_sin_citas_no_llenan_para_hoy(self):
        from apps.seguimiento.deteccion import detectar_paquetes

        self._paquete(comprado_hace=400)
        self.assertEqual(detectar_paquetes(self.clinica)["creadas"], 0)

    def test_cita_pasada_sin_cerrar_no_marca_atraso(self):
        cotizacion, item = self._paquete(cada_dias=30, comprado_hace=90)
        self._cita(item, dias=-45)
        self._cita(item, dias=-1, estado=Cita.Estado.CONFIRMADA)
        self.assertEqual(self._ritmo(cotizacion)["estado"], "agendada")

    def test_sesiones_previas_de_migracion_no_se_cuentan_dos_veces(self):
        from apps.clinicas.models import TipoSesion, TratamientoCatalogo
        from apps.protocolos.models import SesionProcedimiento
        from apps.protocolos.services import crear_tratamiento_desde_cotizacion
        from apps.seguimiento import ritmo
        from apps.seguimiento.models import ConfigSeguimiento

        tratamiento = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="Láser piernas")
        TipoSesion.objects.create(tratamiento=tratamiento, nombre="Sesión", cantidad=3, cada_dias=28, duracion_min=30)
        _, item = self._paquete(comprado_hace=60)
        item.tratamiento = tratamiento
        item.tipo = "tratamiento"
        item.sesiones_previas_consumidas = 1
        item.save(update_fields=["tratamiento", "tipo", "sesiones_previas_consumidas"])
        item.tratamientos_paciente.all().delete()
        tp = crear_tratamiento_desde_cotizacion(item)
        # Como lo deja el asistente de migración: la previa también como sesión completada sin cita.
        primera = tp.sesiones.order_by("numero").first()
        primera.estado = SesionProcedimiento.Estado.COMPLETADO
        primera.fecha = timezone.localdate() - timedelta(days=10)
        primera.save()

        r = ritmo.calcular(item, ConfigSeguimiento.de(self.clinica))
        self.assertEqual(r["realizadas"], 1)
        self.assertEqual(r["proxima_esperada"], timezone.localdate() + timedelta(days=18))
