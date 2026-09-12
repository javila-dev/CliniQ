from rest_framework.routers import DefaultRouter

from apps.clinicas.views import AdminTenantViewSet, PlanViewSet
from apps.users.views import ConsoleUsuarioViewSet

router = DefaultRouter()
router.register("tenants", AdminTenantViewSet, basename="admin-tenants")
router.register("planes", PlanViewSet, basename="admin-planes")
router.register("usuarios", ConsoleUsuarioViewSet, basename="admin-usuarios")

urlpatterns = router.urls
