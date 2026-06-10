from datetime import date

from rest_framework import serializers

from apps.core.storage import get_signed_url
from apps.historia_clinica.models import (
    ConsentimientoInformado,
    FotoClinica,
    HistoriaClinica,
    NotaClinica,
    OrdenMedica,
    OrdenMedicaAuditoria,
    PlantillaOrden,
    ResultadoExamen,
    SignosVitales,
)


def generar_url_firmada_storage(field_file, expires_in=3600):
    if not field_file:
        return None
    return get_signed_url(field_file.name, expires_in=expires_in)


class FotoClinicaSerializer(serializers.ModelSerializer):
    url_firmada = serializers.SerializerMethodField()

    class Meta:
        model = FotoClinica
        fields = (
            "id",
            "nota",
            "tipo",
            "archivo",
            "descripcion",
            "zona",
            "url_firmada",
            "created_at",
        )
        read_only_fields = ("id", "url_firmada", "created_at")

    def get_url_firmada(self, obj):
        return generar_url_firmada_storage(obj.archivo)


class NotaClinicaResumenSerializer(serializers.ModelSerializer):
    """Serializer ligero usado en el listado de notas de una historia."""
    profesional_nombre = serializers.SerializerMethodField()

    class Meta:
        model = NotaClinica
        fields = (
            "id",
            "cita",
            "estado",
            "motivo_consulta",
            "plan_manejo",
            "profesional_nombre",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_profesional_nombre(self, obj):
        if obj.cita_id and obj.cita.profesional_id:
            return obj.cita.profesional.nombre_completo
        if obj.firmada_por_id:
            return obj.firmada_por.nombre_completo
        return None


class ResultadoExamenEmbedSerializer(serializers.ModelSerializer):
    archivo_url = serializers.SerializerMethodField()

    class Meta:
        model = ResultadoExamen
        fields = ("id", "titulo", "fecha", "descripcion", "archivo_url")
        read_only_fields = fields

    def get_archivo_url(self, obj):
        return generar_url_firmada_storage(obj.archivo)


class OrdenMedicaEmbedSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdenMedica
        fields = ("id", "contenido", "plantilla_origen", "created_at")
        read_only_fields = fields


class NotaClinicaSerializer(serializers.ModelSerializer):
    """Serializer completo para detalle de una nota clínica."""
    profesional_nombre = serializers.SerializerMethodField()
    fotos = FotoClinicaSerializer(many=True, read_only=True)
    examenes = ResultadoExamenEmbedSerializer(many=True, read_only=True)
    ordenes = OrdenMedicaEmbedSerializer(many=True, read_only=True)

    class Meta:
        model = NotaClinica
        fields = (
            "id",
            "historia",
            "cita",
            "estado",
            "motivo_consulta",
            "plan_manejo",
            "profesional_nombre",
            "fotos",
            "examenes",
            "ordenes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "estado",
            "profesional_nombre",
            "fotos",
            "examenes",
            "ordenes",
            "created_at",
            "updated_at",
        )

    def get_profesional_nombre(self, obj):
        if obj.cita_id and obj.cita.profesional_id:
            return obj.cita.profesional.nombre_completo
        if obj.firmada_por_id:
            return obj.firmada_por.nombre_completo
        return None

    def validate(self, attrs):
        historia = attrs.get("historia")
        cita = attrs.get("cita")
        user = self.context["request"].user

        if historia and historia.clinica_id != user.clinica_id and user.rol != "superadmin":
            raise serializers.ValidationError({"historia": "La historia no pertenece a tu clinica."})
        if cita and historia and cita.paciente_id != historia.paciente_id:
            raise serializers.ValidationError({"cita": "La cita no corresponde al paciente de la historia."})
        if user.rol == "profesional":
            if not cita or cita.profesional_id != user.id:
                raise serializers.ValidationError({"cita": "Solo el profesional asignado a la cita puede crear la nota."})
        return attrs


class NotaClinicaUpdateSerializer(serializers.ModelSerializer):
    """Serializer para auto-guardado parcial por tab (PATCH)."""

    class Meta:
        model = NotaClinica
        fields = ("motivo_consulta", "plan_manejo")

    def validate(self, attrs):
        if self.instance and self.instance.estado == NotaClinica.EstadoNota.COMPLETADA:
            raise serializers.ValidationError({"estado": "No se puede editar una nota ya completada."})
        return attrs


class HistoriaClinicaResumenSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    notas_resumen = serializers.SerializerMethodField()
    ultimas_fotos = serializers.SerializerMethodField()

    class Meta:
        model = HistoriaClinica
        fields = (
            "id",
            "paciente",
            "paciente_nombre",
            "clinica",
            "numero",
            "created_at",
            "notas_resumen",
            "ultimas_fotos",
        )

    def get_notas_resumen(self, obj):
        notas = obj.notas.select_related("firmada_por", "cita", "cita__profesional").all()[:10]
        return [
            {
                "id": str(nota.id),
                "estado": nota.estado,
                "motivo_consulta": (nota.motivo_consulta or "")[:200],
                "profesional_nombre": (
                    nota.cita.profesional.nombre_completo
                    if nota.cita_id and nota.cita.profesional_id
                    else (nota.firmada_por.nombre_completo if nota.firmada_por_id else None)
                ),
                "created_at": nota.created_at,
            }
            for nota in notas
        ]

    def get_ultimas_fotos(self, obj):
        fotos = FotoClinica.objects.filter(nota__historia=obj).order_by("-created_at")[:3]
        return FotoClinicaSerializer(fotos, many=True, context=self.context).data


class HistoriaClinicaDetalleSerializer(HistoriaClinicaResumenSerializer):
    # H26.4: motivo_consulta y plan_manejo son read-only; reflejan la última nota completada.
    motivo_consulta = serializers.SerializerMethodField()
    plan_manejo = serializers.SerializerMethodField()

    class Meta(HistoriaClinicaResumenSerializer.Meta):
        fields = HistoriaClinicaResumenSerializer.Meta.fields + (
            "motivo_consulta",
            "plan_manejo",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "paciente",
            "paciente_nombre",
            "clinica",
            "numero",
            "created_at",
            "notas_resumen",
            "ultimas_fotos",
            "motivo_consulta",
            "plan_manejo",
            "updated_at",
        )

    def _ultima_nota_completada(self, obj):
        return obj.notas.filter(estado=NotaClinica.EstadoNota.COMPLETADA).order_by("-created_at").first()

    def get_motivo_consulta(self, obj):
        nota = self._ultima_nota_completada(obj)
        return nota.motivo_consulta if nota else obj.motivo_consulta

    def get_plan_manejo(self, obj):
        nota = self._ultima_nota_completada(obj)
        return nota.plan_manejo if nota else obj.plan_manejo


class ConsentimientoInformadoSerializer(serializers.ModelSerializer):
    vigente = serializers.SerializerMethodField()
    template_nombre = serializers.CharField(source="documenso_template_nombre", read_only=True)
    archivo_url = serializers.SerializerMethodField()

    class Meta:
        model = ConsentimientoInformado
        fields = (
            "id",
            "paciente",
            "tipo",
            "documenso_template_token",
            "documenso_template_nombre",
            "template_nombre",
            "fecha_firma",
            "firmado",
            "archivo",
            "archivo_url",
            "url_firmada",
            "documenso_document_id",
            "vigencia_meses",
            "fecha_vencimiento",
            "vigente",
            "notas",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "tipo",
            "archivo_url",
            "url_firmada",
            "documenso_document_id",
            "fecha_vencimiento",
            "vigente",
            "created_at",
            "updated_at",
        )

    def get_archivo_url(self, obj):
        return generar_url_firmada_storage(obj.archivo)

    def get_vigente(self, obj):
        if not obj.firmado:
            return False
        return obj.fecha_vencimiento is None or obj.fecha_vencimiento >= date.today()

    def validate(self, attrs):
        request = self.context["request"]
        paciente = attrs.get("paciente", getattr(self.instance, "paciente", None))
        tipo = attrs.get("tipo", getattr(self.instance, "tipo", None))
        documenso_template_token = attrs.get(
            "documenso_template_token",
            getattr(self.instance, "documenso_template_token", None),
        )
        firmado = attrs.get("firmado", getattr(self.instance, "firmado", False))
        fecha_firma = attrs.get("fecha_firma", getattr(self.instance, "fecha_firma", None))

        if paciente and request.user.rol != "superadmin":
            if paciente.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"paciente": "El paciente no pertenece a tu clinica."})

        if not tipo:
            tipo = ConsentimientoInformado.TipoConsentimiento.OTROS
            attrs["tipo"] = tipo

        if self.instance:
            if "paciente" in attrs and attrs["paciente"].id != self.instance.paciente_id:
                raise serializers.ValidationError({"paciente": "No se puede cambiar el paciente de un consentimiento existente."})
            if "tipo" in attrs and attrs["tipo"] != self.instance.tipo:
                raise serializers.ValidationError({"tipo": "No se puede cambiar el tipo de un consentimiento existente."})
            if (
                "documenso_template_token" in attrs
                and attrs["documenso_template_token"] != self.instance.documenso_template_token
            ):
                raise serializers.ValidationError(
                    {"documenso_template_token": "No se puede cambiar el template de un consentimiento existente."}
                )

        if firmado and not fecha_firma:
            raise serializers.ValidationError({"fecha_firma": "Este campo es obligatorio cuando firmado=true."})

        if not documenso_template_token:
            raise serializers.ValidationError(
                {"documenso_template_token": "Este campo es obligatorio para registrar el consentimiento."}
            )

        if not attrs.get("documenso_template_nombre", getattr(self.instance, "documenso_template_nombre", None)) and tipo:
            attrs["documenso_template_nombre"] = dict(ConsentimientoInformado.TipoConsentimiento.choices).get(tipo, tipo)
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["clinica"] = request.user.clinica or validated_data["paciente"].clinica
        return super().create(validated_data)


class ResultadoExamenSerializer(serializers.ModelSerializer):
    archivo_url = serializers.SerializerMethodField()
    created_by_nombre = serializers.CharField(source="created_by.nombre_completo", read_only=True)

    class Meta:
        model = ResultadoExamen
        fields = (
            "id",
            "historia",
            "nota",
            "titulo",
            "descripcion",
            "archivo",
            "archivo_url",
            "fecha",
            "created_by",
            "created_by_nombre",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "archivo_url", "created_by", "created_by_nombre", "created_at", "updated_at")

    def get_archivo_url(self, obj):
        return generar_url_firmada_storage(obj.archivo)

    def validate_historia(self, value):
        request = self.context["request"]
        if request.user.rol != "superadmin" and value.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError("La historia no pertenece a tu clinica.")
        return value

    def validate(self, attrs):
        nota = attrs.get("nota")
        historia = attrs.get("historia")
        if nota and historia and nota.historia_id != historia.id:
            raise serializers.ValidationError({"nota": "La nota no pertenece a esta historia."})
        return attrs


class SignosVitalesSerializer(serializers.ModelSerializer):
    registrado_por_nombre = serializers.CharField(source="registrado_por.nombre_completo", read_only=True)

    class Meta:
        model = SignosVitales
        fields = (
            "id",
            "historia",
            "cita",
            "peso_kg",
            "altura_cm",
            "imc",
            "tension_sistolica",
            "tension_diastolica",
            "frecuencia_cardiaca",
            "frecuencia_respiratoria",
            "temperatura_c",
            "saturacion_oxigeno",
            "campos_adicionales",
            "registrado_por",
            "registrado_por_nombre",
            "created_at",
        )
        read_only_fields = ("id", "imc", "registrado_por", "registrado_por_nombre", "created_at")

    def validate_campos_adicionales(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Debe ser una lista de objetos.")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Cada campo adicional debe ser un objeto.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        historia = attrs.get("historia", getattr(self.instance, "historia", None))
        cita = attrs.get("cita", getattr(self.instance, "cita", None))

        if historia and request.user.rol != "superadmin" and historia.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"historia": "La historia no pertenece a tu clinica."})
        if cita and historia and cita.paciente_id != historia.paciente_id:
            raise serializers.ValidationError({"cita": "La cita no corresponde al paciente de la historia."})
        return attrs


class PlantillaOrdenSerializer(serializers.ModelSerializer):
    created_by_nombre = serializers.CharField(source="created_by.nombre_completo", read_only=True)

    class Meta:
        model = PlantillaOrden
        fields = (
            "id",
            "nombre",
            "contenido",
            "permite_edicion_profesional",
            "activa",
            "created_by",
            "created_by_nombre",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_by_nombre", "created_at", "updated_at")


class OrdenMedicaAuditoriaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre_completo", read_only=True)

    class Meta:
        model = OrdenMedicaAuditoria
        fields = ("id", "accion", "descripcion", "usuario", "usuario_nombre", "created_at")
        read_only_fields = fields


class OrdenMedicaSerializer(serializers.ModelSerializer):
    plantilla_nombre = serializers.CharField(source="plantilla_origen.nombre", read_only=True)
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    auditorias = OrdenMedicaAuditoriaSerializer(many=True, read_only=True)

    class Meta:
        model = OrdenMedica
        fields = (
            "id",
            "historia",
            "cita",
            "nota",
            "plantilla_origen",
            "plantilla_nombre",
            "contenido",
            "contenido_original",
            "fue_editada",
            "profesional",
            "profesional_nombre",
            "auditorias",
            "created_at",
        )
        read_only_fields = (
            "id",
            "contenido_original",
            "fue_editada",
            "profesional",
            "profesional_nombre",
            "auditorias",
            "created_at",
        )

    def validate(self, attrs):
        request = self.context["request"]
        historia = attrs.get("historia")
        cita = attrs.get("cita")
        plantilla = attrs.get("plantilla_origen")
        contenido = attrs.get("contenido", "")

        if request.user.rol != "superadmin" and historia.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"historia": "La historia no pertenece a tu clinica."})

        if cita and cita.paciente_id != historia.paciente_id:
            raise serializers.ValidationError({"cita": "La cita no corresponde al paciente de la historia."})

        if plantilla:
            if request.user.rol != "superadmin" and plantilla.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"plantilla_origen": "La plantilla no pertenece a tu clinica."})
            if not contenido:
                attrs["contenido"] = plantilla.contenido
                contenido = plantilla.contenido
            attrs["contenido_original"] = plantilla.contenido
            if not plantilla.permite_edicion_profesional and contenido != plantilla.contenido:
                raise serializers.ValidationError(
                    {"error": "Esta plantilla no permite modificaciones", "code": "PLANTILLA_NO_EDITABLE"}
                )
            attrs["fue_editada"] = contenido != plantilla.contenido
        elif not contenido:
            raise serializers.ValidationError({"contenido": "Debes enviar contenido o seleccionar una plantilla."})

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        fue_editada = validated_data.get("fue_editada", False)
        plantilla = validated_data.get("plantilla_origen")
        orden = OrdenMedica.objects.create(
            **validated_data,
            profesional=request.user,
        )
        if fue_editada and plantilla:
            OrdenMedicaAuditoria.objects.create(
                orden=orden,
                accion="plantilla_editada",
                descripcion=(
                    f"OrdenMedica #{orden.id} editada por {request.user.nombre_completo} "
                    f"(plantilla: {plantilla.nombre})"
                ),
                usuario=request.user,
            )
        return orden
