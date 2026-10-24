"""Herramientas de soporte del console (solo superadmin)."""

from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agenda import eliminacion, soporte, traslado
from apps.agenda.models import CorreccionSoporte
from apps.users.permissions import IsSuperAdmin


def _clinica(clinica_id):
    from apps.clinicas.models import Clinica

    clinica = Clinica.objects.filter(pk=clinica_id).first() if clinica_id else None
    if clinica is None:
        raise serializers.ValidationError({"error": "Elige una clínica.", "code": "CLINICA_REQUERIDA"})
    return clinica


class _SoporteView(APIView):
    permission_classes = [IsSuperAdmin]


class SoportePacientesView(_SoporteView):
    """Buscar pacientes de una clínica por nombre o documento."""

    def get(self, request):
        from apps.pacientes.models import Paciente

        clinica = _clinica(request.query_params.get("clinica"))
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 3:
            return Response([])
        filtro = Q(numero_documento__icontains=q)
        for palabra in q.split():
            filtro |= Q(nombres__icontains=palabra) | Q(apellidos__icontains=palabra)
        pacientes = Paciente.objects.filter(clinica=clinica).filter(filtro).order_by("apellidos", "nombres")[:20]
        return Response([
            {
                "id": str(p.id),
                "nombre": p.nombre_completo,
                "tipo_documento": p.tipo_documento,
                "numero_documento": p.numero_documento,
                "telefono": p.telefono or "",
            }
            for p in pacientes
        ])


class SoporteAtencionesView(_SoporteView):
    """Atenciones (citas con nota) de un paciente, para elegir la que se corrige."""

    def get(self, request):
        from apps.pacientes.models import Paciente

        clinica = _clinica(request.query_params.get("clinica"))
        paciente = Paciente.objects.filter(pk=request.query_params.get("paciente"), clinica=clinica).first()
        if paciente is None:
            return Response({"error": "El paciente no existe en esta clínica."}, status=status.HTTP_404_NOT_FOUND)
        return Response(soporte.atenciones_del_paciente(paciente))


class SoporteCorreccionesView(_SoporteView):
    """Correcciones ya hechas en una clínica (opcionalmente de un tipo)."""

    def get(self, request):
        clinica = _clinica(request.query_params.get("clinica"))
        tipo = request.query_params.get("tipo")
        if tipo and tipo not in CorreccionSoporte.Tipo.values:
            tipo = None
        return Response(soporte.correcciones_de_la_clinica(clinica, tipo=tipo))


class _AtencionSerializer(serializers.Serializer):
    clinica = serializers.UUIDField()
    cita = serializers.UUIDField()


class PrevisualizarTrasladoSerializer(_AtencionSerializer):
    paciente_destino = serializers.UUIDField()


class TrasladarAtencionSerializer(PrevisualizarTrasladoSerializer):
    item_destino = serializers.UUIDField(required=False, allow_null=True)
    sesion_destino = serializers.UUIDField(required=False, allow_null=True)
    accion_cobro = serializers.ChoiceField(choices=sorted(traslado.ACCIONES_COBRO), required=False, allow_null=True)
    motivo = serializers.CharField(max_length=1000)


class EliminarAtencionSerializer(_AtencionSerializer):
    estado_cita = serializers.ChoiceField(choices=eliminacion.ESTADOS_RESULTANTES)
    accion_cobro = serializers.ChoiceField(choices=sorted(eliminacion.ACCIONES_COBRO), required=False, allow_null=True)
    motivo = serializers.CharField(max_length=1000)


class SoportePrevisualizarTrasladoView(_SoporteView):
    def post(self, request):
        datos = PrevisualizarTrasladoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        return Response(traslado.previsualizar(_clinica(v["clinica"]), v["cita"], v["paciente_destino"]))


class SoporteTrasladoAtencionView(_SoporteView):
    def post(self, request):
        datos = TrasladarAtencionSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        correccion = traslado.trasladar(
            _clinica(v["clinica"]), v["cita"], v["paciente_destino"],
            item_destino_id=v.get("item_destino"), sesion_destino_id=v.get("sesion_destino"),
            accion_cobro=v.get("accion_cobro"), motivo=v["motivo"], usuario=request.user, request=request,
        )
        return Response({"id": str(correccion.id), "cita": str(correccion.cita_id)}, status=status.HTTP_201_CREATED)


class SoportePrevisualizarEliminacionView(_SoporteView):
    def post(self, request):
        datos = _AtencionSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        return Response(eliminacion.previsualizar(_clinica(v["clinica"]), v["cita"]))


class SoporteEliminarAtencionView(_SoporteView):
    def post(self, request):
        datos = EliminarAtencionSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        correccion = eliminacion.eliminar(
            _clinica(v["clinica"]), v["cita"], estado_cita=v["estado_cita"],
            accion_cobro=v.get("accion_cobro"), motivo=v["motivo"], usuario=request.user, request=request,
        )
        return Response({"id": str(correccion.id), "cita": str(correccion.cita_id)}, status=status.HTTP_201_CREATED)
