"""Autorización de precios fuera de regla (docs/plan-autorizacion-precios.md)."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio
from apps.colaboradores.models import Colaborador
from apps.core.models import LogAccion
from apps.cotizaciones.models import Cotizacion, SolicitudAutorizacionPrecio
from apps.pacientes.models import Paciente
from apps.users.models import Permiso, Rol, RolPermiso

User = get_user_model()
Estado = SolicitudAutorizacionPrecio.Estado
URL = "/api/v1/cotizaciones/"
BANDEJA = "/api/v1/autorizaciones-precio/"


class AutorizacionPreciosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Autoriza", nit="907000111")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario={"lunes": ["08:00", "18:00"]},
        )
        self.otra_sede = Sede.objects.create(
            clinica=self.clinica, nombre="Sur", ciudad="Bogota", direccion="Calle 9",
            telefono="3000000001", horario={"lunes": ["08:00", "18:00"]},
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="7001",
            nombres="Ana", apellidos="Precio", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        # Lista 350.000 con 10 % de descuento máximo: el piso es 315.000.
        self.procedimiento = Servicio.objects.create(
            clinica=self.clinica, nombre="Laser CO2", descripcion="Facial", duracion_min=45,
            precio="350000.00", precio_base="350000.00", descuento_maximo_pct=Decimal("10"),
        )
        self.asesor = self._usuario("asesor", ("cotizaciones.ver", "cotizaciones.gestionar"), self.sede)
        self.gerente = self._usuario(
            "gerente", ("cotizaciones.ver", "cotizaciones.gestionar", "cotizaciones.cambiar_precio"), self.sede,
        )
        self.gerente_sur = self._usuario(
            "gerente-sur", ("cotizaciones.ver", "cotizaciones.gestionar", "cotizaciones.cambiar_precio"),
            self.otra_sede,
        )

    def _usuario(self, nombre, permisos, sede):
        rol = Rol.objects.create(clinica=self.clinica, slug=f"rol-{nombre}", nombre=f"Rol {nombre}")
        for clave in permisos:
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        user = User.objects.create_user(
            email=f"{nombre}@autoriza.test", password="Secret123!", first_name=nombre.title(), last_name="Prueba",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        colaborador = Colaborador.objects.create(
            user=user, sede_principal=sede, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(), numero_documento=f"doc-{nombre}",
        )
        colaborador.sedes.add(sede)
        return user

    def _payload(self, valor="350000.00", descuento="0", **extra):
        forma = FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia")
        total = Decimal(valor) * (1 - Decimal(descuento) / 100)
        return {
            "paciente": str(self.paciente.id),
            "sede": str(self.sede.id),
            "items": [{
                "tipo": "procedimiento", "procedimiento": str(self.procedimiento.id),
                "valor_unitario": valor, "descuento_porcentaje": descuento,
            }],
            "formas_pago": [{"tipo": str(forma.id), "descripcion": "Total", "valor": f"{total:.2f}"}],
            **extra,
        }

    def _crear(self, como=None, **kwargs):
        self.client.force_authenticate(como or self.asesor)
        return self.client.post(URL, self._payload(**kwargs), format="json")

    def _editar(self, cotizacion_id, como=None, **kwargs):
        self.client.force_authenticate(como or self.asesor)
        payload = self._payload(**kwargs)
        payload.pop("paciente")
        return self.client.patch(f"{URL}{cotizacion_id}/", payload, format="json")

    def _pedir(self, valor="250000.00", **kwargs):
        r = self._crear(valor=valor, solicitar_autorizacion="Cliente frecuente, cierra hoy", **kwargs)
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    # ── Asesor ────────────────────────────────────────────────────────────

    def test_sin_pedir_autorizacion_el_precio_bajo_se_rechaza(self):
        r = self._crear(valor="250000.00")
        self.assertEqual(r.status_code, 400)
        datos = r.json()
        self.assertEqual(datos["code"], "PRECIO_REQUIERE_AUTORIZACION")
        # Con un solo ítem la respuesta lo aplana (normalize_error_response).
        self.assertEqual(datos["items"]["code"], ["PRECIO_BLOQUEADO"])

    def test_pedir_autorizacion_guarda_y_deja_la_solicitud_pendiente(self):
        datos = self._pedir()
        self.assertTrue(datos["precio_por_autorizar"])
        solicitud = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=datos["id"])
        self.assertEqual(solicitud.estado, Estado.PENDIENTE)
        self.assertEqual(solicitud.solicitada_por, self.asesor)
        self.assertEqual(solicitud.motivo, "Cliente frecuente, cierra hoy")
        item = solicitud.items[0]
        # Bajó el precio de catálogo; el mínimo real es la lista con el 10 % máximo.
        self.assertEqual(item["regla"], "precio")
        self.assertEqual(item["precio_lista"], "350000.00")
        self.assertEqual(item["minimo"], "315000.00")
        self.assertEqual(item["precio_pedido"], "250000.00")
        self.assertEqual(item["diferencia"], "65000.00")
        self.assertEqual(solicitud.total_pedido, Decimal("250000.00"))
        self.assertEqual(solicitud.total_permitido, Decimal("315000.00"))
        self.assertEqual(datos["autorizacion_precio"]["estado"], "pendiente")
        self.assertTrue(LogAccion.objects.filter(accion="cotizacion.autorizacion_precio.solicitar").exists())

    def test_descuento_sobre_el_maximo_tambien_se_puede_pedir(self):
        datos = self._pedir(valor="350000.00", descuento="20")
        item = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=datos["id"]).items[0]
        self.assertEqual(item["regla"], "descuento")
        self.assertEqual(item["minimo"], "315000.00")
        self.assertEqual(item["precio_pedido"], "280000.00")
        self.assertEqual(item["diferencia"], "35000.00")

    def test_mientras_espera_no_se_envia_ni_se_descarga_ni_se_acepta(self):
        cotizacion_id = self._pedir()["id"]
        envio = self.client.post(f"{URL}{cotizacion_id}/registrar_envio/", {"canal": "pdf"}, format="json")
        self.assertEqual(envio.status_code, 400)
        self.assertEqual(envio.json()["code"], "PRECIO_POR_AUTORIZAR")
        pdf = self.client.get(f"{URL}{cotizacion_id}/pdf/")
        self.assertEqual(pdf.status_code, 400)
        aceptar = self.client.post(f"{URL}{cotizacion_id}/cambiar_estado/", {"estado": "aceptada"}, format="json")
        self.assertEqual(aceptar.status_code, 400)
        self.assertEqual(aceptar.json()["code"], "PRECIO_POR_AUTORIZAR")
        self.assertEqual(Cotizacion.objects.get(pk=cotizacion_id).estado, Cotizacion.Estado.BORRADOR)

    def test_mientras_espera_puede_editar_sin_bajar_mas_el_precio(self):
        cotizacion_id = self._pedir()["id"]
        igual = self._editar(cotizacion_id, valor="250000.00", notas="Llamar el lunes")
        self.assertEqual(igual.status_code, 200, igual.content)
        sube = self._editar(cotizacion_id, valor="260000.00")
        self.assertEqual(sube.status_code, 200, sube.content)
        solicitud = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=cotizacion_id)
        self.assertEqual(solicitud.estado, Estado.PENDIENTE)
        # El autorizador ve el precio actual.
        self.assertEqual(solicitud.items[0]["precio_pedido"], "260000.00")
        self.assertEqual(solicitud.items[0]["diferencia"], "55000.00")
        baja = self._editar(cotizacion_id, valor="200000.00")
        self.assertEqual(baja.status_code, 400)
        self.assertEqual(baja.json()["code"], "PRECIO_REQUIERE_AUTORIZACION")

    def test_volver_al_precio_permitido_cancela_la_solicitud(self):
        cotizacion_id = self._pedir()["id"]
        r = self._editar(cotizacion_id, valor="350000.00")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()["precio_por_autorizar"])
        self.assertEqual(SolicitudAutorizacionPrecio.objects.get(cotizacion_id=cotizacion_id).estado, Estado.CANCELADA)
        self.assertIsNone(r.json()["autorizacion_precio"])

    def test_pedir_de_nuevo_reemplaza_la_pendiente(self):
        cotizacion_id = self._pedir()["id"]
        r = self._editar(cotizacion_id, valor="200000.00", solicitar_autorizacion="Mejor oferta de la competencia")
        self.assertEqual(r.status_code, 200, r.content)
        estados = list(
            SolicitudAutorizacionPrecio.objects.filter(cotizacion_id=cotizacion_id)
            .order_by("created_at").values_list("estado", flat=True)
        )
        self.assertEqual(estados, [Estado.CANCELADA, Estado.PENDIENTE])

    def test_descartar_cancela_la_solicitud(self):
        cotizacion_id = self._pedir()["id"]
        r = self.client.post(f"{URL}{cotizacion_id}/cambiar_estado/", {"estado": "descartada"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(SolicitudAutorizacionPrecio.objects.get(cotizacion_id=cotizacion_id).estado, Estado.CANCELADA)

    def test_consulta_del_estado_para_el_polling(self):
        cotizacion_id = self._pedir()["id"]
        r = self.client.get(f"{URL}{cotizacion_id}/autorizacion_precio/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["precio_por_autorizar"])
        self.assertEqual(r.json()["solicitud"]["estado"], "pendiente")

    # ── Autorizador ───────────────────────────────────────────────────────

    def test_autorizar_habilita_enviar_y_la_autorizacion_cubre_ese_precio(self):
        datos = self._pedir()
        solicitud = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=datos["id"])

        self.client.force_authenticate(self.gerente)
        self.assertEqual(self.client.get(f"{BANDEJA}contador/").json()["pendientes"], 1)
        bandeja = self.client.get(BANDEJA).json()
        filas = bandeja["results"] if isinstance(bandeja, dict) else bandeja
        self.assertEqual([f["id"] for f in filas], [str(solicitud.id)])
        self.assertEqual(filas[0]["paciente_nombre"], self.paciente.nombre_completo)

        r = self.client.post(f"{BANDEJA}{solicitud.id}/autorizar/", {"comentario": "Va"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["estado"], "autorizada")
        self.assertEqual(r.json()["resuelta_por_nombre"], self.gerente.nombre_completo)
        self.assertFalse(Cotizacion.objects.get(pk=datos["id"]).precio_por_autorizar)
        self.assertEqual(self.client.get(f"{BANDEJA}contador/").json()["pendientes"], 0)
        self.assertTrue(LogAccion.objects.filter(accion="cotizacion.autorizacion_precio.autorizar").exists())

        self.client.force_authenticate(self.asesor)
        envio = self.client.post(f"{URL}{datos['id']}/registrar_envio/", {"canal": "pdf"}, format="json")
        self.assertEqual(envio.status_code, 201, envio.content)
        # Subir el precio autorizado no pide nada; bajarlo sí.
        self.assertEqual(self._editar(datos["id"], valor="300000.00").status_code, 200)
        self.assertEqual(self._editar(datos["id"], valor="250000.00").status_code, 200)
        baja = self._editar(datos["id"], valor="240000.00")
        self.assertEqual(baja.status_code, 400)
        self.assertEqual(baja.json()["code"], "PRECIO_REQUIERE_AUTORIZACION")

    def test_rechazar_exige_comentario_y_deja_la_cotizacion_bloqueada(self):
        datos = self._pedir()
        solicitud = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=datos["id"])
        self.client.force_authenticate(self.gerente)
        sin_comentario = self.client.post(f"{BANDEJA}{solicitud.id}/rechazar/", {}, format="json")
        self.assertEqual(sin_comentario.status_code, 400)
        r = self.client.post(
            f"{BANDEJA}{solicitud.id}/rechazar/", {"comentario": "Máximo 10 % este mes"}, format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(Cotizacion.objects.get(pk=datos["id"]).precio_por_autorizar)
        otra_vez = self.client.post(f"{BANDEJA}{solicitud.id}/autorizar/", {}, format="json")
        self.assertEqual(otra_vez.json()["code"], "SOLICITUD_YA_RESUELTA")

        self.client.force_authenticate(self.asesor)
        estado = self.client.get(f"{URL}{datos['id']}/autorizacion_precio/").json()
        self.assertEqual(estado["solicitud"]["estado"], "rechazada")
        self.assertEqual(estado["solicitud"]["comentario"], "Máximo 10 % este mes")
        self.assertEqual(self._editar(datos["id"], valor="250000.00").status_code, 400)
        corregida = self._editar(datos["id"], valor="350000.00", descuento="10")
        self.assertEqual(corregida.status_code, 200, corregida.content)
        self.assertFalse(corregida.json()["precio_por_autorizar"])

    def test_el_autorizador_solo_ve_las_de_sus_sedes(self):
        datos = self._pedir()
        solicitud = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=datos["id"])
        self.client.force_authenticate(self.gerente_sur)
        self.assertEqual(self.client.get(f"{BANDEJA}contador/").json()["pendientes"], 0)
        r = self.client.post(f"{BANDEJA}{solicitud.id}/autorizar/", {}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_sin_el_permiso_no_entra_a_la_bandeja(self):
        self.client.force_authenticate(self.asesor)
        self.assertEqual(self.client.get(BANDEJA).status_code, 403)
        self.assertEqual(self.client.get(f"{BANDEJA}contador/").status_code, 403)

    def test_quien_tiene_el_permiso_guarda_directo_y_queda_a_su_nombre(self):
        r = self._crear(como=self.gerente, valor="250000.00")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertFalse(r.json()["precio_por_autorizar"])
        solicitud = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=r.json()["id"])
        self.assertEqual(solicitud.estado, Estado.AUTORIZADA)
        self.assertTrue(solicitud.directa)
        self.assertEqual(solicitud.resuelta_por, self.gerente)
        # El asesor edita después sin tener que pedir ese precio otra vez.
        self.assertEqual(self._editar(r.json()["id"], valor="250000.00").status_code, 200)
        # La bandeja no muestra las directas.
        self.client.force_authenticate(self.gerente)
        bandeja = self.client.get(f"{BANDEJA}?estado=resueltas").json()
        filas = bandeja["results"] if isinstance(bandeja, dict) else bandeja
        self.assertEqual(filas, [])

    def test_el_autorizador_que_cambia_el_precio_resuelve_la_pendiente(self):
        datos = self._pedir()
        r = self._editar(datos["id"], como=self.gerente, valor="260000.00")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()["precio_por_autorizar"])
        estados = set(
            SolicitudAutorizacionPrecio.objects.filter(cotizacion_id=datos["id"]).values_list("estado", flat=True)
        )
        self.assertEqual(estados, {Estado.CANCELADA, Estado.AUTORIZADA})

    def test_el_autorizador_que_guarda_sin_tocar_el_precio_no_lo_autoriza(self):
        # CT-16: guardar otro cambio no aprueba sin querer la solicitud.
        datos = self._pedir()
        r = self._editar(datos["id"], como=self.gerente, valor="250000.00")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["precio_por_autorizar"])
        estados = set(
            SolicitudAutorizacionPrecio.objects.filter(cotizacion_id=datos["id"]).values_list("estado", flat=True)
        )
        self.assertEqual(estados, {Estado.PENDIENTE})

    def test_bajar_el_precio_sin_pasar_el_descuento_maximo_muestra_el_catalogo(self):
        # 330.000 está sobre el piso (315.000) pero bajo el catálogo: la regla es el precio.
        datos = self._pedir(valor="330000.00")
        item = SolicitudAutorizacionPrecio.objects.get(cotizacion_id=datos["id"]).items[0]
        self.assertEqual(item["regla"], "precio")
        self.assertEqual(item["minimo"], "350000.00")
        self.assertEqual(item["diferencia"], "20000.00")
