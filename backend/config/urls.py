from django.contrib import admin
from django.urls import include, path

from apps.historia_clinica.webhooks import DocumensoWebhookView


api_urlpatterns = [
    path("auth/", include("apps.users.urls")),
    path("usuarios/", include("apps.users.admin_urls")),
    path("clinicas/", include("apps.clinicas.urls")),
    path("colaboradores/", include("apps.colaboradores.urls")),
    path("pacientes/", include("apps.pacientes.urls")),
    path("agenda/", include("apps.agenda.urls")),
    path("historia-clinica/", include("apps.historia_clinica.urls")),
    path("consentimientos/", include("apps.consentimientos.urls")),
    path("configuracion/", include("apps.configuracion.urls")),
    path("cobros/", include("apps.cobros.urls")),
    path("cartera/", include("apps.cartera.urls")),
    path("inventario/", include("apps.inventario.urls")),
    path("proveedores/", include("apps.proveedores.urls")),
    path("comisiones/", include("apps.comisiones.urls")),
    path("cotizaciones/", include("apps.cotizaciones.urls")),
    path("protocolos/", include("apps.protocolos.urls")),
    path("notificaciones/", include("apps.notificaciones.urls")),
    path("caja/", include("apps.caja.urls")),
    path("reportes/", include("apps.reportes.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("webhooks/documenso/", DocumensoWebhookView.as_view(), name="webhook-documenso"),
    path("api/v1/", include(api_urlpatterns)),
]
