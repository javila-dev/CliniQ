from rest_framework.routers import DefaultRouter

from apps.proveedores.views import OrdenCompraViewSet, ProveedorViewSet


router = DefaultRouter()
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("ordenes-compra", OrdenCompraViewSet, basename="orden-compra")

urlpatterns = router.urls
