from django.urls import path

from apps.pacientes.registro_publico import (
    RegistroPublicoClinicaView,
    RegistroPublicoEnrollmentView,
    RegistroPublicoPacienteView,
)


urlpatterns = [
    path("clinica/", RegistroPublicoClinicaView.as_view(), name="registro-publico-clinica"),
    path("pacientes/", RegistroPublicoPacienteView.as_view(), name="registro-publico-pacientes"),
    path("pacientes/<uuid:paciente_id>/enrollment/", RegistroPublicoEnrollmentView.as_view(), name="registro-publico-enrollment"),
]
