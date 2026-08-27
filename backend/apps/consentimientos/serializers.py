from rest_framework import serializers

from apps.agenda.models import Cita
from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento


class PlantillaConsentimientoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantillaConsentimiento
        fields = (
            "id",
            "clinica",
            "servicio",
            "ambito",
            "nombre",
            "contenido_html",
            "version",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "version", "created_at", "updated_at")

    def validate(self, attrs):
        request = self.context.get("request")
        clinica = attrs.get("clinica", getattr(self.instance, "clinica", None))
        servicio = attrs.get("servicio", getattr(self.instance, "servicio", None))
        if request and request.user.rol != "superadmin" and clinica and clinica.id != request.user.clinica_id:
            raise serializers.ValidationError({"clinica": "No puedes gestionar plantillas de otra clinica."})
        if servicio and clinica and servicio.clinica_id != clinica.id:
            raise serializers.ValidationError({"servicio": "El servicio no pertenece a la clinica seleccionada."})
        return attrs


class ConsentimientoSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    plantilla_nombre = serializers.CharField(source="plantilla.nombre", read_only=True, default=None)
    cita_fecha_inicio = serializers.DateTimeField(source="cita.fecha_inicio", read_only=True)
    cotizacion_referencia = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = Consentimiento
        fields = (
            "id",
            "cita",
            "cita_fecha_inicio",
            "cotizacion",
            "cotizacion_referencia",
            "paciente",
            "paciente_nombre",
            "plantilla",
            "plantilla_nombre",
            "contenido_snapshot",
            "hash_contenido",
            "estado",
            "token",
            "token_expira",
            "firmado_en",
            "firma_ip",
            "firma_user_agent",
            "documenso_signing_token",
            "pdf_url",
            "revocado_en",
            "motivo_revocacion",
            "created_at",
        )
        read_only_fields = (
            "id",
            "paciente",
            "contenido_snapshot",
            "hash_contenido",
            "estado",
            "token",
            "token_expira",
            "firmado_en",
            "firma_ip",
            "firma_user_agent",
            "documenso_signing_token",
            "pdf_url",
            "revocado_en",
            "motivo_revocacion",
            "created_at",
        )

    def get_pdf_url(self, obj):
        if not obj.pdf_archivo:
            return None
        try:
            return obj.pdf_archivo.url
        except Exception:
            return None

    def get_cotizacion_referencia(self, obj):
        if not obj.cotizacion_id:
            return None
        return str(obj.cotizacion_id)[:8].upper()


class GenerarConsentimientoSerializer(serializers.Serializer):
    cita_id = serializers.UUIDField(required=False)
    cotizacion_id = serializers.UUIDField(required=False)
    plantilla_id = serializers.UUIDField()

    def validate(self, attrs):
        from apps.cotizaciones.models import Cotizacion

        cita_id = attrs.get("cita_id")
        cotizacion_id = attrs.get("cotizacion_id")
        if bool(cita_id) == bool(cotizacion_id):
            raise serializers.ValidationError("Debes indicar exactamente uno: cita_id o cotizacion_id.")

        plantilla = PlantillaConsentimiento.objects.select_related("clinica", "servicio").get(id=attrs["plantilla_id"])
        request = self.context["request"]

        if cita_id:
            cita = Cita.objects.select_related("paciente", "sede", "servicio", "profesional").get(id=cita_id)
            if request.user.rol != "superadmin" and cita.sede.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"cita_id": "La cita no pertenece a tu clinica."})
            if plantilla.clinica_id != cita.sede.clinica_id:
                raise serializers.ValidationError({"plantilla_id": "La plantilla no pertenece a la clinica de la cita."})
            if plantilla.servicio_id and plantilla.servicio_id != cita.servicio_id:
                raise serializers.ValidationError({"plantilla_id": "La plantilla no aplica para el servicio de la cita."})
            if plantilla.ambito != PlantillaConsentimiento.Ambito.CITA:
                raise serializers.ValidationError({"plantilla_id": "La plantilla no es de ambito cita."})
            attrs["cita"] = cita
            attrs["cotizacion"] = None
        else:
            cotizacion = Cotizacion.objects.select_related("paciente", "clinica").get(id=cotizacion_id)
            if request.user.rol != "superadmin" and cotizacion.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"cotizacion_id": "La cotizacion no pertenece a tu clinica."})
            if plantilla.clinica_id != cotizacion.clinica_id:
                raise serializers.ValidationError({"plantilla_id": "La plantilla no pertenece a la clinica de la cotizacion."})
            if plantilla.ambito != PlantillaConsentimiento.Ambito.COTIZACION:
                raise serializers.ValidationError({"plantilla_id": "La plantilla no es de ambito cotizacion."})
            attrs["cita"] = None
            attrs["cotizacion"] = cotizacion

        attrs["plantilla"] = plantilla
        return attrs


class RevocarConsentimientoSerializer(serializers.Serializer):
    motivo_revocacion = serializers.CharField()
