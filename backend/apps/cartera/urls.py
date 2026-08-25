from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.cartera.views import CarteraViewSet, CuotaCarteraViewSet


router = DefaultRouter()
router.register("", CarteraViewSet, basename="cartera")

urlpatterns = [
    *router.urls,
    path(
        "cuotas/<uuid:pk>/",
        CuotaCarteraViewSet.as_view({"patch": "partial_update"}),
        name="cartera-cuota-detail",
    ),
    path(
        "cuotas/<uuid:pk>/registrar_pago/",
        CuotaCarteraViewSet.as_view({"patch": "registrar_pago"}),
        name="cartera-cuota-registrar-pago",
    ),
    path(
        "cuotas/<uuid:pk>/aprobar_excepcion/",
        CuotaCarteraViewSet.as_view({"post": "aprobar_excepcion"}),
        name="cartera-cuota-aprobar-excepcion",
    ),
]
