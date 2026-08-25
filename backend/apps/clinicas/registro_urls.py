from django.urls import path
from apps.clinicas.views import RegistroClinicaView, VerificarRegistroClinicaView

urlpatterns = [
    path("", RegistroClinicaView.as_view(), name="registro-clinica"),
    path("verificar/<str:token>/", VerificarRegistroClinicaView.as_view(), name="registro-clinica-verificar"),
]
