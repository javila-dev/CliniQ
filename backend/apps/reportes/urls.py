from django.urls import path

from apps.reportes.views import (
    CotizacionesReporteView,
    DashboardView,
    IngresosView,
    OcupacionView,
    PacientesSinReagendarView,
    ServiciosView,
)

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="reportes-dashboard"),
    path("ingresos/", IngresosView.as_view(), name="reportes-ingresos"),
    path("servicios/", ServiciosView.as_view(), name="reportes-servicios"),
    path("ocupacion/", OcupacionView.as_view(), name="reportes-ocupacion"),
    path("cotizaciones/", CotizacionesReporteView.as_view(), name="reportes-cotizaciones"),
    path("pacientes-sin-reagendar/", PacientesSinReagendarView.as_view(), name="reportes-pacientes-sin-reagendar"),
]
