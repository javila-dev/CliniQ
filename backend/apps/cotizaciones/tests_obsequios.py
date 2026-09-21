"""Obsequios en cotizaciones: informativos, sesiones (procedimiento o clon de una
sesión del tratamiento cotizado) y productos de inventario."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import (
    Clinica,
    Sede,
    Servicio,
    ServicioConsentimiento,
    TipoSesion,
    TratamientoCatalogo,
)
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.inventario.models import Insumo, MovimientoInventario, StockInsumoSede
from apps.inventario.serializers import MovimientoInventarioSerializer
from apps.pacientes.models import Paciente
from apps.protocolos.models import TratamientoPaciente
from apps.protocolos.services import consentimientos_requeridos_cotizacion

User = get_user_model()


class ObsequiosCotizacionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-obsequios@example.com",
            password="secret123",
            first_name="Root",
            last_name="Obsequios",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Obsequios", nit="901222333")
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="555666777",
            nombres="Ana",
            apellidos="Regalos",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 1",
            telefono="3011111111",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario={"lunes": ["08:00", "18:00"]},
        )
        self.servicio = Servicio.objects.create(
            clinica=self.clinica, nombre="Toxina", descripcion="Aplicacion", duracion_min=30, precio="350000.00",
        )
        self.limpieza = Servicio.objects.create(
            clinica=self.clinica, nombre="Limpieza facial", descripcion="Higiene", duracion_min=45, precio="120000.00",
        )
        self.tratamiento = TratamientoCatalogo.objects.create(
            clinica=self.clinica, nombre="Plan Toxina", descripcion="Paquete", precio_estimado="700000.00",
        )
        self.tipo_compromiso = TipoSesion.objects.create(
            tratamiento=self.tratamiento, nombre="Sesion Toxina", cantidad=2, orden=1, duracion_min=30,
        )
        self.tipo_sin_compromiso = TipoSesion.objects.create(
            tratamiento=self.tratamiento, nombre="Consulta de valoracion", cantidad=1, orden=2, es_compromiso=False,
        )
        self.insumo = Insumo.objects.create(
            clinica=self.clinica,
            nombre="Serum hidratante",
            unidad_medida=Insumo.UnidadMedida.ML,
            es_venta_retail=True,
            precio_venta="90000.00",
        )

    # ── helpers ────────────────────────────────────────────────────────────

    def _item_pagado(self):
        return {"tipo": "procedimiento", "procedimiento": str(self.servicio.id), "valor_unitario": "350000.00"}

    def _item_tratamiento(self):
        # El formulario siempre envía num_citas=1 en tratamientos (una línea cobrada).
        return {"tratamiento": str(self.tratamiento.id), "num_citas": 1}

    def _payload(self, items, total="350000.00"):
        return {
            "paciente": str(self.paciente.id),
            "validez_dias": 30,
            "notas": "",
            "items": items,
            "formas_pago": [{"tipo": "transferencia", "descripcion": "Banco", "valor": total}],
        }

    def _crear(self, items, total="350000.00"):
        return self.client.post("/api/v1/cotizaciones/", self._payload(items, total), format="json")

    def _obsequio_clon(self, **extra):
        return {
            "tipo": "libre",
            "es_obsequio": True,
            "agendable": True,
            "tipo_sesion_origen": str(self.tipo_compromiso.id),
            "origen_indice": 0,
            "num_citas": 1,
            "valor_referencia": "120000.00",
            **extra,
        }

    # ── informativo ────────────────────────────────────────────────────────

    def test_obsequio_informativo_no_cambia_total_ni_expone_sesiones(self):
        response = self._crear(
            [
                self._item_pagado(),
                {
                    "tipo": "libre",
                    "es_obsequio": True,
                    "descripcion": "Consulta de valoracion",
                    "valor_unitario": "99999.00",
                    "descuento_porcentaje": "50.00",
                    "valor_referencia": "80000.00",
                },
            ]
        )

        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(Decimal(data["total"]), Decimal("350000.00"))
        obsequio = next(i for i in data["items"] if i["es_obsequio"])
        self.assertEqual(obsequio["valor_unitario"], "0.00")
        self.assertEqual(obsequio["descuento_porcentaje"], "0.00")
        self.assertEqual(obsequio["subtotal"], "0.00")
        self.assertEqual(obsequio["valor_referencia"], "80000.00")
        self.assertFalse(obsequio["agendable"])
        self.assertEqual(obsequio["citas_restantes"], 0)

        sesiones = self.client.get(f"/api/v1/cotizaciones/{data['id']}/sesiones/").json()
        self.assertEqual([i["descripcion"] for i in sesiones["items"]], ["Toxina"])

    def test_no_se_permite_cotizacion_solo_con_obsequios(self):
        response = self._crear(
            [{"tipo": "libre", "es_obsequio": True, "descripcion": "Regalo", "valor_referencia": "10000"}],
            total="10000.00",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("obsequio", str(response.json()).lower())

    def test_agendable_libre_sin_origen_se_rechaza(self):
        response = self._crear(
            [
                self._item_pagado(),
                {"tipo": "libre", "es_obsequio": True, "agendable": True, "descripcion": "Sesion suelta"},
            ]
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("agendable", str(response.json()))

    def test_un_tratamiento_completo_no_puede_ser_obsequio(self):
        response = self._crear([self._item_pagado(), {**self._item_tratamiento(), "es_obsequio": True}])

        self.assertEqual(response.status_code, 400)

    # ── procedimiento del catálogo ─────────────────────────────────────────

    def test_obsequio_procedimiento_agendable_tiene_cupo_propio(self):
        response = self._crear(
            [
                self._item_pagado(),
                {
                    "tipo": "procedimiento",
                    "procedimiento": str(self.limpieza.id),
                    "es_obsequio": True,
                    "agendable": True,
                },
            ]
        )

        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(Decimal(data["total"]), Decimal("350000.00"))
        obsequio = next(i for i in data["items"] if i["es_obsequio"])
        self.assertEqual(obsequio["valor_unitario"], "0.00")
        self.assertEqual(obsequio["valor_referencia"], "120000.00")
        self.assertFalse(obsequio["precio_bloqueado"])
        self.assertIsNone(obsequio["precio_lista"])
        self.assertIsNone(obsequio["precio_campana_disponible"])
        self.assertEqual(obsequio["citas_restantes"], 1)

        sesiones = self.client.get(f"/api/v1/cotizaciones/{data['id']}/sesiones/").json()
        regalo = next(i for i in sesiones["items"] if i["es_obsequio"])
        self.assertEqual(regalo["num_citas"], 1)

    # ── sesión clonada del tratamiento ─────────────────────────────────────

    def test_sesion_clonada_suma_al_cupo_del_tratamiento_de_origen(self):
        response = self._crear([self._item_tratamiento(), self._obsequio_clon()], total="700000.00")

        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        tratamiento_item, regalo = data["items"]
        self.assertEqual(regalo["item_origen"], tratamiento_item["id"])
        self.assertEqual(regalo["descripcion"], "Sesion Toxina")
        self.assertEqual(regalo["citas_restantes"], 0)
        self.assertEqual(tratamiento_item["citas_restantes"], 3)
        self.assertEqual(Decimal(data["total"]), Decimal("700000.00"))

        item = ItemCotizacion.objects.get(id=tratamiento_item["id"])
        self.assertEqual(item.num_sesiones_efectivas(), 3)
        self.assertEqual(ItemCotizacion.objects.get(id=regalo["id"]).num_sesiones_efectivas(), 0)

        sesiones = self.client.get(f"/api/v1/cotizaciones/{data['id']}/sesiones/").json()
        self.assertEqual(len(sesiones["items"]), 1)
        self.assertEqual(sesiones["items"][0]["num_citas"], 3)
        self.assertEqual(sesiones["items"][0]["sesiones_obsequio"], 1)
        self.assertEqual(sesiones["items"][0]["citas_restantes"], 3)

    def test_sesion_clonada_informativa_no_suma_cupo(self):
        response = self._crear(
            [
                self._item_tratamiento(),
                self._obsequio_clon(
                    agendable=False,
                    tipo_sesion_origen=str(self.tipo_sin_compromiso.id),
                ),
            ],
            total="700000.00",
        )

        self.assertEqual(response.status_code, 201, response.content)
        tratamiento_item = response.json()["items"][0]
        self.assertEqual(tratamiento_item["citas_restantes"], 2)

    def test_clon_agendable_exige_tipo_de_sesion_de_compromiso(self):
        response = self._crear(
            [self._item_tratamiento(), self._obsequio_clon(tipo_sesion_origen=str(self.tipo_sin_compromiso.id))],
            total="700000.00",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("compromiso", str(response.json()))

    def test_clon_exige_que_el_origen_sea_un_tratamiento_de_la_cotizacion(self):
        # El índice apunta a un procedimiento, no a un tratamiento.
        response = self._crear([self._item_pagado(), self._obsequio_clon()])
        self.assertEqual(response.status_code, 400)

        # La sesión pertenece a otro tratamiento distinto del cotizado.
        otro = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="Otro plan", precio_estimado="500000.00")
        ajena = TipoSesion.objects.create(tratamiento=otro, nombre="Sesion ajena", cantidad=1, orden=1)
        response = self._crear(
            [self._item_tratamiento(), self._obsequio_clon(tipo_sesion_origen=str(ajena.id))], total="700000.00",
        )
        self.assertEqual(response.status_code, 400)

        # Sin índice de origen.
        regalo = self._obsequio_clon()
        regalo.pop("origen_indice")
        response = self._crear([self._item_tratamiento(), regalo], total="700000.00")
        self.assertEqual(response.status_code, 400)

    def test_editar_borrador_reenlaza_el_origen_con_los_ids_nuevos(self):
        creada = self._crear([self._item_tratamiento(), self._obsequio_clon()], total="700000.00").json()
        id_anterior = creada["items"][0]["id"]

        response = self.client.patch(
            f"/api/v1/cotizaciones/{creada['id']}/",
            {"items": [self._item_tratamiento(), self._obsequio_clon()]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        tratamiento_item, regalo = response.json()["items"]
        self.assertNotEqual(tratamiento_item["id"], id_anterior)
        self.assertEqual(regalo["item_origen"], tratamiento_item["id"])
        self.assertEqual(tratamiento_item["citas_restantes"], 3)

    # ── producto de inventario ─────────────────────────────────────────────

    def test_obsequio_producto_guarda_insumo_y_cantidad(self):
        response = self._crear(
            [
                self._item_pagado(),
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": "5.000"},
            ]
        )

        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        producto = next(i for i in data["items"] if i["es_obsequio"])
        self.assertEqual(producto["descripcion"], "Serum hidratante")
        self.assertEqual(producto["insumo_nombre"], "Serum hidratante")
        self.assertEqual(producto["insumo_unidad"], "ml")
        self.assertEqual(Decimal(producto["cantidad_insumo"]), Decimal("5"))
        self.assertEqual(producto["valor_referencia"], "90000.00")
        self.assertEqual(producto["num_citas"], 1)
        self.assertEqual(producto["citas_restantes"], 0)
        self.assertEqual(Decimal(data["total"]), Decimal("350000.00"))

        sesiones = self.client.get(f"/api/v1/cotizaciones/{data['id']}/sesiones/").json()
        self.assertEqual([i["descripcion"] for i in sesiones["items"]], ["Toxina"])

    def test_obsequio_producto_valida_cantidad_y_que_sea_obsequio(self):
        sin_cantidad = self._crear(
            [
                self._item_pagado(),
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": "0"},
            ]
        )
        self.assertEqual(sin_cantidad.status_code, 400)

        no_obsequio = self._crear(
            [
                self._item_pagado(),
                {"tipo": "insumo", "insumo": str(self.insumo.id), "cantidad_insumo": "1", "valor_unitario": "5000"},
            ]
        )
        self.assertEqual(no_obsequio.status_code, 400)

    def test_obsequio_producto_de_otra_clinica_se_rechaza(self):
        otra = Clinica.objects.create(nombre="Otra clinica", nit="900999888")
        ajeno = Insumo.objects.create(
            clinica=otra, nombre="Producto ajeno", unidad_medida=Insumo.UnidadMedida.UNIDAD,
        )

        response = self._crear(
            [
                self._item_pagado(),
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(ajeno.id), "cantidad_insumo": "1"},
            ]
        )

        self.assertEqual(response.status_code, 400)

    # ── aceptación y consentimientos ───────────────────────────────────────

    def test_aceptar_ignora_obsequios_en_cartera_y_no_les_crea_seguimiento(self):
        creada = self._crear(
            [
                self._item_tratamiento(),
                self._obsequio_clon(),
                {"tipo": "libre", "es_obsequio": True, "descripcion": "Consulta", "valor_referencia": "50000"},
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": "2"},
            ],
            total="700000.00",
        ).json()

        response = self.client.post(
            f"/api/v1/cotizaciones/{creada['id']}/cambiar_estado/", {"estado": "aceptada"}, format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        cotizacion = Cotizacion.objects.get(id=creada["id"])
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.ACEPTADA)
        self.assertEqual(cotizacion.cartera.total, Decimal("700000.00"))
        # Solo el tratamiento cotizado genera seguimiento clínico.
        self.assertEqual(TratamientoPaciente.objects.filter(paciente=self.paciente).count(), 1)

    def test_editar_borrador_no_duplica_seguimientos_al_aceptar(self):
        creada = self._crear([self._item_tratamiento()], total="700000.00").json()
        self.client.patch(
            f"/api/v1/cotizaciones/{creada['id']}/", {"items": [self._item_tratamiento()]}, format="json",
        )

        self.client.post(
            f"/api/v1/cotizaciones/{creada['id']}/cambiar_estado/", {"estado": "aceptada"}, format="json",
        )

        self.assertEqual(TratamientoPaciente.objects.filter(paciente=self.paciente).count(), 1)

    def test_consentimientos_solo_se_piden_para_obsequios_que_se_realizan(self):
        plantilla = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Consentimiento limpieza", template_token="consentimiento-limpieza",
        )
        ServicioConsentimiento.objects.create(servicio=self.limpieza, template=plantilla, orden=1)

        def regalo(agendable):
            return {
                "tipo": "procedimiento",
                "procedimiento": str(self.limpieza.id),
                "es_obsequio": True,
                "agendable": agendable,
            }

        informativa = Cotizacion.objects.get(id=self._crear([self._item_pagado(), regalo(False)]).json()["id"])
        agendable = Cotizacion.objects.get(id=self._crear([self._item_pagado(), regalo(True)]).json()["id"])

        self.assertEqual(consentimientos_requeridos_cotizacion(informativa), [])
        self.assertEqual(
            [c["template_token"] for c in consentimientos_requeridos_cotizacion(agendable)],
            ["consentimiento-limpieza"],
        )

    # ── seguimiento clínico (sesión extra del tratamiento) ─────────────────

    def _crear_y_aceptar(self, items, total="700000.00"):
        creada = self._crear(items, total).json()
        response = self.client.post(
            f"/api/v1/cotizaciones/{creada['id']}/cambiar_estado/", {"estado": "aceptada"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return Cotizacion.objects.get(id=creada["id"])

    def test_aceptar_agrega_la_sesion_regalada_al_seguimiento(self):
        cotizacion = self._crear_y_aceptar([self._item_tratamiento(), self._obsequio_clon()])

        seguimiento = TratamientoPaciente.objects.get(paciente=self.paciente)
        sesiones = list(seguimiento.sesiones.order_by("numero", "created_at"))
        self.assertEqual([s.numero for s in sesiones], [1, 2, 3])
        self.assertTrue(all(s.tipo_sesion_id == self.tipo_compromiso.id for s in sesiones))
        regalo = cotizacion.items.get(es_obsequio=True)
        self.assertEqual([s.item_obsequio_id for s in sesiones], [None, None, regalo.id])
        self.assertEqual(sesiones[2].estado, "pendiente")

        detalle = self.client.get(f"/api/v1/protocolos/tratamientos/{seguimiento.id}/").json()
        grupo = detalle["grupos"][0]
        self.assertEqual(grupo["total"], 3)
        self.assertEqual([s["es_obsequio"] for s in grupo["sesiones"]], [False, False, True])
        self.assertEqual(detalle["total_sesiones"], 3)

    def test_obsequio_de_varias_sesiones_continua_la_numeracion(self):
        self._crear_y_aceptar([self._item_tratamiento(), self._obsequio_clon(num_citas=2)])

        seguimiento = TratamientoPaciente.objects.get(paciente=self.paciente)
        self.assertEqual(
            sorted(seguimiento.sesiones.values_list("numero", flat=True)), [1, 2, 3, 4],
        )
        self.assertEqual(seguimiento.sesiones.filter(item_obsequio__isnull=False).count(), 2)
        item = Cotizacion.objects.get(paciente=self.paciente).items.get(tipo="tratamiento")
        self.assertEqual(item.num_sesiones_efectivas(), 4)

    def test_agregar_sesiones_obsequio_es_idempotente(self):
        from apps.protocolos.services import agregar_sesiones_obsequio

        cotizacion = self._crear_y_aceptar([self._item_tratamiento(), self._obsequio_clon()])
        regalo = cotizacion.items.get(es_obsequio=True)

        self.assertEqual(agregar_sesiones_obsequio(regalo), [])
        seguimiento = TratamientoPaciente.objects.get(paciente=self.paciente)
        self.assertEqual(seguimiento.sesiones.count(), 3)

    def test_obsequio_informativo_no_agrega_filas_al_seguimiento(self):
        self._crear_y_aceptar(
            [
                self._item_tratamiento(),
                self._obsequio_clon(agendable=False, tipo_sesion_origen=str(self.tipo_sin_compromiso.id)),
            ]
        )

        seguimiento = TratamientoPaciente.objects.get(paciente=self.paciente)
        self.assertEqual(seguimiento.sesiones.count(), 2)

    def test_se_pueden_agendar_todas_las_sesiones_incluida_la_regalada(self):
        profesional = User.objects.create_user(
            email="prof-obsequios@example.com",
            password="secret123",
            first_name="Ana",
            last_name="Lopez",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
        )
        Sede.objects.filter(pk=self.sede.pk).update(
            horario={dia: ["08:00", "18:00"] for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")},
        )
        cotizacion = self._crear_y_aceptar([self._item_tratamiento(), self._obsequio_clon()])
        item = cotizacion.items.get(tipo="tratamiento")
        seguimiento = TratamientoPaciente.objects.get(paciente=self.paciente)
        fila_regalo = seguimiento.sesiones.get(item_obsequio__isnull=False)

        inicio = timezone.localtime() + timedelta(days=2)
        while inicio.weekday() >= 5:
            inicio += timedelta(days=1)
        inicio = inicio.replace(hour=9, minute=0, second=0, microsecond=0)

        def agendar(hora, **extra):
            return self.client.post(
                "/api/v1/agenda/citas/",
                {
                    "paciente": str(self.paciente.id),
                    "sede": str(self.sede.id),
                    "profesional": str(profesional.id),
                    "fecha_inicio": (inicio + timedelta(hours=hora)).isoformat(),
                    "canal_origen": "presencial",
                    "item_cotizacion": str(item.id),
                    **extra,
                },
                format="json",
            )

        primera = agendar(0)
        segunda = agendar(1)
        tercera = agendar(2, sesion_ejecutada=str(fila_regalo.id))
        cuarta = agendar(3)

        self.assertEqual(primera.status_code, 201, primera.content)
        self.assertEqual(segunda.status_code, 201, segunda.content)
        self.assertEqual(tercera.status_code, 201, tercera.content)
        self.assertEqual(cuarta.status_code, 400)
        self.assertEqual(cuarta.json()["code"], "SIN_SESIONES_DISPONIBLES")
        fila_regalo.refresh_from_db()
        self.assertEqual(str(fila_regalo.cita_id), tercera.json()["id"])
        self.assertEqual(item.citas_restantes(), 0)

    # ── entrega de productos (inventario) ──────────────────────────────────

    def _producto_aceptado(self, cantidad="5", stock="10"):
        if stock is not None:
            StockInsumoSede.objects.create(
                insumo=self.insumo, sede=self.sede, stock_actual=Decimal(stock), costo_promedio=Decimal("1000.00"),
            )
        cotizacion = self._crear_y_aceptar(
            [
                self._item_pagado(),
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": cantidad},
            ],
            total="350000.00",
        )
        return cotizacion, cotizacion.items.get(tipo="insumo")

    def _url_entrega(self, cotizacion, item, accion="entregar_obsequio"):
        return f"/api/v1/cotizaciones/{cotizacion.id}/items/{item.id}/{accion}/"

    def _entregar(self, cotizacion, item, sede=None, client=None):
        return (client or self.client).post(
            self._url_entrega(cotizacion, item), {"sede": str((sede or self.sede).id)}, format="json",
        )

    def _stock(self):
        return StockInsumoSede.objects.get(insumo=self.insumo, sede=self.sede).stock_actual

    def test_detalle_muestra_stock_disponible_antes_de_entregar(self):
        cotizacion, item = self._producto_aceptado(stock="10")

        detalle = self.client.get(f"/api/v1/cotizaciones/{cotizacion.id}/").json()

        producto = next(i for i in detalle["items"] if i["id"] == str(item.id))
        self.assertEqual(Decimal(producto["stock_disponible"]), Decimal("10"))
        self.assertIsNone(producto["entregado_at"])

    def test_entregar_descuenta_stock_y_deja_rastro_en_el_kardex(self):
        cotizacion, item = self._producto_aceptado(cantidad="5", stock="10")

        response = self._entregar(cotizacion, item)

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertIsNotNone(data["entregado_at"])
        self.assertEqual(data["entregado_por_nombre"], self.superadmin.nombre_completo)
        self.assertEqual(data["sede_entrega"], str(self.sede.id))
        self.assertIsNone(data["stock_disponible"])
        self.assertEqual(self._stock(), Decimal("5"))

        item.refresh_from_db()
        movimiento = item.movimiento_entrega
        self.assertEqual(movimiento.origen, MovimientoInventario.OrigenMovimiento.OBSEQUIO)
        self.assertEqual(movimiento.tipo, MovimientoInventario.TipoMovimiento.SALIDA)
        self.assertEqual(movimiento.cantidad, Decimal("5"))
        self.assertEqual(movimiento.costo_unitario, Decimal("1000.00"))
        self.assertEqual(movimiento.referencia_id, cotizacion.id)

        contexto = MovimientoInventarioSerializer(movimiento).data["contexto"]
        self.assertEqual(contexto["tipo"], "obsequio")
        self.assertEqual(contexto["cotizacion_id"], str(cotizacion.id))
        self.assertEqual(contexto["paciente_nombre"], self.paciente.nombre_completo)

    def test_no_se_entrega_dos_veces(self):
        cotizacion, item = self._producto_aceptado()
        self._entregar(cotizacion, item)

        segunda = self._entregar(cotizacion, item)

        self.assertEqual(segunda.status_code, 400)
        self.assertEqual(segunda.json()["code"], "OBSEQUIO_YA_ENTREGADO")
        self.assertEqual(self._stock(), Decimal("5"))
        self.assertEqual(MovimientoInventario.objects.filter(origen="obsequio").count(), 1)

    def test_no_se_entrega_si_la_cotizacion_no_esta_aceptada(self):
        StockInsumoSede.objects.create(insumo=self.insumo, sede=self.sede, stock_actual=Decimal("10"))
        creada = self._crear(
            [self._item_pagado(), {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": "1"}]
        ).json()
        cotizacion = Cotizacion.objects.get(id=creada["id"])

        response = self._entregar(cotizacion, cotizacion.items.get(tipo="insumo"))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COTIZACION_NO_ACEPTADA")
        self.assertEqual(self._stock(), Decimal("10"))

    def test_stock_insuficiente_bloquea_la_entrega_salvo_que_el_insumo_lo_permita(self):
        cotizacion, item = self._producto_aceptado(cantidad="5", stock="2")

        bloqueada = self._entregar(cotizacion, item)

        self.assertEqual(bloqueada.status_code, 400)
        self.assertEqual(bloqueada.json()["code"], "STOCK_INSUFICIENTE")
        item.refresh_from_db()
        self.assertIsNone(item.entregado_at)
        self.assertEqual(self._stock(), Decimal("2"))

        Insumo.objects.filter(pk=self.insumo.pk).update(permite_stock_negativo=True)
        permitida = self._entregar(cotizacion, item)

        self.assertEqual(permitida.status_code, 200, permitida.content)
        self.assertEqual(self._stock(), Decimal("-3"))

    def test_revertir_devuelve_el_stock_y_permite_entregar_de_nuevo(self):
        cotizacion, item = self._producto_aceptado(cantidad="5", stock="10")
        self._entregar(cotizacion, item)

        response = self.client.post(self._url_entrega(cotizacion, item, "revertir_entrega"), {}, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNone(response.json()["entregado_at"])
        self.assertEqual(self._stock(), Decimal("10"))
        item.refresh_from_db()
        self.assertIsNone(item.movimiento_entrega_id)
        ajuste = MovimientoInventario.objects.filter(
            tipo=MovimientoInventario.TipoMovimiento.AJUSTE_POSITIVO, insumo=self.insumo,
        ).get()
        self.assertEqual(ajuste.cantidad, Decimal("5"))
        self.assertIn("obsequio", ajuste.motivo.lower())

        de_nuevo = self._entregar(cotizacion, item)
        self.assertEqual(de_nuevo.status_code, 200, de_nuevo.content)
        self.assertEqual(self._stock(), Decimal("5"))

    def test_revertir_sin_entrega_previa_se_rechaza(self):
        cotizacion, item = self._producto_aceptado()

        response = self.client.post(self._url_entrega(cotizacion, item, "revertir_entrega"), {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "OBSEQUIO_NO_ENTREGADO")

    def test_solo_se_entregan_obsequios_de_producto(self):
        cotizacion = self._crear_y_aceptar(
            [
                self._item_pagado(),
                {"tipo": "libre", "es_obsequio": True, "descripcion": "Consulta", "valor_referencia": "50000"},
            ],
            total="350000.00",
        )
        informativo = cotizacion.items.get(es_obsequio=True)
        pagado = cotizacion.items.get(es_obsequio=False)

        for item in (informativo, pagado):
            response = self._entregar(cotizacion, item)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["code"], "OBSEQUIO_NO_ENTREGABLE")

    def test_sede_de_otra_clinica_se_rechaza(self):
        cotizacion, item = self._producto_aceptado()
        otra = Clinica.objects.create(nombre="Otra clinica", nit="900111000")
        sede_ajena = Sede.objects.create(
            clinica=otra, nombre="Ajena", ciudad="Cali", direccion="Calle 9", telefono="3000000001",
        )

        response = self._entregar(cotizacion, item, sede=sede_ajena)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SEDE_INVALIDA")
        self.assertEqual(self._stock(), Decimal("10"))

    def test_entregar_exige_permiso_de_consumo_de_inventario(self):
        cotizacion, item = self._producto_aceptado()
        recepcion = User.objects.create_user(
            email="recepcion-obsequios@example.com",
            password="secret123",
            first_name="Rita",
            last_name="Recepcion",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        cliente = APIClient()
        cliente.force_authenticate(recepcion)

        response = self._entregar(cotizacion, item, client=cliente)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self._stock(), Decimal("10"))

    # ── documentos (PDF de cotización y compromiso de pago) ────────────────

    def _cotizacion_con_obsequios(self):
        creada = self._crear(
            [
                self._item_pagado(),
                {
                    "tipo": "procedimiento",
                    "procedimiento": str(self.limpieza.id),
                    "es_obsequio": True,
                    "agendable": True,
                },
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": "5.000"},
                {
                    "tipo": "libre",
                    "es_obsequio": True,
                    "descripcion": "Consulta de valoracion",
                    "valor_referencia": "80000.00",
                },
            ]
        ).json()
        return Cotizacion.objects.get(id=creada["id"])

    def test_pdf_de_cotizacion_lista_los_obsequios_aparte_sin_tocar_los_totales(self):
        from apps.cotizaciones.pdf import build_cotizacion_pdf_context, build_cotizacion_pdf_html

        cotizacion = self._cotizacion_con_obsequios()

        contexto = build_cotizacion_pdf_context(cotizacion)

        self.assertEqual([i["descripcion"] for i in contexto["items_servicios"]], ["Toxina"])
        self.assertEqual(
            [(o["descripcion"], o["etiqueta"], o["cantidad"], o["valor_referencia"]) for o in contexto["obsequios"]],
            [
                ("Limpieza facial", "Sesión adicional", "1", "$120,000.00"),
                ("Serum hidratante", "Producto", "5 ml", "$90,000.00"),
                ("Consulta de valoracion", "Cortesía", "1", "$80,000.00"),
            ],
        )
        self.assertEqual(contexto["subtotal_bruto"], "$350,000.00")
        self.assertEqual(contexto["total_descuentos"], "$0.00")
        self.assertEqual(contexto["total"], "$350,000.00")

        html = build_cotizacion_pdf_html(cotizacion)
        self.assertIn("Valor de referencia", html)
        self.assertIn("Serum hidratante", html)
        self.assertIn("5 ml", html)

    def test_pdf_de_cotizacion_sin_obsequios_no_muestra_el_bloque(self):
        from apps.cotizaciones.pdf import build_cotizacion_pdf_context, build_cotizacion_pdf_html

        cotizacion = Cotizacion.objects.get(id=self._crear([self._item_pagado()]).json()["id"])

        self.assertEqual(build_cotizacion_pdf_context(cotizacion)["obsequios"], [])
        self.assertNotIn("Valor de referencia", build_cotizacion_pdf_html(cotizacion))

    def test_compromiso_de_pago_separa_lo_cobrado_de_los_obsequios(self):
        from apps.consentimientos.services import _contexto_merge_cotizacion, renderizar_compromiso_pago_estandar

        cotizacion = self._cotizacion_con_obsequios()

        contexto = _contexto_merge_cotizacion(cotizacion)
        # items_aceptados sigue siendo solo lo que se cobra (también para las
        # plantillas que redactan las clínicas con esa variable).
        self.assertEqual([i["descripcion"] for i in contexto["items_aceptados"]], ["Toxina"])
        self.assertEqual(
            [(o["descripcion"], o["cantidad"]) for o in contexto["obsequios_aceptados"]],
            [("Limpieza facial", "1"), ("Serum hidratante", "5 ml"), ("Consulta de valoracion", "1")],
        )
        self.assertEqual(contexto["costo_total"], Decimal("350000.00"))

        html = renderizar_compromiso_pago_estandar(cotizacion)
        self.assertIn("Obsequios incluidos sin costo", html)
        self.assertIn("Serum hidratante", html)
        self.assertIn("5 ml", html)

    def test_compromiso_de_pago_sin_obsequios_no_cambia(self):
        from apps.consentimientos.services import renderizar_compromiso_pago_estandar

        cotizacion = Cotizacion.objects.get(id=self._crear([self._item_pagado()]).json()["id"])

        html = renderizar_compromiso_pago_estandar(cotizacion)

        self.assertNotIn("Obsequios incluidos sin costo", html)
        self.assertNotIn("Valor de referencia", html)
        self.assertIn("Toxina", html)

    # ── reporte ────────────────────────────────────────────────────────────

    def test_reporte_sin_reagendar_excluye_obsequios_sin_cupo_propio(self):
        creada = self._crear(
            [
                self._item_pagado(),
                {"tipo": "libre", "es_obsequio": True, "descripcion": "Consulta", "valor_referencia": "50000"},
                {"tipo": "insumo", "es_obsequio": True, "insumo": str(self.insumo.id), "cantidad_insumo": "2"},
            ]
        ).json()
        self.client.post(
            f"/api/v1/cotizaciones/{creada['id']}/cambiar_estado/", {"estado": "aceptada"}, format="json",
        )
        # Vieja y sin citas: aparece en el reporte con sus ítems que sí tienen cupo.
        Cotizacion.objects.filter(id=creada["id"]).update(created_at=timezone.now() - timedelta(days=90))

        response = self.client.get("/api/v1/reportes/pacientes-sin-reagendar/")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([fila["tratamiento"] for fila in response.json()], ["Toxina"])
