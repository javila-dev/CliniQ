from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.protocolos.views import SesionProcedimientoViewSet, TratamientoPacienteViewSet


router = DefaultRouter()
router.register("tratamientos", TratamientoPacienteViewSet, basename="protocolos-tratamientos")
router.register("sesiones", SesionProcedimientoViewSet, basename="protocolos-sesiones")

urlpatterns = [
    path("", include(router.urls)),
]
