from decimal import Decimal

from rest_framework import serializers

from apps.caja.models import Caja, CategoriaGasto, GastoCaja, SesionCaja
from apps.users.permissions import get_clinica_activa


class CategoriaGastoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaGasto
        fields = ["id", "clinica", "nombre", "activa", "created_at"]
        read_only_fields = ["id", "created_at", "clinica"]

    def validate(self, attrs):
        nombre = attrs.get("nombre")
        if nombre is None:
            return attrs
        nombre = nombre.strip()
        attrs["nombre"] = nombre

        request = self.context.get("request")
        clinica = get_clinica_activa(request) if request else None
        if clinica is None and self.instance is not None:
            clinica = self.instance.clinica
        if clinica is not None:
            qs = CategoriaGasto.objects.filter(clinica=clinica, nombre__iexact=nombre)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"nombre": ["Ya existe una categoría con ese nombre."]}
                )
        return attrs


class GastoCajaSerializer(serializers.ModelSerializer):
    registrado_por_nombre = serializers.SerializerMethodField()
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)

    class Meta:
        model = GastoCaja
        fields = [
            "id",
            "sesion",
            "sede",
            "sede_nombre",
            "categoria",
            "categoria_nombre",
            "descripcion",
            "valor",
            "soporte_foto",
            "fecha",
            "registrado_por",
            "registrado_por_nombre",
            "created_at",
        ]
        read_only_fields = ["id", "sesion", "registrado_por", "created_at"]

    def get_registrado_por_nombre(self, obj):
        return obj.registrado_por.get_full_name() if obj.registrado_por_id else None

    def validate(self, attrs):
        valor = attrs.get("valor", getattr(self.instance, "valor", None))
        soporte_foto = attrs.get("soporte_foto", getattr(self.instance, "soporte_foto", None))
        if valor and valor > 50000 and not soporte_foto:
            raise serializers.ValidationError(
                {
                    "soporte_foto": "Para gastos mayores a $50.000 el soporte fotográfico es obligatorio.",
                    "code": "SOPORTE_REQUERIDO",
                }
            )
        return attrs


class CajaSerializer(serializers.ModelSerializer):
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)
    responsable_nombre = serializers.SerializerMethodField()
    sesion_abierta_id = serializers.SerializerMethodField()
    monto_apertura_sugerido = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True,
    )

    class Meta:
        model = Caja
        fields = [
            "id",
            "sede",
            "sede_nombre",
            "responsable",
            "responsable_nombre",
            "saldo_inicial",
            "activa",
            "sesion_abierta_id",
            "monto_apertura_sugerido",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_responsable_nombre(self, obj):
        return obj.responsable.get_full_name() if obj.responsable_id else None

    def get_sesion_abierta_id(self, obj):
        s = obj.sesion_abierta
        return str(s.id) if s else None


class SesionCajaSerializer(serializers.ModelSerializer):
    caja_sede_nombre = serializers.CharField(source="caja.sede.nombre", read_only=True)
    abierta_por_nombre = serializers.SerializerMethodField()
    cerrada_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = SesionCaja
        fields = [
            "id",
            "caja",
            "caja_sede_nombre",
            "estado",
            "monto_apertura",
            "abierta_por",
            "abierta_por_nombre",
            "abierta_en",
            "total_ingresos",
            "total_egresos",
            "esperado",
            "efectivo_contado",
            "diferencia",
            "observaciones",
            "cerrada_por",
            "cerrada_por_nombre",
            "cerrada_en",
            "created_at",
        ]
        read_only_fields = fields

    def get_abierta_por_nombre(self, obj):
        return obj.abierta_por.get_full_name() if obj.abierta_por_id else None

    def get_cerrada_por_nombre(self, obj):
        return obj.cerrada_por.get_full_name() if obj.cerrada_por_id else None


class AbrirSesionSerializer(serializers.Serializer):
    caja = serializers.UUIDField()
    monto_apertura = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class CerrarSesionSerializer(serializers.Serializer):
    efectivo_contado = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"),
    )
    observaciones = serializers.CharField(required=False, allow_blank=True)
