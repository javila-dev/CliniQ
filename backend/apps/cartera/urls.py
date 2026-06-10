from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.cartera.views import CarteraViewSet, CuotaCarteraViewSet


router = DefaultRouter()
router.register("", CarteraViewSet, basename="cartera")

urlpatterns = [
    *router.urls,
    path(
        "cuotas/<uuid:pk>/registrar_pago/",
        CuotaCarteraViewSet.as_view({"patch": "registrar_pago"}),
        name="cartera-cuota-registrar-pago",
    ),
]
