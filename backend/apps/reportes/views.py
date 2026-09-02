from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.db.models import Case, Count, DecimalField, ExpressionWrapper, F, Max, OuterRef, Q, Subquery, Sum, When
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agenda.models import Cita
from apps.caja.models import GastoCaja
from apps.clinicas.models import Sede
from apps.cobros.models import Cobro, ItemCobro, PagoRecibido
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.inventario.models import Insumo
from apps.users.authorization import user_has_permission
from apps.users.permissions import RequirePermission, get_clinica_activa


def _clinica_scope(user):
    """Returns a dict of filter kwargs to scope querysets to the user's clinica."""
    if user.rol == "superadmin":
        return {}
    return {"sede__clinica": user.clinica}


def _cita_clinica_scope(user):
    if user.rol == "superadmin":
        return {}
    return {"sede__clinica": user.clinica}


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
        sede_id = request.query_params.get("sede_id")
        fecha = _parse_date(request.query_params.get("fecha"), date.today())

        # Rango opcional: si llega `fecha_inicio`/`fecha_fin`, los agregados de
        # citas y cobros abarcan ese periodo en vez de un solo día. Las claves de
        # la respuesta (`citas_hoy`, `cobros_hoy`) se conservan por compatibilidad.
        rango_ini_raw = request.query_params.get("fecha_inicio")
        rango_fin_raw = request.query_params.get("fecha_fin")
        usar_rango = bool(rango_ini_raw or rango_fin_raw)
        rango_ini = _parse_date(rango_ini_raw, date.today())
        rango_fin = _parse_date(rango_fin_raw, date.today())

        cita_qs = Cita.objects.filter(**_cita_clinica_scope(user))
        if sede_id:
            cita_qs = cita_qs.filter(sede_id=sede_id)

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

        if user_has_permission(user, "reportes.ver_financieros", request=request):
            # Los datos previos cargados por el asistente de puesta en marcha no
            # son ingresos del periodo.
            cobro_qs = Cobro.objects.filter(**_clinica_scope(user)).exclude(es_migracion=True)
            if sede_id:
                cobro_qs = cobro_qs.filter(sede_id=sede_id)

            if usar_rango:
                cobros_hoy_qs = cobro_qs.filter(
                    fecha__date__gte=rango_ini,
                    fecha__date__lte=rango_fin,
                ).exclude(estado="anulado")
            else:
                cobros_hoy_qs = cobro_qs.filter(fecha__date=fecha).exclude(estado="anulado")
            cobros_agg = cobros_hoy_qs.aggregate(
                total_cop=Sum("total"),
                pagados=Count("id", filter=Q(estado="pagado")),
                pendientes=Count("id", filter=Q(estado__in=["pendiente", "pagado_parcial"])),
            )
            por_medio = (
                PagoRecibido.objects.filter(cobro__in=cobros_hoy_qs)
                .values("medio_pago")
                .annotate(total=Sum("valor"))
                .order_by("medio_pago")
            )

            fecha_inicio_semana = fecha - timedelta(days=6)
            ingresos_semana_qs = (
                cobro_qs.filter(fecha__date__gte=fecha_inicio_semana, fecha__date__lte=fecha)
                .exclude(estado="anulado")
                .annotate(dia=TruncDate("fecha"))
                .values("dia")
                .annotate(total=Sum("total"))
                .order_by("dia")
            )
            totales_por_dia = {row["dia"]: row["total"] for row in ingresos_semana_qs}
            ingresos_semana = []
            for i in range(7):
                d = fecha_inicio_semana + timedelta(days=i)
                ingresos_semana.append({"fecha": str(d), "total": str(totales_por_dia.get(d, "0.00"))})

            payload["cobros_hoy"] = {
                "total_cop": str(cobros_agg["total_cop"] or "0.00"),
                "pagados": cobros_agg["pagados"],
                "pendientes": cobros_agg["pendientes"],
                "por_medio_pago": [
                    {"medio": row["medio_pago"], "total": str(row["total"])}
                    for row in por_medio
                ],
            }
            payload["ingresos_semana"] = ingresos_semana

        return Response(payload)


class IngresosView(APIView):
    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        user = request.user
        sede_id = request.query_params.get("sede_id")
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy - timedelta(days=29))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)
        agrupar_por = request.query_params.get("agrupar_por", "dia")

        trunc_fn = {"semana": TruncWeek, "mes": TruncMonth}.get(agrupar_por, TruncDate)
        periodo_format = {"semana": "%G-W%V", "mes": "%Y-%m"}.get(agrupar_por)

        cobro_qs = Cobro.objects.filter(
            fecha__date__gte=fecha_inicio,
            fecha__date__lte=fecha_fin,
            **_clinica_scope(user),
        ).exclude(estado="anulado").exclude(es_migracion=True)

        if sede_id:
            cobro_qs = cobro_qs.filter(sede_id=sede_id)

        cobros_por_periodo = (
            cobro_qs.annotate(periodo=trunc_fn("fecha"))
            .values("periodo")
            .annotate(total_cobros=Sum("total"))
            .order_by("periodo")
        )
        gastos_map = {}
        if _table_exists(GastoCaja._meta.db_table):
            gasto_qs = GastoCaja.objects.filter(
                fecha__gte=fecha_inicio,
                fecha__lte=fecha_fin,
                **_clinica_scope(user),
            )
            if sede_id:
                gasto_qs = gasto_qs.filter(sede_id=sede_id)

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
                "periodo": fmt_periodo(row["periodo"]),
                "total_cobros": str(row["total_cobros"] or "0.00"),
                "total_gastos": str(gastos_map.get(row["periodo"], "0.00")),
            }
            for row in cobros_por_periodo
        ]
        return Response(resultado)


class ServiciosView(APIView):
    permission_classes = (RequirePermission("reportes.ver_financieros"),)

    def get(self, request: Request):
        user = request.user
        sede_id = request.query_params.get("sede_id")
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)

        scope = _clinica_scope(user)
        cobro_filter = Q(
            cobro__fecha__date__gte=fecha_inicio,
            cobro__fecha__date__lte=fecha_fin,
        ) & ~Q(cobro__estado="anulado")
        if scope:
            cobro_filter &= Q(**{f"cobro__{k}": v for k, v in scope.items()})
        if sede_id:
            cobro_filter &= Q(cobro__sede_id=sede_id)

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
        if sede_id:
            insumo_filter &= Q(cobro__sede_id=sede_id)

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
        sede_id = request.query_params.get("sede_id")

        qs = Cotizacion.objects.filter(
            created_at__date__gte=fecha_inicio,
            created_at__date__lte=fecha_fin,
            activo=True,
        )
        if user.rol != "superadmin":
            qs = qs.filter(clinica=user.clinica)
        if sede_id:
            qs = qs.filter(sede_id=sede_id)

        agg = qs.aggregate(
            total_mes=Count("id"),
            aceptadas_mes=Count("id", filter=Q(estado=Cotizacion.Estado.ACEPTADA)),
        )
        total = agg["total_mes"] or 0
        aceptadas = agg["aceptadas_mes"] or 0
        tasa = (aceptadas / total * 100) if total else 0

        return Response({
            "total_mes": total,
            "aceptadas_mes": aceptadas,
            "tasa_conversion_pct": f"{tasa:.2f}",
        })


class PacientesSinReagendarView(APIView):
    permission_classes = (RequirePermission("reportes.ver_operativos"),)

    def get(self, request: Request):
        user = request.user
        sede_id = request.query_params.get("sede_id")
        try:
            dias_minimos = int(request.query_params.get("dias_minimos", 30))
        except (ValueError, TypeError):
            dias_minimos = 30

        hoy = timezone.localdate()
        corte = hoy - timedelta(days=dias_minimos)

        ultima_cita_qs = (
            Cita.objects.filter(
                item_cotizacion=OuterRef("pk"),
                estado__in=["completada", "pendiente", "confirmada", "en_curso", "en_espera"],
            )
            .order_by("-fecha_inicio")
            .values("fecha_inicio__date")[:1]
        )

        items = (
            ItemCotizacion.objects.filter(
                activo=True,
                cotizacion__estado=Cotizacion.Estado.ACEPTADA,
                cotizacion__activo=True,
            )
            .annotate(ultima_cita_fecha=Subquery(ultima_cita_qs))
            .annotate(
                citas_no_canceladas=Count(
                    "citas",
                    filter=~Q(citas__estado="cancelada"),
                )
            )
        )

        if user.rol != "superadmin":
            items = items.filter(cotizacion__clinica=user.clinica)
        if sede_id:
            items = items.filter(cotizacion__sede_id=sede_id)

        items = items.select_related("cotizacion__paciente")

        resultado = []
        for item in items:
            citas_restantes = max(0, item.num_citas - item.citas_no_canceladas)
            if citas_restantes == 0:
                continue

            ultima_cita = item.ultima_cita_fecha
            if ultima_cita is not None:
                if ultima_cita > corte:
                    continue
                dias_sin_agendar = (hoy - ultima_cita).days
            else:
                fecha_ref = item.cotizacion.created_at.date()
                if fecha_ref > corte:
                    continue
                dias_sin_agendar = (hoy - fecha_ref).days

            paciente = item.cotizacion.paciente
            resultado.append({
                "paciente_id": str(paciente.id),
                "paciente_nombre": paciente.nombre_completo,
                "ultima_cita": str(ultima_cita) if ultima_cita else None,
                "dias_sin_agendar": dias_sin_agendar,
                "cotizacion_id": str(item.cotizacion_id),
                "tratamiento": item.descripcion,
                "sesiones_pendientes": citas_restantes,
            })

        resultado.sort(key=lambda r: r["dias_sin_agendar"], reverse=True)
        return Response(resultado)


class OcupacionView(APIView):
    permission_classes = (RequirePermission("reportes.ver_operativos"),)

    def get(self, request: Request):
        user = request.user
        sede_id = request.query_params.get("sede_id")
        hoy = date.today()
        fecha_inicio = _parse_date(request.query_params.get("fecha_inicio"), hoy.replace(day=1))
        fecha_fin = _parse_date(request.query_params.get("fecha_fin"), hoy)

        cita_qs = Cita.objects.filter(
            fecha_inicio__date__gte=fecha_inicio,
            fecha_inicio__date__lte=fecha_fin,
            **_cita_clinica_scope(user),
        )
        if sede_id:
            cita_qs = cita_qs.filter(sede_id=sede_id)

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

        # Scope de clínica: la activa (header X-Active-Clinica para superadmin;
        # user.clinica para el resto). None solo si es superadmin sin clínica
        # seleccionada -> sin filtro (comportamiento global de siempre).
        clinica = get_clinica_activa(request)

        dias = (fin - inicio).days + 1
        prev_fin = inicio - timedelta(days=1)
        prev_inicio = prev_fin - timedelta(days=dias - 1)

        actual = self._bloque(clinica, inicio, fin, sede_id)
        anterior = self._bloque(clinica, prev_inicio, prev_fin, sede_id)

        payload = {
            "periodo": {"inicio": str(inicio), "fin": str(fin), "dias": dias},
            "actual": self._fmt(actual),
            "anterior": self._fmt(anterior),
            "variacion_pct": {k: _var_pct(actual[k], anterior[k]) for k in self._CAMPOS_VAR},
        }

        if not sede_id:
            payload["por_sede"] = self._por_sede(clinica, inicio, fin)

        return Response(payload)

    def _bloque(self, clinica, inicio, fin, sede_id):
        scope = {"sede__clinica": clinica} if clinica else {}

        cobro_qs = (
            Cobro.objects.filter(fecha__date__gte=inicio, fecha__date__lte=fin, **scope)
            .exclude(estado="anulado")
            .exclude(es_migracion=True)
        )
        if sede_id:
            cobro_qs = cobro_qs.filter(sede_id=sede_id)

        ingresos_facturado = cobro_qs.aggregate(s=Sum("total"))["s"] or Decimal("0")
        ingresos_recaudado = (
            PagoRecibido.objects.filter(
                cobro__in=cobro_qs, fecha__date__gte=inicio, fecha__date__lte=fin
            ).aggregate(s=Sum("valor"))["s"]
            or Decimal("0")
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
            if sede_id:
                gasto_qs = gasto_qs.filter(sede_id=sede_id)
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

    def _por_sede(self, clinica, inicio, fin):
        sedes = Sede.objects.filter(activo=True)
        if clinica is not None:
            sedes = sedes.filter(clinica=clinica)
        resultado = []
        for sede in sedes.order_by("nombre"):
            b = self._bloque(clinica, inicio, fin, str(sede.id))
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
