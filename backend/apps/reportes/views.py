from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.db.models import (
    Avg,
    Case,
    Count,
    DecimalField,
    DurationField,
    ExpressionWrapper,
    F,
    Max,
    Min,
    Q,
    Sum,
    When,
)
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agenda.models import Cita
from apps.caja.models import GastoCaja
from apps.cartera.models import Cartera
from apps.clinicas.models import Sede
from apps.cobros.models import Cobro, ItemCobro, PagoRecibido
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.inventario.models import Insumo
from apps.notificaciones.services import uso_whatsapp_mes_actual
from apps.users.authorization import (
    get_user_permission_keys,
    sede_ids_para_filtro,
    user_has_permission,
    user_sede_ids_acotadas,
)
from apps.users.models import User
from apps.users.permissions import RequirePermission, get_clinica_activa


def _clinica_activa_o_propia(user, request):
    """El superadmin que opera una clínica ve solo esa (antes veía todas, M6-24);
    sin clínica activa, ve todas. El resto, su clínica."""
    if user.rol == "superadmin":
        return get_clinica_activa(request) if request is not None else None
    return user.clinica


def _clinica_scope(user, request=None):
    """Returns a dict of filter kwargs to scope querysets to the user's clinica."""
    clinica = _clinica_activa_o_propia(user, request)
    if clinica is None and user.rol == "superadmin":
        return {}
    return {"sede__clinica": clinica}


def _pagos_del_periodo(cobro_qs, desde, hasta):
    """Pagos recibidos entre `desde` y `hasta` (por la fecha del pago).

    `cobro_qs` NO debe venir filtrado por la fecha del cobro: el cobro de una
    cotización acumula todas las cuotas y su fecha es la del último abono, así que
    filtrarlo por fecha sumaba también las cuotas de meses anteriores.
    """
    return PagoRecibido.objects.filter(
        cobro__in=cobro_qs, fecha__date__gte=desde, fecha__date__lte=hasta,
    ).exclude(es_migracion=True)


def _facturado(cobro_qs, desde, hasta):
    """Lo vendido en el periodo: cobros de cita o libres por su fecha, más los
    abonos de cotización por la fecha de cada pago (ese cobro no tiene total
    propio: es la suma de los abonos)."""
    directos = (
        cobro_qs.exclude(origen=Cobro.Origen.COTIZACION)
        .filter(fecha__date__gte=desde, fecha__date__lte=hasta)
        .aggregate(s=Sum("total"))["s"]
        or Decimal("0")
    )
    abonos = (
        _pagos_del_periodo(cobro_qs.filter(origen=Cobro.Origen.COTIZACION), desde, hasta)
        .aggregate(s=Sum("valor"))["s"]
        or Decimal("0")
    )
    return Decimal(directos) + Decimal(abonos)


def _cita_clinica_scope(user, request=None):
    clinica = _clinica_activa_o_propia(user, request)
    if clinica is None and user.rol == "superadmin":
        return {}
    return {"sede__clinica": clinica}


def _parse_date(value, default):
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        return default


def _table_exists(table_name: str) -> bool:
    return table_name in connection.introspection.table_names()


def _money(value) -> str:
    return f"{Decimal(value or 0):.2f}"


def _vendedor_ids(request) -> list[str]:
    """IDs de `vendedores` (lista separada por comas). Vacío = todos."""
    raw = request.query_params.get("vendedores") or ""
    return [v for v in (x.strip() for x in raw.split(",")) if v]


def _var_pct(actual, anterior):
    """Variación % de `actual` vs `anterior`. None si no hay base de comparación."""
    actual = Decimal(actual or 0)
    anterior = Decimal(anterior or 0)
    if anterior == 0:
        return None
    return f"{((actual - anterior) / abs(anterior) * 100):.1f}"


class DashboardView(APIView):
    permission_classes = (RequirePermission("reportes.ver_operativos"),)

    def get(self, request: Request):
        user = request.user
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede_id"))
        fecha = _parse_date(request.query_params.get("fecha"), date.today())

        # Rango opcional: si llega `fecha_inicio`/`fecha_fin`, los agregados de
        # citas y cobros abarcan ese periodo en vez de un solo día. Las claves de
        # la respuesta (`citas_hoy`, `cobros_hoy`) se conservan por compatibilidad.
        rango_ini_raw = request.query_params.get("fecha_inicio")
        rango_fin_raw = request.query_params.get("fecha_fin")
        usar_rango = bool(rango_ini_raw or rango_fin_raw)
        rango_ini = _parse_date(rango_ini_raw, date.today())
        rango_fin = _parse_date(rango_fin_raw, date.today())

        cita_qs = Cita.objects.filter(**_cita_clinica_scope(user, request))
        if sede_ids is not None:
            cita_qs = cita_qs.filter(sede_id__in=sede_ids)

        # Citas del día (o del rango solicitado)
        if usar_rango:
            citas_hoy_qs = cita_qs.filter(
                fecha_inicio__date__gte=rango_ini,
                fecha_inicio__date__lte=rango_fin,
            )
        else:
            citas_hoy_qs = cita_qs.filter(fecha_inicio__date=fecha)
        estados = citas_hoy_qs.aggregate(
            total=Count("id"),
            pendientes=Count("id", filter=Q(estado="pendiente")),
            confirmadas=Count("id", filter=Q(estado="confirmada")),
            en_curso=Count("id", filter=Q(estado="en_curso")),
            completadas=Count("id", filter=Q(estado="completada")),
            canceladas=Count("id", filter=Q(estado="cancelada")),
            no_asistio=Count("id", filter=Q(estado="no_asistio")),
        )

        payload = {
            "citas_hoy": {
                "total": estados["total"],
                "pendientes": estados["pendientes"],
                "confirmadas": estados["confirmadas"],
                "en_curso": estados["en_curso"],
                "completadas": estados["completadas"],
                "canceladas": estados["canceladas"],
                "no_asistio": estados["no_asistio"],
            },
        }

        clinica_activa = get_clinica_activa(request)
        if clinica_activa is not None:
            uso = uso_whatsapp_mes_actual(clinica_activa)
            payload["whatsapp_uso"] = {
                "envios_realizados": uso["envios_realizados"],
                "envios_incluidos": uso["envios_incluidos"],
                # Solo tiene sentido "cerca del limite" con paquete finito; "sin
                # limite" (0) nunca dispara el aviso.
                "cerca_del_limite": (
                    not uso["sin_limite"]
                    and uso["envios_incluidos"] > 0
                    and uso["envios_realizados"] >= 0.8 * uso["envios_incluidos"]
                ),
            }

        if user_has_permission(user, "reportes.ver_financieros", request=request):
            # Los datos previos cargados por el asistente de puesta en marcha no
            # son ingresos del periodo.
            cobro_qs = Cobro.objects.filter(**_clinica_scope(user, request)).exclude(es_migracion=True)
            if sede_ids is not None:
                cobro_qs = cobro_qs.filter(sede_id__in=sede_ids)

            cobro_qs = cobro_qs.exclude(estado="anulado")
            desde, hasta = (rango_ini, rango_fin) if usar_rango else (fecha, fecha)
            cobros_hoy_qs = cobro_qs.filter(fecha__date__gte=desde, fecha__date__lte=hasta)
            cobros_agg = cobros_hoy_qs.aggregate(
                pagados=Count("id", filter=Q(estado="pagado")),
                pendientes=Count("id", filter=Q(estado__in=["pendiente", "pagado_parcial"])),
            )
            # "Ingresos hoy" y el desglose por medio son el dinero recibido en el
            # periodo (por la fecha del pago), así el total cuadra con sus filas.
            pagos_periodo = _pagos_del_periodo(cobro_qs, desde, hasta)
            total_recibido = pagos_periodo.aggregate(s=Sum("valor"))["s"] or Decimal("0")
            por_medio = (
                pagos_periodo
                .values("medio_pago__nombre")
                .annotate(total=Sum("valor"))
                .order_by("medio_pago__nombre")
            )

            fecha_inicio_semana = fecha - timedelta(days=6)
            ingresos_semana_qs = (
                _pagos_del_periodo(cobro_qs, fecha_inicio_semana, fecha)
                .annotate(dia=TruncDate("fecha"))
                .values("dia")
                .annotate(total=Sum("valor"))
                .order_by("dia")
            )
            totales_por_dia = {row["dia"]: row["total"] for row in ingresos_semana_qs}
            ingresos_semana = []
            for i in range(7):
                d = fecha_inicio_semana + timedelta(days=i)
                ingresos_semana.append({"fecha": str(d), "total": str(totales_por_dia.get(d, "0.00"))})

            payload["cobros_hoy"] = {
                "total_cop": f"{Decimal(total_recibido):.2f}",
                "pagados": cobros_agg["pagados"],
                "pendientes": cobros_agg["pendientes"],
                "por_medio_pago": [
                    {"medio": row["medio_pago__nombre"], "total": str(row["total"])}
                    for row in por_medio
                ],
            }
            payload["ingresos_semana"] = ingresos_semana

        return Response(payload)


class IngresosView(APIView):
    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        user = request.user
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede_id"))
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy - timedelta(days=29))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        agrupar_por = request.query_params.get("agrupar_por", "dia")

        trunc_fn = {"semana": TruncWeek, "mes": TruncMonth}.get(agrupar_por, TruncDate)
        periodo_format = {"semana": "%G-W%V", "mes": "%Y-%m"}.get(agrupar_por)

        cobro_qs = (
            Cobro.objects.filter(**_clinica_scope(user, request)).exclude(estado="anulado").exclude(es_migracion=True)
        )
        if sede_ids is not None:
            cobro_qs = cobro_qs.filter(sede_id__in=sede_ids)

        # Dinero recibido por periodo (fecha del pago): comparable con los gastos.
        cobros_map = {
            row["periodo"]: row["total_cobros"]
            for row in _pagos_del_periodo(cobro_qs, fecha_inicio, fecha_fin)
            .annotate(periodo=trunc_fn("fecha"))
            .values("periodo")
            .annotate(total_cobros=Sum("valor"))
        }
        gastos_map = {}
        if _table_exists(GastoCaja._meta.db_table):
            gasto_qs = GastoCaja.objects.filter(
                fecha__gte=fecha_inicio,
                fecha__lte=fecha_fin,
                **_clinica_scope(user, request),
            )
            if sede_ids is not None:
                gasto_qs = gasto_qs.filter(sede_id__in=sede_ids)

            gastos_por_periodo = (
                gasto_qs.annotate(periodo=trunc_fn("fecha"))
                .values("periodo")
                .annotate(total_gastos=Sum("valor"))
                .order_by("periodo")
            )
            gastos_map = {row["periodo"]: row["total_gastos"] for row in gastos_por_periodo}

        def fmt_periodo(d):
            if d is None:
                return ""
            if periodo_format:
                return d.strftime(periodo_format)
            return str(d.date()) if hasattr(d, "date") else str(d)

        resultado = [
            {
                "periodo": fmt_periodo(periodo),
                "total_cobros": str(total or "0.00"),
                "total_gastos": str(gastos_map.get(periodo, "0.00")),
            }
            for periodo, total in sorted(cobros_map.items(), key=lambda kv: kv[0])
        ]
        return Response(resultado)


ORIGENES_INGRESO = ("citas", "ventas", "cartera", "otros")


def _origen_del_pago(origen_cobro, fecha_pago, aceptada_en):
    """De dónde viene un pago: cita, venta (al cerrar), cuota de cartera u otro.

    Los pagos de una cotización van todos al mismo cobro. Lo pagado hasta el día
    en que se aceptó es el cierre de la venta; lo posterior, cuotas de cartera.
    """
    if origen_cobro == Cobro.Origen.CITA:
        return "citas"
    if origen_cobro == Cobro.Origen.COTIZACION:
        if aceptada_en is not None and fecha_pago <= timezone.localdate(aceptada_en):
            return "ventas"
        return "cartera"
    return "otros"


class IngresosPorOrigenView(APIView):
    """Dinero recibido por día y por origen, más el total del periodo anterior.

    Solo pagos registrados en CliniQ (no gastos: no son la contabilidad de la
    clínica). El dashboard lo dibuja acumulado y por secciones.
    """

    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        user = request.user
        sede_ids = sede_ids_para_filtro(user, request.query_params.get("sede_id"))
        hoy = timezone.localdate()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        if fecha_fin < fecha_inicio or (fecha_fin - fecha_inicio).days > 400:
            return Response({"error": "Rango de fechas invalido.", "code": "FECHA_INVALIDA"}, status=400)

        cobro_qs = (
            Cobro.objects.filter(**_clinica_scope(user, request))
            .exclude(estado=Cobro.Estado.ANULADO)
            .exclude(es_migracion=True)
        )
        if sede_ids is not None:
            cobro_qs = cobro_qs.filter(sede_id__in=sede_ids)

        dias = (fecha_fin - fecha_inicio).days + 1
        por_dia = {
            fecha_inicio + timedelta(days=i): dict.fromkeys(ORIGENES_INGRESO, Decimal("0"))
            for i in range(dias)
        }
        pagos = _pagos_del_periodo(cobro_qs, fecha_inicio, fecha_fin).values_list(
            "fecha", "valor", "cobro__origen", "cobro__cotizacion__aceptada_en",
        )
        for fecha, valor, origen, aceptada_en in pagos:
            dia = timezone.localdate(fecha)
            if dia in por_dia:
                por_dia[dia][_origen_del_pago(origen, dia, aceptada_en)] += valor

        totales = dict.fromkeys(ORIGENES_INGRESO, Decimal("0"))
        for valores in por_dia.values():
            for origen, valor in valores.items():
                totales[origen] += valor

        # Rango con el que comparar: el que pida la pantalla (p. ej. el mes pasado
        # hasta el mismo día) o, por defecto, los mismos días justo antes.
        anterior_fin = fecha_inicio - timedelta(days=1)
        anterior_inicio = anterior_fin - timedelta(days=dias - 1)
        anterior_inicio = _parse_date(request.query_params.get("comparar_inicio"), anterior_inicio)
        anterior_fin = _parse_date(request.query_params.get("comparar_fin"), anterior_fin)
        total_anterior = (
            _pagos_del_periodo(cobro_qs, anterior_inicio, anterior_fin).aggregate(s=Sum("valor"))["s"]
            or Decimal("0")
        )

        return Response({
            "fecha_inicio": fecha_inicio.isoformat(),
            "fecha_fin": fecha_fin.isoformat(),
            "serie": [
                {"fecha": dia.isoformat(), **{origen: _money(v) for origen, v in valores.items()}}
                for dia, valores in sorted(por_dia.items())
            ],
            "totales": {**{origen: _money(v) for origen, v in totales.items()}, "total": _money(sum(totales.values()))},
            "anterior": {
                "fecha_inicio": anterior_inicio.isoformat(),
                "fecha_fin": anterior_fin.isoformat(),
                "total": _money(total_anterior),
            },
        })


class ServiciosView(APIView):
    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        user = request.user
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede_id"))
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)

        scope = _clinica_scope(user, request)
        cobro_filter = Q(
            cobro__fecha__date__gte=fecha_inicio,
            cobro__fecha__date__lte=fecha_fin,
        ) & ~Q(cobro__estado="anulado")
        if scope:
            cobro_filter &= Q(**{f"cobro__{k}": v for k, v in scope.items()})
        if sede_ids is not None:
            cobro_filter &= Q(cobro__sede_id__in=sede_ids)

        servicios_qs = (
            ItemCobro.objects.filter(cobro_filter, tipo="servicio")
            .values("servicio_id", "servicio__nombre")
            .annotate(
                cantidad_citas=Count("cobro_id", distinct=True),
                ingresos=Sum("subtotal"),
            )
            .order_by("-ingresos")
        )

        # Costo de insumos de los mismos cobros, agrupado por cobro -> servicio vía cita
        insumo_filter = Q(
            cobro__fecha__date__gte=fecha_inicio,
            cobro__fecha__date__lte=fecha_fin,
            tipo__in=["insumo_consumo"],
        ) & ~Q(cobro__estado="anulado")
        if scope:
            insumo_filter &= Q(**{f"cobro__{k}": v for k, v in scope.items()})
        if sede_ids is not None:
            insumo_filter &= Q(cobro__sede_id__in=sede_ids)

        costo_por_cobro = (
            ItemCobro.objects.filter(insumo_filter)
            .annotate(
                costo=ExpressionWrapper(
                    F("costo_unitario") * F("cantidad"),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )
            .values("cobro_id")
            .annotate(costo_cobro=Sum("costo"))
        )
        costo_map = {row["cobro_id"]: row["costo_cobro"] for row in costo_por_cobro}

        servicio_cobros = (
            ItemCobro.objects.filter(cobro_filter, tipo="servicio")
            .values("servicio_id", "cobro_id")
        )
        costo_por_servicio: dict = {}
        for row in servicio_cobros:
            sid = row["servicio_id"]
            costo_por_servicio[sid] = costo_por_servicio.get(sid, 0) + costo_map.get(row["cobro_id"], 0)

        resultado = []
        for row in servicios_qs:
            ingresos = row["ingresos"] or 0
            costo = costo_por_servicio.get(row["servicio_id"], 0)
            margen = ingresos - costo
            margen_pct = (margen / ingresos * 100) if ingresos else 0
            resultado.append({
                "servicio_nombre": row["servicio__nombre"],
                "cantidad_citas": row["cantidad_citas"],
                "ingresos": str(round(ingresos, 2)),
                "costo_insumos": str(round(costo, 2)),
                "margen": str(round(margen, 2)),
                "margen_pct": str(round(margen_pct, 2)),
            })
        return Response(resultado)


class CotizacionesReporteView(APIView):
    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        user = request.user
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede_id"))

        qs = Cotizacion.objects.filter(
            created_at__date__gte=fecha_inicio,
            created_at__date__lte=fecha_fin,
            activo=True,
        )
        if user.rol != "superadmin":
            qs = qs.filter(clinica=user.clinica)
        if sede_ids is not None:
            qs = qs.filter(sede_id__in=sede_ids)
        vendedor_ids = _vendedor_ids(request)
        if vendedor_ids:
            qs = qs.filter(profesional_id__in=vendedor_ids)

        agg = qs.aggregate(
            total_mes=Count("id"),
            aceptadas_mes=Count("id", filter=Q(estado=Cotizacion.Estado.ACEPTADA)),
        )
        total = agg["total_mes"] or 0
        aceptadas = agg["aceptadas_mes"] or 0
        tasa = (aceptadas / total * 100) if total else 0

        # Ventas del periodo: valor de las cotizaciones aceptadas, por fecha de
        # aceptación (= creación de la cartera), no por fecha de la cotización.
        # Los saldos cargados por migración no son venta nueva.
        ventas_qs = Cartera.objects.filter(
            created_at__date__gte=fecha_inicio,
            created_at__date__lte=fecha_fin,
            activo=True,
            cotizacion__activo=True,
        ).exclude(es_migracion=True)
        if user.rol != "superadmin":
            ventas_qs = ventas_qs.filter(cotizacion__clinica=user.clinica)
        if sede_ids is not None:
            ventas_qs = ventas_qs.filter(cotizacion__sede_id__in=sede_ids)
        if vendedor_ids:
            ventas_qs = ventas_qs.filter(cotizacion__profesional_id__in=vendedor_ids)
        ventas = ventas_qs.aggregate(
            valor=Sum(ExpressionWrapper(
                F("total") + F("cotizacion__valor_perdonado"), output_field=DecimalField(max_digits=14, decimal_places=2),
            )),
            cantidad=Count("id"),
        )

        return Response({
            "total_mes": total,
            "aceptadas_mes": aceptadas,
            "tasa_conversion_pct": f"{tasa:.2f}",
            "ventas_valor": _money(ventas["valor"]),
            "ventas_cantidad": ventas["cantidad"] or 0,
        })


_ITEM_SUBTOTAL = ExpressionWrapper(
    F("num_citas") * F("valor_unitario") * (Decimal("1") - F("descuento_porcentaje") / Decimal("100")),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)


# Valor vendido de una cotización aceptada: el total de su cartera más lo que se
# perdonó al terminarla (terminar una venta baja el total de la cartera para que
# el saldo quede en cero, pero lo vendido no cambia; docs/plan-terminacion-ventas.md).
_VALOR_VENDIDO = ExpressionWrapper(
    F("cartera__total") + F("valor_perdonado"), output_field=DecimalField(max_digits=14, decimal_places=2),
)


def _valor_cotizaciones(cotizaciones_qs) -> Decimal:
    """Suma de los ítems cobrables (sin obsequios) de esas cotizaciones."""
    return ItemCotizacion.objects.filter(
        cotizacion__in=cotizaciones_qs.values("pk"), activo=True, es_obsequio=False,
    ).aggregate(v=Sum(_ITEM_SUBTOTAL))["v"] or Decimal("0")


def _serie_comercial(base, fecha_inicio, fecha_fin):
    """Cotizado vs vendido por periodo, para el gráfico del dashboard.

    El tamaño del periodo depende del rango: días hasta 2 semanas, semanas hasta
    3 meses y meses después. Cotizado va por fecha de creación (valor de los
    ítems cobrables) y vendido por fecha de aceptación (total de la cartera),
    igual que los KPI. Los periodos sin datos van en cero.
    """
    dias = (fecha_fin - fecha_inicio).days + 1
    if dias <= 14:
        granularidad, trunc = "dia", TruncDate
    elif dias <= 92:
        granularidad, trunc = "semana", TruncWeek
    else:
        granularidad, trunc = "mes", TruncMonth

    def clave(valor):
        return valor.date() if hasattr(valor, "date") and callable(valor.date) else valor

    cotizado = (
        ItemCotizacion.objects.filter(
            cotizacion__in=base.filter(created_at__date__gte=fecha_inicio, created_at__date__lte=fecha_fin).values("pk"),
            activo=True, es_obsequio=False,
        )
        .annotate(p=trunc("cotizacion__created_at"))
        .values("p")
        .annotate(valor=Sum(_ITEM_SUBTOTAL), cantidad=Count("cotizacion", distinct=True))
    )
    vendido = (
        base.filter(
            estado=Cotizacion.Estado.ACEPTADA,
            aceptada_en__date__gte=fecha_inicio, aceptada_en__date__lte=fecha_fin,
        )
        .annotate(p=trunc("aceptada_en"))
        .values("p")
        .annotate(valor=Sum(_VALOR_VENDIDO), cantidad=Count("id"))
    )
    filas = {}

    def fila(periodo):
        return filas.setdefault(clave(periodo), {
            "cotizado_valor": Decimal("0"), "cotizadas": 0, "vendido_valor": Decimal("0"), "vendidas": 0,
        })

    for r in cotizado:
        f = fila(r["p"])
        f["cotizado_valor"] += r["valor"] or 0
        f["cotizadas"] += r["cantidad"]
    for r in vendido:
        f = fila(r["p"])
        f["vendido_valor"] += r["valor"] or 0
        f["vendidas"] += r["cantidad"]

    # Todos los periodos del rango, aunque estén vacíos.
    inicio = fecha_inicio
    if granularidad == "semana":
        inicio = fecha_inicio - timedelta(days=fecha_inicio.weekday())
    elif granularidad == "mes":
        inicio = fecha_inicio.replace(day=1)
    periodos, actual = [], inicio
    while actual <= fecha_fin:
        periodos.append(actual)
        if granularidad == "dia":
            actual += timedelta(days=1)
        elif granularidad == "semana":
            actual += timedelta(days=7)
        else:
            actual = (actual.replace(day=28) + timedelta(days=4)).replace(day=1)

    vacio = {"cotizado_valor": Decimal("0"), "cotizadas": 0, "vendido_valor": Decimal("0"), "vendidas": 0}
    serie = []
    for periodo in periodos:
        f = filas.get(periodo, vacio)
        serie.append({
            "periodo": periodo.isoformat(),
            "cotizado_valor": _money(f["cotizado_valor"]),
            "cotizadas": f["cotizadas"],
            "vendido_valor": _money(f["vendido_valor"]),
            "vendidas": f["vendidas"],
        })
    return granularidad, serie


class ComercialReporteView(APIView):
    """KPI de cotizaciones y ventas por separado (docs/plan-funnel-comercial.md).

    Cada métrica usa su propia fecha: creadas por ``created_at``, enviadas por
    el primer envío, perdidas por ``descartada_en`` o por vencimiento, y
    vendidas por ``aceptada_en``. Los datos previos migrados no cuentan.
    """

    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        from apps.cotizaciones.models import con_estado_comercial, filtrar_estado_comercial

        user = request.user
        hoy = timezone.localdate()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        sede_ids = sede_ids_para_filtro(user, request.query_params.get("sede_id"))

        base = Cotizacion.objects.filter(activo=True, es_migracion=False)
        if user.rol != "superadmin":
            base = base.filter(clinica=user.clinica)
        if sede_ids is not None:
            base = base.filter(sede_id__in=sede_ids)
        vendedor_ids = _vendedor_ids(request)
        if vendedor_ids:
            base = base.filter(profesional_id__in=vendedor_ids)
        base = con_estado_comercial(base)

        def en_periodo(campo):
            return {f"{campo}__gte": fecha_inicio, f"{campo}__lte": fecha_fin}

        creadas = base.filter(**en_periodo("created_at__date"))
        enviadas = base.annotate(primer_envio=Min("envios__created_at")).filter(**en_periodo("primer_envio__date"))
        abiertas = filtrar_estado_comercial(base, "borrador")

        descartadas = base.filter(estado=Cotizacion.Estado.DESCARTADA, **en_periodo("descartada_en__date"))
        # Vencidas en el periodo: la vigencia terminó dentro del rango (y ya pasó).
        vencidas = filtrar_estado_comercial(base, "vencida").filter(
            _fecha_vencimiento__gte=fecha_inicio, _fecha_vencimiento__lte=fecha_fin,
        )
        motivo_principal = (
            descartadas.exclude(motivo_descarte="")
            .values("motivo_descarte")
            .annotate(n=Count("id"))
            .order_by("-n")
            .first()
        )

        vendidas = base.filter(estado=Cotizacion.Estado.ACEPTADA, **en_periodo("aceptada_en__date"))
        ventas = vendidas.aggregate(
            valor=Sum(_VALOR_VENDIDO),
            cantidad=Count("id"),
            dias_cierre=Avg(ExpressionWrapper(F("aceptada_en") - F("created_at"), output_field=DurationField())),
        )

        granularidad, serie = _serie_comercial(base, fecha_inicio, fecha_fin)

        ganadas = ventas["cantidad"] or 0
        perdidas = descartadas.count()
        n_vencidas = vencidas.count()
        dias_cierre = ventas["dias_cierre"]

        # Tasa de cierre por cohorte: de las cotizaciones creadas en el periodo,
        # cuántas ya se vendieron (sin importar cuándo). Cuadra con "creadas";
        # el periodo en curso sube a medida que se cierran las que siguen abiertas.
        n_creadas = creadas.count()
        creadas_vendidas = creadas.filter(estado=Cotizacion.Estado.ACEPTADA).count()
        creadas_abiertas = filtrar_estado_comercial(creadas, "borrador").count()
        tasa_cierre = (creadas_vendidas / n_creadas * 100) if n_creadas else 0

        return Response({
            "periodo": {"desde": fecha_inicio.isoformat(), "hasta": fecha_fin.isoformat()},
            "cotizaciones": {
                "creadas": n_creadas,
                "creadas_valor": _money(_valor_cotizaciones(creadas)),
                "enviadas": enviadas.count(),
                "abiertas": abiertas.count(),
                "abiertas_valor": _money(_valor_cotizaciones(abiertas)),
                "perdidas": perdidas + n_vencidas,
                "descartadas": perdidas,
                "vencidas": n_vencidas,
                "motivo_principal": motivo_principal["motivo_descarte"] if motivo_principal else None,
            },
            "ventas": {
                "valor": _money(ventas["valor"]),
                "cantidad": ganadas,
                "tasa_cierre_pct": f"{tasa_cierre:.2f}",
                # Base de la tasa: las creadas en el periodo ya vendidas y las que siguen abiertas.
                "creadas_vendidas": creadas_vendidas,
                "creadas_abiertas": creadas_abiertas,
                "dias_promedio_cierre": round(dias_cierre.total_seconds() / 86400, 1) if dias_cierre else None,
            },
            "granularidad": granularidad,
            "serie": serie,
        })


class ComercialAsesoresView(APIView):
    """Cotizaciones y ventas por asesor, en tabla (pedido de una gerente, 2026-11-14).

    El asesor es quien creó la cotización (``profesional``), igual que el filtro
    de vendedores. Mismas reglas que ``ComercialReporteView`` para que los
    totales cuadren con el dashboard: creadas por ``created_at``, vendidas por
    ``aceptada_en``, valor vendido = cartera + lo perdonado al terminar, tasa de
    cierre por cohorte (de las creadas en el periodo, cuántas ya se vendieron) y
    sin los datos previos migrados. ``?tratamiento=id1,id2`` deja solo las
    cotizaciones con esos tratamientos o procedimientos (el valor sigue siendo
    el de la cotización completa).
    """

    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        from apps.cotizaciones.ventas import filtrar_por_catalogo, ids_catalogo

        hoy = timezone.localdate()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        periodo = {"desde": fecha_inicio.isoformat(), "hasta": fecha_fin.isoformat()}
        clinica = get_clinica_activa(request)
        if clinica is None:
            return Response({"periodo": periodo, "asesores": [], "totales": _fila_asesor(None, "Total", True, {}, {})})

        base = Cotizacion.objects.filter(clinica=clinica, activo=True, es_migracion=False)
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede_id"))
        if sede_ids is not None:
            base = base.filter(sede_id__in=sede_ids)
        base = filtrar_por_catalogo(base, ids_catalogo(request.query_params))

        creadas = base.filter(created_at__date__gte=fecha_inicio, created_at__date__lte=fecha_fin)
        vendidas = base.filter(
            estado=Cotizacion.Estado.ACEPTADA, aceptada_en__date__gte=fecha_inicio, aceptada_en__date__lte=fecha_fin,
        )
        dias = Avg(ExpressionWrapper(F("aceptada_en") - F("created_at"), output_field=DurationField()))

        def cotizado(qs, por_asesor):
            items = ItemCotizacion.objects.filter(cotizacion__in=qs.values("pk"), activo=True, es_obsequio=False)
            if por_asesor:
                return {
                    r["cotizacion__profesional_id"]: r["v"]
                    for r in items.values("cotizacion__profesional_id").annotate(v=Sum(_ITEM_SUBTOTAL))
                }
            return items.aggregate(v=Sum(_ITEM_SUBTOTAL))["v"]

        conteo_creadas = {"n": Count("id"), "vendidas": Count("id", filter=Q(estado=Cotizacion.Estado.ACEPTADA))}

        por_asesor = {}
        valor_creadas = cotizado(creadas, True)
        for r in creadas.values("profesional_id").annotate(**conteo_creadas):
            por_asesor.setdefault(r["profesional_id"], [{}, {}])[0] = {**r, "valor": valor_creadas.get(r["profesional_id"])}
        for r in vendidas.values("profesional_id").annotate(n=Count("id"), valor=Sum(_VALOR_VENDIDO), dias=dias):
            por_asesor.setdefault(r["profesional_id"], [{}, {}])[1] = r

        usuarios = {u.id: u for u in User.objects.filter(pk__in=[k for k in por_asesor if k])}
        filas = []
        for asesor_id, (c, v) in por_asesor.items():
            usuario = usuarios.get(asesor_id)
            nombre = usuario.nombre_completo if usuario else "Sin asesor"
            fila = _fila_asesor(asesor_id, nombre, usuario.is_active if usuario else True, c, v)
            # Para distinguir a dos usuarios con el mismo nombre.
            fila["email"] = usuario.email if usuario else None
            filas.append(fila)
        filas.sort(key=lambda f: (-Decimal(f["ventas"]["valor"]), f["nombre"].lower()))

        totales_c = {**creadas.aggregate(**conteo_creadas), "valor": cotizado(creadas, False)}
        totales_v = vendidas.aggregate(n=Count("id"), valor=Sum(_VALOR_VENDIDO), dias=dias)
        return Response({
            "periodo": periodo,
            "asesores": filas,
            "totales": _fila_asesor(None, "Total", True, totales_c, totales_v),
        })


def _fila_asesor(asesor_id, nombre, activo, creadas: dict, vendidas: dict) -> dict:
    n_creadas = creadas.get("n") or 0
    n_ventas = vendidas.get("n") or 0
    valor_ventas = Decimal(vendidas.get("valor") or 0)
    creadas_vendidas = creadas.get("vendidas") or 0
    dias = vendidas.get("dias")
    return {
        "asesor_id": str(asesor_id) if asesor_id else None,
        "nombre": nombre,
        "activo": activo,
        "cotizaciones": {"cantidad": n_creadas, "valor": _money(creadas.get("valor"))},
        "ventas": {
            "cantidad": n_ventas,
            "valor": _money(valor_ventas),
            "ticket_promedio": _money(valor_ventas / n_ventas) if n_ventas else None,
            "dias_promedio_cierre": round(dias.total_seconds() / 86400, 1) if dias else None,
        },
        # De las creadas en el periodo, cuántas ya se vendieron (cohorte).
        "creadas_vendidas": creadas_vendidas,
        "tasa_cierre_pct": f"{(creadas_vendidas / n_creadas * 100):.2f}" if n_creadas else None,
    }


class VendedoresView(APIView):
    """Usuarios por los que se puede filtrar el reporte de ventas.

    Quienes pueden elaborar cotizaciones (``cotizaciones.gestionar``) más
    quienes figuren como profesional de alguna cotización de la clínica, para
    no perder ventas de usuarios a los que luego se les quitó el permiso.
    """

    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        clinica = get_clinica_activa(request)
        if clinica is None:
            return Response([])

        usuarios = (
            User.objects.filter(clinica=clinica)
            .exclude(rol="superadmin")
            .select_related("rol_dinamico")
        )
        con_cotizaciones = set(
            Cotizacion.objects.filter(clinica=clinica, activo=True)
            .exclude(profesional_id=None)
            .values_list("profesional_id", flat=True)
            .distinct()
        )
        resultado = [
            {"id": str(u.id), "nombre": u.nombre_completo, "activo": u.is_active}
            for u in usuarios
            if u.id in con_cotizaciones
            or (u.is_active and "cotizaciones.gestionar" in get_user_permission_keys(u))
        ]
        resultado.sort(key=lambda v: v["nombre"].lower())
        return Response(resultado)


class PaquetesSinMovimientoView(APIView):
    """Paquetes vendidos o importados que no se están atendiendo en la app
    (ver ``reportes.paquetes``), con el resumen por responsable y por sede."""

    permission_classes = (RequirePermission("reportes.ver_operativos"),)

    def get(self, request: Request):
        from apps.reportes.paquetes import DIAS_POR_DEFECTO, paquetes_sin_movimiento

        clinica = get_clinica_activa(request)
        params = request.query_params
        try:
            dias = max(0, int(params.get("dias", DIAS_POR_DEFECTO)))
        except (ValueError, TypeError):
            dias = DIAS_POR_DEFECTO
        if clinica is None:
            return Response({
                "dias": dias, "totales": {
                    "activos": 0, "sin_movimiento": 0, "nunca_agendados": 0, "sesiones_pendientes": 0,
                    "registradas_despues": 0,
                },
                "por_responsable": [], "por_sede": [], "paquetes": [],
            })
        origen = params.get("origen")
        return Response(paquetes_sin_movimiento(
            clinica,
            sede_ids=sede_ids_para_filtro(request.user, params.get("sede_id")),
            dias=dias,
            responsable=params.get("responsable") or None,
            origen=origen if origen in ("venta", "importado") else None,
        ))


class RegularizarPaqueteView(APIView):
    """Registrar las sesiones de un paquete que se hicieron por fuera de la app
    (ver ``reportes.regularizacion``). GET: sesiones pendientes y registradas;
    POST ``{"sesiones": [...]}``: las marca como hechas."""

    permission_classes = (RequirePermission("reportes.paquetes.regularizar"),)

    def _ejecutar(self, request, funcion, *args, **kwargs):
        from apps.reportes.regularizacion import RegularizacionError

        clinica = get_clinica_activa(request)
        if clinica is None:
            return Response({"error": "Elige una clínica.", "code": "SIN_CLINICA"}, status=400)
        try:
            data = funcion(
                clinica, *args, usuario=request.user, sede_ids=sede_ids_para_filtro(request.user), request=request,
                **kwargs,
            )
        except RegularizacionError as exc:
            return Response({"error": exc.mensaje, "code": exc.code, **exc.extra}, status=exc.status)
        return Response(data)

    def get(self, request: Request, item_id):
        from apps.reportes.regularizacion import estado

        return self._ejecutar(request, estado, item_id)

    def post(self, request: Request, item_id):
        from apps.reportes.regularizacion import registrar

        filas = request.data.get("sesiones")
        if not isinstance(filas, list) or not all(isinstance(f, dict) for f in filas):
            return Response({"error": "Elige al menos una sesión.", "code": "SIN_SESIONES"}, status=400)
        return self._ejecutar(request, registrar, item_id, filas)


class DeshacerRegularizacionView(RegularizarPaqueteView):
    """POST ``{"motivo": ...}``: la sesión registrada después vuelve a pendiente."""

    def get(self, request, *args, **kwargs):
        return Response(status=405)

    def post(self, request: Request, item_id, sesion_id):
        from apps.reportes.regularizacion import deshacer

        return self._ejecutar(request, deshacer, item_id, sesion_id, motivo=request.data.get("motivo"))


class OcupacionView(APIView):
    permission_classes = (RequirePermission("reportes.ver_operativos"),)

    def get(self, request: Request):
        user = request.user
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede_id"))
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)

        cita_qs = Cita.objects.filter(
            fecha_inicio__date__gte=fecha_inicio,
            fecha_inicio__date__lte=fecha_fin,
            **_cita_clinica_scope(user, request),
        )
        if sede_ids is not None:
            cita_qs = cita_qs.filter(sede_id__in=sede_ids)

        rows = (
            cita_qs.values("profesional_id", "profesional__first_name", "profesional__last_name")
            .annotate(
                total_citas=Count("id"),
                completadas=Count("id", filter=Q(estado="completada")),
                canceladas=Count("id", filter=Q(estado="cancelada")),
                no_asistio=Count("id", filter=Q(estado="no_asistio")),
            )
            .order_by("-total_citas")
        )

        resultado = []
        for row in rows:
            total = row["total_citas"]
            completadas = row["completadas"]
            tasa = (completadas / total * 100) if total else 0
            nombre = f"{row['profesional__first_name']} {row['profesional__last_name']}".strip()
            resultado.append({
                "profesional_id": str(row["profesional_id"]),
                "profesional_nombre": nombre,
                "total_citas": total,
                "completadas": completadas,
                "canceladas": row["canceladas"],
                "no_asistio": row["no_asistio"],
                "tasa_completadas_pct": str(round(tasa, 2)),
            })
        return Response(resultado)


class EstadoFinancieroView(APIView):
    """P&L simple del periodo: Facturado - Costo insumos - Gastos = Margen,
    con comparativo vs el periodo anterior de igual duración y desglose por sede."""

    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    _CAMPOS_VAR = ("ingresos_facturado", "costo_insumos", "gastos_operativos", "margen")

    def get(self, request: Request):
        hoy = date.today()
        fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        if inicio > fin:
            inicio, fin = fin, inicio
        sede_id = request.query_params.get("sede_id")
        sede_ids = sede_ids_para_filtro(request.user, sede_id)

        # Scope de clínica: la activa (header X-Active-Clinica para superadmin;
        # user.clinica para el resto). None solo si es superadmin sin clínica
        # seleccionada -> sin filtro (comportamiento global de siempre).
        clinica = get_clinica_activa(request)

        dias = (fin - inicio).days + 1
        prev_fin = inicio - timedelta(days=1)
        prev_inicio = prev_fin - timedelta(days=dias - 1)

        actual = self._bloque(clinica, inicio, fin, sede_ids)
        anterior = self._bloque(clinica, prev_inicio, prev_fin, sede_ids)

        payload = {
            "periodo": {"inicio": str(inicio), "fin": str(fin), "dias": dias},
            "actual": self._fmt(actual),
            "anterior": self._fmt(anterior),
            "variacion_pct": {k: _var_pct(actual[k], anterior[k]) for k in self._CAMPOS_VAR},
        }

        if not sede_id:
            payload["por_sede"] = self._por_sede(clinica, inicio, fin, request.user)

        return Response(payload)

    def _bloque(self, clinica, inicio, fin, sede_ids):
        scope = {"sede__clinica": clinica} if clinica else {}

        base_qs = Cobro.objects.filter(**scope).exclude(estado="anulado").exclude(es_migracion=True)
        if sede_ids is not None:
            base_qs = base_qs.filter(sede_id__in=sede_ids)
        cobro_qs = base_qs.filter(fecha__date__gte=inicio, fecha__date__lte=fin)

        ingresos_facturado = _facturado(base_qs, inicio, fin)
        ingresos_recaudado = (
            _pagos_del_periodo(base_qs, inicio, fin).aggregate(s=Sum("valor"))["s"] or Decimal("0")
        )
        costo_insumos = (
            ItemCobro.objects.filter(cobro__in=cobro_qs, tipo="insumo_consumo")
            .annotate(
                c=ExpressionWrapper(
                    F("costo_unitario") * F("cantidad"),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )
            .aggregate(s=Sum("c"))["s"]
            or Decimal("0")
        )
        gastos_operativos = Decimal("0")
        if _table_exists(GastoCaja._meta.db_table):
            gasto_qs = GastoCaja.objects.filter(
                fecha__gte=inicio, fecha__lte=fin, **scope
            )
            if sede_ids is not None:
                gasto_qs = gasto_qs.filter(sede_id__in=sede_ids)
            gastos_operativos = gasto_qs.aggregate(s=Sum("valor"))["s"] or Decimal("0")

        margen = Decimal(ingresos_facturado) - Decimal(costo_insumos) - Decimal(gastos_operativos)
        margen_pct = (margen / ingresos_facturado * 100) if ingresos_facturado else Decimal("0")

        return {
            "ingresos_facturado": Decimal(ingresos_facturado),
            "ingresos_recaudado": Decimal(ingresos_recaudado),
            "costo_insumos": Decimal(costo_insumos),
            "gastos_operativos": Decimal(gastos_operativos),
            "margen": margen,
            "margen_pct": f"{margen_pct:.2f}",
        }

    @staticmethod
    def _fmt(bloque):
        return {
            k: (v if k == "margen_pct" else _money(v))
            for k, v in bloque.items()
        }

    def _por_sede(self, clinica, inicio, fin, user):
        sedes = Sede.objects.filter(activo=True)
        if clinica is not None:
            sedes = sedes.filter(clinica=clinica)
        acotadas = user_sede_ids_acotadas(user)
        if acotadas is not None:
            sedes = sedes.filter(id__in=acotadas)
        resultado = []
        for sede in sedes.order_by("nombre"):
            b = self._bloque(clinica, inicio, fin, [sede.id])
            resultado.append({
                "sede_id": str(sede.id),
                "sede_nombre": sede.nombre,
                "ingresos_facturado": _money(b["ingresos_facturado"]),
                "costo_insumos": _money(b["costo_insumos"]),
                "gastos_operativos": _money(b["gastos_operativos"]),
                "margen": _money(b["margen"]),
                "margen_pct": b["margen_pct"],
            })
        return resultado
