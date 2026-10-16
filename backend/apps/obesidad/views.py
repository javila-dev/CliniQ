from django.db import models as django_models
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.historia_clinica.autoria import exigir_documentable
from apps.users.authorization import atiende_solo_lo_propio
from apps.users.permissions import IsAdminOrProfesional, RequirePermission
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
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Mediciones — filtrar por ?paciente=<uuid>
    GET    /obesidad/mediciones/?paciente=<uuid>
    POST   /obesidad/mediciones/
    GET    /obesidad/mediciones/{id}/
    PATCH  /obesidad/mediciones/{id}/   — editar la medición de la sesión
    DELETE /obesidad/mediciones/{id}/   — borrado lógico (activo=False)
    """

    serializer_class = MedicionAntropometricaSerializer

    def get_permissions(self):
        # Leer exige ver la historia; registrar o editar, ser quien atiende (antes
        # bastaba con estar logueado, incluso para borrar mediciones).
        if self.action in {"list", "retrieve", "progreso"}:
            return [RequirePermission("historia.ver")()]
        return [IsAdminOrProfesional()]

    def get_queryset(self):
        qs = MedicionAntropometrica.objects.select_related(
            "paciente", "tomado_por", "nota"
        ).filter(activo=True)
        if self.request.user.rol != "superadmin":
            qs = qs.filter(paciente__clinica_id=_clinica_id(self.request))
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            qs = qs.filter(paciente_id=paciente_id)
        return qs

    def perform_create(self, serializer):
        nota = serializer.validated_data.get("nota")
        if nota is not None:
            exigir_documentable(self.request.user, nota)
        serializer.save(tomado_por=self.request.user)

    def _exigir_que_sea_suya(self, instance):
        """Quien atiende edita o borra solo las mediciones que tomó (o las de su
        atención); el admin, cualquiera (AT-02)."""
        user = self.request.user
        if not atiende_solo_lo_propio(user) or instance.tomado_por_id == user.id:
            return
        if instance.nota_id:
            exigir_documentable(user, instance.nota, en_borrador=False)
            return
        raise PermissionDenied("Solo puedes modificar las mediciones que tomaste tú.")

    def perform_update(self, serializer):
        # No se reasigna tomado_por: la medición sigue perteneciendo a quien la abrió.
        self._exigir_que_sea_suya(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._exigir_que_sea_suya(instance)
        instance.activo = False
        instance.save(update_fields=["activo", "updated_at"])

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

        # El peso es opcional en el registro general de seguimiento (no todo
        # tratamiento lo requiere), pero esta grafica es especificamente de
        # progreso de peso: solo tiene sentido con mediciones que lo traigan.
        mediciones = (
            MedicionAntropometrica.objects
            .filter(paciente_id=paciente_id, activo=True, peso_kg__isnull=False, **clinica_filter)
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
