from rest_framework import serializers

from apps.core.models import LogAccion


class LogAccionSerializer(serializers.ModelSerializer):
    usuario_email  = serializers.EmailField(source="usuario.email", read_only=True, default=None)
    usuario_nombre = serializers.SerializerMethodField()
    clinica_nombre = serializers.CharField(source="clinica.nombre", read_only=True, default=None)

    def get_usuario_nombre(self, obj) -> str:
        u = obj.usuario
        if not u:
            return "Sistema"
        full = f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
        return full or u.email or str(u)

    class Meta:
        model = LogAccion
        fields = [
            "id",
            "clinica",
            "clinica_nombre",
            "usuario",
            "usuario_email",
            "usuario_nombre",
            "accion",
            "objeto_tipo",
            "objeto_id",
            "detalle",
            "ip",
            "created_at",
        ]
