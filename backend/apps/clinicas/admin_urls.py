from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.clinicas.views import AdminTenantViewSet, PlanViewSet
from apps.notificaciones.views import AdminWhatsappNumeroAccionView, AdminWhatsappPropioView
from apps.users.views import ConsoleUsuarioViewSet

router = DefaultRouter()
router.register("tenants", AdminTenantViewSet, basename="admin-tenants")
router.register("planes", PlanViewSet, basename="admin-planes")
router.register("usuarios", ConsoleUsuarioViewSet, basename="admin-usuarios")

urlpatterns = [
    path("tenants/<uuid:clinica_id>/whatsapp-propio/", AdminWhatsappPropioView.as_view(), name="admin-whatsapp-propio"),
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
    *router.urls,
]
