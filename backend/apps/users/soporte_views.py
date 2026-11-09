"""Herramientas de soporte del console sobre usuarios (solo superadmin)."""

import uuid

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clinicas.models import Clinica
from apps.users import cambio_correo
from apps.users.permissions import IsSuperAdmin

User = get_user_model()


def _bool(valor, por_defecto: bool) -> bool:
    if valor is None:
        return por_defecto
    if isinstance(valor, str):
        return valor.strip().lower() in ("1", "true", "si", "sí", "on")
    return bool(valor)


class SoporteCambiarCorreoView(APIView):
    """
    GET  /api/v1/admin/soporte/cambiar-correo/?clinica=<id>   cambios recientes de la clínica
    POST /api/v1/admin/soporte/cambiar-correo/
         {usuario, correo_nuevo, motivo, enviar_enlace=true, cerrar_sesiones=true}
    """

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        try:
            clinica = Clinica.objects.filter(pk=uuid.UUID(str(request.query_params.get("clinica")))).first()
        except ValueError:
            clinica = None
        if clinica is None:
            return Response({"error": "Elige una clínica.", "code": "CLINICA_REQUERIDA"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(cambio_correo.cambios_recientes(clinica))

    def post(self, request):
        data = request.data
        try:
            user = User.objects.filter(pk=uuid.UUID(str(data.get("usuario")))).first()
        except ValueError:
            user = None
        if user is None:
            return Response({"error": "El usuario no existe.", "code": "USUARIO_NO_EXISTE"}, status=status.HTTP_404_NOT_FOUND)
        resultado = cambio_correo.cambiar_correo(
            user,
            data.get("correo_nuevo"),
            motivo=data.get("motivo"),
            enviar_enlace=_bool(data.get("enviar_enlace"), True),
            cerrar_sesiones=_bool(data.get("cerrar_sesiones"), True),
            request=request,
        )
        return Response(resultado)
