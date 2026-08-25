from django.db import models as django_models
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.permissions import IsAdminOrProfesional
from .models import (
    AntecedentesObesidad,
    MedicionAntropometrica,
    ObjetivoObesidad,
    ResultadoLaboratorio,
    TratamientoFarmacologico,
)
from .serializers import (
    AntecedentesObesidadSerializer,
    MedicionAntropometricaSerializer,
    ObjetivoObesidadSerializer,
    ProgresoObesidadSerializer,
    ResultadoLaboratorioSerializer,
    TratamientoFarmacologicoSerializer,
)


def _clinica_id(request):
    return request.user.clinica_id


class AntecedentesObesidadViewSet(
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Antecedentes de obesidad — uno por historia clínica.
    GET  /obesidad/antecedentes/{historia_id}/
    POST /obesidad/antecedentes/
    PATCH /obesidad/antecedentes/{historia_id}/
    """

    serializer_class = AntecedentesObesidadSerializer
    lookup_field = "historia_id"

    def get_permissions(self):
        return [IsAdminOrProfesional()]

    def get_queryset(self):
        qs = AntecedentesObesidad.objects.select_related("historia__clinica")
        if self.request.user.rol != "superadmin":
            qs = qs.filter(historia__clinica_id=_clinica_id(self.request))
        return qs


class ObjetivoObesidadViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Objetivo de peso — filtrar por ?paciente=<uuid>
    GET  /obesidad/objetivos/?paciente=<uuid>
    POST /obesidad/objetivos/
    PATCH /obesidad/objetivos/{id}/
    """

    serializer_class = ObjetivoObesidadSerializer

    def get_permissions(self):
        return [IsAdminOrProfesional()]

    def get_queryset(self):
        qs = ObjetivoObesidad.objects.select_related("paciente")
        if self.request.user.rol != "superadmin":
            qs = qs.filter(paciente__clinica_id=_clinica_id(self.request))
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            qs = qs.filter(paciente_id=paciente_id)
        return qs


class MedicionAntropometricaViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Mediciones — filtrar por ?paciente=<uuid>
    GET  /obesidad/mediciones/?paciente=<uuid>
    POST /obesidad/mediciones/
    GET  /obesidad/mediciones/{id}/
    """

    serializer_class = MedicionAntropometricaSerializer

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = MedicionAntropometrica.objects.select_related(
            "paciente", "tomado_por", "nota"
        )
        if self.request.user.rol != "superadmin":
            qs = qs.filter(paciente__clinica_id=_clinica_id(self.request))
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            qs = qs.filter(paciente_id=paciente_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tomado_por=self.request.user)

    @action(detail=False, methods=["get"], url_path="progreso")
    def progreso(self, request):
        """
        GET /obesidad/mediciones/progreso/?paciente=<uuid>
        Retorna series temporales para gráficas + objetivo activo + farmacológico vigente.
        """
        paciente_id = request.query_params.get("paciente")
        if not paciente_id:
            return Response({"error": "Parámetro 'paciente' requerido.", "code": "MISSING_PARAM"}, status=400)

        clinica_filter = {} if request.user.rol == "superadmin" else {"paciente__clinica_id": _clinica_id(request)}

        mediciones = (
            MedicionAntropometrica.objects
            .filter(paciente_id=paciente_id, activo=True, **clinica_filter)
            .order_by("fecha")
        )
        objetivo = (
            ObjetivoObesidad.objects
            .filter(paciente_id=paciente_id, activo=True, **clinica_filter)
            .order_by("-fecha_inicio")
            .first()
        )
        farmacologico = (
            TratamientoFarmacologico.objects
            .filter(paciente_id=paciente_id, activo=True, **clinica_filter)
            .order_by("-fecha_inicio")
        )

        data = {
            "objetivo":      objetivo,
            "mediciones":    mediciones,
            "farmacologico": farmacologico,
        }
        serializer = ProgresoObesidadSerializer(data, context={"request": request})
        return Response(serializer.data)


class ResultadoLaboratorioViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Resultados de laboratorio.
    GET  /obesidad/laboratorios/?paciente=<uuid>
    POST /obesidad/laboratorios/   (multipart para subir PDF)
    GET  /obesidad/laboratorios/{id}/
    PATCH /obesidad/laboratorios/{id}/
    """

    serializer_class = ResultadoLaboratorioSerializer

    def get_permissions(self):
        return [IsAdminOrProfesional()]

    def get_queryset(self):
        qs = ResultadoLaboratorio.objects.select_related("paciente", "registrado_por")
        if self.request.user.rol != "superadmin":
            qs = qs.filter(paciente__clinica_id=_clinica_id(self.request))
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            qs = qs.filter(paciente_id=paciente_id)
        tipo = self.request.query_params.get("tipo")
        if tipo:
            qs = qs.filter(tipo=tipo)
        return qs

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


class TratamientoFarmacologicoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Prescripciones farmacológicas.
    GET  /obesidad/farmacologico/?paciente=<uuid>&vigente=true
    POST /obesidad/farmacologico/
    PATCH /obesidad/farmacologico/{id}/
    """

    serializer_class = TratamientoFarmacologicoSerializer

    def get_permissions(self):
        return [IsAdminOrProfesional()]

    def get_queryset(self):
        from datetime import date
        qs = TratamientoFarmacologico.objects.select_related(
            "paciente", "indicado_por", "nota"
        )
        if self.request.user.rol != "superadmin":
            qs = qs.filter(paciente__clinica_id=_clinica_id(self.request))
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            qs = qs.filter(paciente_id=paciente_id)
        if self.request.query_params.get("vigente", "").lower() == "true":
            qs = qs.filter(activo=True).filter(
                django_models.Q(fecha_fin__isnull=True) | django_models.Q(fecha_fin__gte=date.today())
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(indicado_por=self.request.user)
