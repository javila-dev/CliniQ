from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.agenda.soporte_views import (
    SoporteAtencionesView,
    SoporteCorreccionesView,
    SoporteEliminarAtencionView,
    SoportePacientesView,
    SoportePrevisualizarEliminacionView,
    SoportePrevisualizarTrasladoView,
    SoporteTrasladoAtencionView,
)
from apps.clinicas.views import AdminTenantViewSet, PlanViewSet
from apps.notificaciones.views import (
    AdminWhatsappDarDeBajaView,
    AdminWhatsappNumeroAccionView,
    AdminWhatsappPropioView,
    AdminWhatsappRegistrarInboxView,
)
from apps.users.views import ConsoleUsuarioViewSet

router = DefaultRouter()
router.register("tenants", AdminTenantViewSet, basename="admin-tenants")
router.register("planes", PlanViewSet, basename="admin-planes")
router.register("usuarios", ConsoleUsuarioViewSet, basename="admin-usuarios")

urlpatterns = [
    path("soporte/pacientes/", SoportePacientesView.as_view(), name="admin-soporte-pacientes"),
    path("soporte/atenciones/", SoporteAtencionesView.as_view(), name="admin-soporte-atenciones"),
    path(
        "soporte/trasladar-atencion/previsualizar/",
        SoportePrevisualizarTrasladoView.as_view(),
        name="admin-soporte-trasladar-previsualizar",
    ),
    path("soporte/trasladar-atencion/", SoporteTrasladoAtencionView.as_view(), name="admin-soporte-trasladar"),
    path(
        "soporte/eliminar-atencion/previsualizar/",
        SoportePrevisualizarEliminacionView.as_view(),
        name="admin-soporte-eliminar-previsualizar",
    ),
    path("soporte/eliminar-atencion/", SoporteEliminarAtencionView.as_view(), name="admin-soporte-eliminar"),
    path("soporte/correcciones/", SoporteCorreccionesView.as_view(), name="admin-soporte-correcciones"),
    path("tenants/<uuid:clinica_id>/whatsapp-propio/", AdminWhatsappPropioView.as_view(), name="admin-whatsapp-propio"),
    path(
        "tenants/<uuid:clinica_id>/whatsapp-propio/registrar-inbox/",
        AdminWhatsappRegistrarInboxView.as_view(),
        name="admin-whatsapp-registrar-inbox",
    ),
    path(
        "whatsapp-numeros/<uuid:pk>/crear-plantillas/",
        AdminWhatsappNumeroAccionView.as_view(accion="crear_plantillas"),
        name="admin-whatsapp-crear-plantillas",
    ),
    path(
        "whatsapp-numeros/<uuid:pk>/actualizar-plantillas/",
        AdminWhatsappNumeroAccionView.as_view(accion="actualizar_plantillas"),
        name="admin-whatsapp-actualizar-plantillas",
    ),
    path(
        "whatsapp-numeros/<uuid:pk>/revisar-salud/",
        AdminWhatsappNumeroAccionView.as_view(accion="revisar_salud"),
        name="admin-whatsapp-revisar-salud",
    ),
    path(
        "whatsapp-numeros/<uuid:pk>/dar-de-baja/",
        AdminWhatsappDarDeBajaView.as_view(),
        name="admin-whatsapp-dar-de-baja",
    ),
    *router.urls,
]
