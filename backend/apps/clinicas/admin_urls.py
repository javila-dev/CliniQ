from rest_framework.routers import DefaultRouter

from apps.clinicas.views import AdminTenantViewSet, PlanViewSet

router = DefaultRouter()
router.register("tenants", AdminTenantViewSet, basename="admin-tenants")
router.register("planes", PlanViewSet, basename="admin-planes")

urlpatterns = router.urls
