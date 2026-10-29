from datetime import date
from decimal import Decimal

from rest_framework import serializers

from apps.clinicas.models import Sede
from apps.core.storage import get_signed_url
from apps.inventario.models import Insumo
from apps.users.authorization import atiende_solo_lo_propio
from apps.users.permissions import get_clinica_activa
from apps.historia_clinica.autoria import puede_modificar_examen
from apps.historia_clinica.models import (
    AnotacionZona,
    ArchivoResultadoExamen,
    ConsentimientoInformado,
    ConsumoInsumo,
    FotoClinica,
    HistoriaClinica,
    NotaClinica,
    OrdenMedica,
    OrdenMedicaAuditoria,
    PlantillaOrden,
    ResultadoExamen,
)
from apps.core.clinica_scope import AcotadoAClinicaMixin


def generar_url_firmada_storage(field_file, expires_in=3600):
    if not field_file:
        return None
    return get_signed_url(field_file.name, expires_in=expires_in)


class FotoClinicaSerializer(AcotadoAClinicaMixin, serializers.ModelSerializer):
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

    def validate_archivo(self, archivo):
        # Antes se aceptaba cualquier archivo de cualquier tamaño.
        if archivo.size > MAX_FOTO_CLINICA:
            raise serializers.ValidationError("La foto no puede superar 15 MB.")
        if (getattr(archivo, "content_type", "") or "").lower() not in TIPOS_FOTO_CLINICA:
            raise serializers.ValidationError("Solo se permiten fotos JPG, PNG, WebP o HEIC.")
        return archivo


MAX_FOTO_CLINICA = 15 * 1024 * 1024
TIPOS_FOTO_CLINICA = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}


class NotaClinicaResumenSerializer(serializers.ModelSerializer):
    """Serializer ligero usado en el listado de notas de una historia."""
    profesional_nombre = serializers.SerializerMethodField()
    # La tarjeta de la nota muestra el procedimiento de la cita (M4-27).
    servicio_nombre = serializers.SerializerMethodField()

    class Meta:
        model = NotaClinica
        fields = (
            "id",
            "cita",
            "estado",
            "motivo_consulta",
            "plan_manejo",
            "profesional_nombre",
            "servicio_nombre",
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

    def get_servicio_nombre(self, obj):
        return obj.cita.servicio_nombre if obj.cita_id else ""


MAX_ARCHIVO_EXAMEN = MAX_FOTO_CLINICA
MAX_ARCHIVOS_POR_ENVIO = 10
TIPOS_ARCHIVO_EXAMEN = TIPOS_FOTO_CLINICA | {"application/pdf"}


def validar_archivo_examen(archivo):
    # Antes se aceptaba cualquier archivo de cualquier tamaño.
    if archivo.size > MAX_ARCHIVO_EXAMEN:
        raise serializers.ValidationError(f"{archivo.name}: no puede superar 15 MB.")
    if (getattr(archivo, "content_type", "") or "").lower() not in TIPOS_ARCHIVO_EXAMEN:
        raise serializers.ValidationError(f"{archivo.name}: solo se permiten PDF o imágenes JPG, PNG, WebP o HEIC.")
    return archivo


class ArchivosExamenField(serializers.ListField):
    """Archivos nuevos de un resultado (multipart, el campo repetido)."""

    def __init__(self, **kwargs):
        kwargs.setdefault("child", serializers.FileField(validators=[validar_archivo_examen]))
        kwargs.setdefault("max_length", MAX_ARCHIVOS_POR_ENVIO)
        kwargs.setdefault("error_messages", {"max_length": f"Máximo {MAX_ARCHIVOS_POR_ENVIO} archivos por envío."})
        super().__init__(**kwargs)


class ArchivoResultadoExamenSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    subido_por_nombre = serializers.CharField(source="subido_por.nombre_completo", read_only=True, default=None)
    puede_quitar = serializers.SerializerMethodField()

    class Meta:
        model = ArchivoResultadoExamen
        fields = ("id", "nombre", "url", "subido_por", "subido_por_nombre", "puede_quitar", "created_at")
        read_only_fields = fields

    def get_url(self, obj):
        return generar_url_firmada_storage(obj.archivo)

    def get_puede_quitar(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and puede_modificar_examen(
            request.user, obj.resultado, request=request, autor_id=obj.subido_por_id,
        ))


def _archivos_activos(resultado):
    # Sobre el prefetch: filtrar en la consulta haría una por resultado.
    return [a for a in resultado.archivos.all() if a.activo]


class ResultadoExamenEmbedSerializer(serializers.ModelSerializer):
    archivos = serializers.SerializerMethodField()

    class Meta:
        model = ResultadoExamen
        fields = ("id", "titulo", "fecha", "descripcion", "archivos")
        read_only_fields = fields

    def get_archivos(self, obj):
        return ArchivoResultadoExamenSerializer(_archivos_activos(obj), many=True).data


class OrdenMedicaEmbedSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdenMedica
        fields = ("id", "contenido", "plantilla_origen", "created_at")
        read_only_fields = fields


class NotaClinicaSerializer(serializers.ModelSerializer):
    """Serializer completo para detalle de una nota clínica."""
    profesional_nombre = serializers.SerializerMethodField()
    # La tarjeta de la nota muestra el procedimiento de la cita (M4-27).
    servicio_nombre = serializers.SerializerMethodField()
    fotos = FotoClinicaSerializer(many=True, read_only=True)
    examenes = serializers.SerializerMethodField()
    ordenes = OrdenMedicaEmbedSerializer(many=True, read_only=True)
    # Zonas, insumos y mediciones de la nota: también cuentan como contenido al
    # completar la atención (AT-15). Solo en el detalle, para no sumar consultas
    # por nota en los listados.
    otros_registros = serializers.SerializerMethodField()
    # Evolución escrita en la historia, fuera de una atención: sin cita ni cotización.
    es_evolucion = serializers.SerializerMethodField()

    class Meta:
        model = NotaClinica
        fields = (
            "id",
            "historia",
            "cita",
            "cotizacion",
            "es_evolucion",
            "estado",
            "motivo_consulta",
            "plan_manejo",
            "profesional_nombre",
            "servicio_nombre",
            "fotos",
            "examenes",
            "ordenes",
            "otros_registros",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "estado",
            "profesional_nombre",
            "servicio_nombre",
            "fotos",
            "examenes",
            "ordenes",
            "created_at",
            "updated_at",
        )

    def get_examenes(self, obj):
        # Los eliminados quedan en la base (activo=False) pero no se muestran.
        examenes = [e for e in obj.examenes.all() if e.activo]
        return ResultadoExamenEmbedSerializer(examenes, many=True).data

    def get_otros_registros(self, obj):
        vista = self.context.get("view")
        if getattr(vista, "action", None) != "retrieve":
            return None
        return (
            obj.anotaciones_zona.count()
            + obj.consumos_insumo.filter(activo=True).count()
            + obj.mediciones_antropometricas.count()
        )

    def get_es_evolucion(self, obj):
        return not obj.cita_id and not obj.cotizacion_id

    def get_profesional_nombre(self, obj):
        if obj.cita_id and obj.cita.profesional_id:
            return obj.cita.profesional.nombre_completo
        if obj.firmada_por_id:
            return obj.firmada_por.nombre_completo
        return None

    def get_servicio_nombre(self, obj):
        return obj.cita.servicio_nombre if obj.cita_id else ""

    def validate(self, attrs):
        historia = attrs.get("historia")
        cita = attrs.get("cita")
        user = self.context["request"].user

        if historia and historia.clinica_id != user.clinica_id and user.rol != "superadmin":
            raise serializers.ValidationError({"historia": "La historia no pertenece a tu clinica."})
        if cita and historia and cita.paciente_id != historia.paciente_id:
            raise serializers.ValidationError({"cita": "La cita no corresponde al paciente de la historia."})
        if atiende_solo_lo_propio(user):
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
    firmado_profesional_por_nombre = serializers.CharField(
        source="firmado_profesional_por.nombre_completo", read_only=True, default=None
    )
    pendiente_firma_profesional = serializers.BooleanField(read_only=True)
    completo = serializers.BooleanField(read_only=True)

    class Meta:
        model = ConsentimientoInformado
        fields = (
            "id",
            "paciente",
            "cita",
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
            "requiere_firma_profesional",
            "firmado_profesional_por",
            "firmado_profesional_por_nombre",
            "fecha_firma_profesional",
            "pendiente_firma_profesional",
            "completo",
            "notas",
            "created_at",
            "updated_at",
        )
        # firmado / fecha_firma / archivo solo los cambian Documenso (webhook,
        # verificar_firma, completar_firma verificado): por PATCH se podía marcar un
        # consentimiento como firmado sin firma, cambiar el PDF firmado o
        # "desfirmarlo" para borrarlo.
        read_only_fields = (
            "id",
            "tipo",
            "firmado",
            "fecha_firma",
            "archivo",
            "archivo_url",
            "url_firmada",
            "documenso_document_id",
            "fecha_vencimiento",
            "vigente",
            "requiere_firma_profesional",
            "firmado_profesional_por",
            "fecha_firma_profesional",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "cita": {"required": False, "allow_null": True},
        }

    def update(self, instance, validated_data):
        # El paciente y la cita del consentimiento no se cambian después de crearlo.
        validated_data.pop("paciente", None)
        validated_data.pop("cita", None)
        return super().update(instance, validated_data)

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
        import uuid
        from apps.configuracion.models import DocumensoConsentimientoTemplate

        request = self.context["request"]
        validated_data["clinica"] = get_clinica_activa(request) or validated_data["paciente"].clinica

        # Si el token parece un UUID interno, resolver el FK plantilla
        token = validated_data.get("documenso_template_token", "")
        if token and not validated_data.get("plantilla_id"):
            try:
                uuid.UUID(token)
                try:
                    plantilla = DocumensoConsentimientoTemplate.objects.get(
                        id=token,
                        clinica=validated_data["clinica"],
                    )
                    validated_data["plantilla"] = plantilla
                    if not validated_data.get("documenso_template_nombre"):
                        validated_data["documenso_template_nombre"] = plantilla.nombre or plantilla.get_tipo_display()
                except DocumensoConsentimientoTemplate.DoesNotExist:
                    pass
            except ValueError:
                pass

        return super().create(validated_data)


class ResultadoExamenSerializer(serializers.ModelSerializer):
    archivos = serializers.SerializerMethodField()
    adjuntos = ArchivosExamenField(write_only=True, required=False)
    created_by_nombre = serializers.CharField(source="created_by.nombre_completo", read_only=True, default=None)
    # Fecha de la atención en la que se cargó; null = cargado desde la historia.
    nota_fecha = serializers.DateTimeField(source="nota.created_at", read_only=True, default=None)
    puede_modificar = serializers.SerializerMethodField()

    class Meta:
        model = ResultadoExamen
        fields = (
            "id",
            "historia",
            "nota",
            "nota_fecha",
            "titulo",
            "descripcion",
            "archivos",
            "adjuntos",
            "fecha",
            "created_by",
            "created_by_nombre",
            "puede_modificar",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "archivos", "nota_fecha", "created_by", "created_by_nombre", "puede_modificar",
            "created_at", "updated_at",
        )

    def get_archivos(self, obj):
        return ArchivoResultadoExamenSerializer(_archivos_activos(obj), many=True, context=self.context).data

    def get_puede_modificar(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and puede_modificar_examen(request.user, obj, request=request))

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


class AgregarArchivosExamenSerializer(serializers.Serializer):
    adjuntos = ArchivosExamenField(allow_empty=False)


class PlantillaOrdenSerializer(serializers.ModelSerializer):
    created_by_nombre = serializers.CharField(source="created_by.nombre_completo", read_only=True)
    es_mia = serializers.SerializerMethodField()

    class Meta:
        model = PlantillaOrden
        fields = (
            "id",
            "nombre",
            "contenido",
            "permite_edicion_profesional",
            "activa",
            "compartida",
            "es_mia",
            "created_by",
            "created_by_nombre",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "es_mia", "created_by", "created_by_nombre", "created_at", "updated_at")

    def get_es_mia(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and obj.created_by_id == request.user.id)


class GuardarComoPlantillaSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=200)
    compartida = serializers.BooleanField(default=False)


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
            "titulo",
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
        extra_kwargs = {"titulo": {"required": False}}

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

        nota = attrs.get("nota")
        if nota is not None:
            from apps.historia_clinica.autoria import exigir_documentable

            if nota.historia_id != historia.id:
                raise serializers.ValidationError({"nota": "La nota no es de esta historia."})
            # Solo en sus propias atenciones (AT-02).
            exigir_documentable(request.user, nota)
            # Sin cita, el PDF salía con la primera sede y sin el nombre de la consulta (AT-16).
            if cita is None and nota.cita_id:
                attrs["cita"] = nota.cita

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
            attrs["titulo"] = plantilla.nombre
        elif not contenido:
            raise serializers.ValidationError({"contenido": "Debes enviar contenido o seleccionar una plantilla."})

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        from apps.historia_clinica.variables_orden import llenar_variables

        fue_editada = validated_data.get("fue_editada", False)
        plantilla = validated_data.get("plantilla_origen")
        validated_data["contenido"] = llenar_variables(
            validated_data["contenido"], validated_data["historia"].paciente, request.user,
        )
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


class ConsumoInsumoSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.CharField(source="insumo.nombre", read_only=True)
    unidad_medida = serializers.CharField(source="insumo.unidad_medida", read_only=True)

    class Meta:
        model = ConsumoInsumo
        fields = (
            "id", "nota", "insumo", "insumo_nombre", "unidad_medida",
            "cantidad", "notas", "registrado_por", "activo", "created_at",
        )
        read_only_fields = fields


class RegistrarConsumoInsumoSerializer(AcotadoAClinicaMixin, serializers.Serializer):
    nota = serializers.PrimaryKeyRelatedField(queryset=NotaClinica.objects.all())
    insumo = serializers.PrimaryKeyRelatedField(queryset=Insumo.objects.all())
    cantidad = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"))
    notas = serializers.CharField(required=False, allow_blank=True, default="")
    # Solo obligatoria si la nota no tiene cita asociada (se deriva cita.sede si la hay).
    sede = serializers.PrimaryKeyRelatedField(queryset=Sede.objects.all(), required=False, allow_null=True)

    def validate(self, attrs):
        request = self.context["request"]
        nota = attrs["nota"]
        insumo = attrs["insumo"]
        if request.user.rol != "superadmin":
            if nota.historia.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"nota": "La nota no pertenece a tu clinica."})
            if insumo.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"insumo": "El insumo no pertenece a tu clinica."})
        if not nota.cita_id and not attrs.get("sede"):
            raise serializers.ValidationError(
                {"sede": "Esta nota no tiene una cita asociada: indica la sede del consumo.", "code": "SEDE_REQUERIDA"}
            )
        return attrs


class AnotacionZonaSerializer(serializers.ModelSerializer):
    diagrama_nombre = serializers.CharField(source="diagrama.nombre", read_only=True)

    class Meta:
        model = AnotacionZona
        fields = (
            "id", "nota", "diagrama", "diagrama_nombre",
            "x", "y", "radio",
            "texto", "tipo_aplicacion", "parametros",
            "activo", "created_at", "updated_at",
        )
        read_only_fields = ("id", "diagrama_nombre", "created_at", "updated_at")

    def validate_x(self, value):
        if not (0.0 <= value <= 1.0):
            raise serializers.ValidationError("x debe estar entre 0.0 y 1.0.")
        return value

    def validate_y(self, value):
        if not (0.0 <= value <= 1.0):
            raise serializers.ValidationError("y debe estar entre 0.0 y 1.0.")
        return value

    def validate_radio(self, value):
        if not (0.0 < value <= 0.5):
            raise serializers.ValidationError("radio debe estar entre 0.0 y 0.5.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        nota = attrs.get("nota", getattr(self.instance, "nota", None))
        if nota and request.user.rol != "superadmin":
            if nota.historia.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"nota": "La nota no pertenece a tu clinica."})
        return attrs
