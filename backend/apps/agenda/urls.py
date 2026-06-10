from django.urls import path
from rest_framework.routers import DefaultRouter
from apps.agenda.views import BloqueoAgendaViewSet, CitaViewSet, ConfirmacionPublicaView


router = DefaultRouter()
router.register("citas", CitaViewSet, basename="citas")
router.register("bloqueos", BloqueoAgendaViewSet, basename="bloqueos")

urlpatterns = router.urls + [
    path("confirmar/<str:token>/", ConfirmacionPublicaView.as_view(), name="agenda-confirmar"),
]
