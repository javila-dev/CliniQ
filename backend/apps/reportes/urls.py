from django.urls import path

from apps.reportes.views import (
    CitasPorProfesionalView,
    ComercialAsesoresView,
    ComercialReporteView,
    CotizacionesReporteView,
    DashboardView,
    EstadoFinancieroView,
    IngresosPorOrigenView,
    IngresosView,
    OcupacionView,
    DeshacerRegularizacionView,
    PaquetesSinMovimientoView,
    RegularizarPaqueteView,
    ServiciosView,
    VendedoresView,
)

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="reportes-dashboard"),
    path("pyl/", EstadoFinancieroView.as_view(), name="reportes-pyl"),
    path("ingresos/", IngresosView.as_view(), name="reportes-ingresos"),
    path("ingresos-por-origen/", IngresosPorOrigenView.as_view(), name="reportes-ingresos-por-origen"),
    path("servicios/", ServiciosView.as_view(), name="reportes-servicios"),
    path("citas-profesional/", CitasPorProfesionalView.as_view(), name="reportes-citas-profesional"),
    path("ocupacion/", OcupacionView.as_view(), name="reportes-ocupacion"),
    path("cotizaciones/", CotizacionesReporteView.as_view(), name="reportes-cotizaciones"),
    path("comercial/", ComercialReporteView.as_view(), name="reportes-comercial"),
    path("comercial/asesores/", ComercialAsesoresView.as_view(), name="reportes-comercial-asesores"),
    path("vendedores/", VendedoresView.as_view(), name="reportes-vendedores"),
    path("paquetes-sin-movimiento/", PaquetesSinMovimientoView.as_view(), name="reportes-paquetes-sin-movimiento"),
    path(
        "paquetes-sin-movimiento/<uuid:item_id>/regularizar/",
        RegularizarPaqueteView.as_view(),
        name="reportes-regularizar-paquete",
    ),
    path(
        "paquetes-sin-movimiento/<uuid:item_id>/regularizar/<uuid:sesion_id>/deshacer/",
        DeshacerRegularizacionView.as_view(),
        name="reportes-deshacer-regularizacion",
    ),
]
