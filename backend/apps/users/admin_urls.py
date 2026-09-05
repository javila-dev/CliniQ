from rest_framework.routers import DefaultRouter
from django.urls import path

from apps.users.views import CapacidadListView, PermisoListView, RolViewSet, UserViewSet

router = DefaultRouter()
router.register("roles", RolViewSet, basename="roles")
router.register("", UserViewSet, basename="usuarios")

urlpatterns = [
    path("permisos/", PermisoListView.as_view(), name="permisos-list"),
    path("capacidades/", CapacidadListView.as_view(), name="capacidades-list"),
] + router.urls
