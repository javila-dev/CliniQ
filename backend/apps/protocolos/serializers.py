from datetime import date, timedelta

from django.db import transaction
from rest_framework import serializers

from apps.core.storage import get_signed_url
from apps.protocolos.models import ConsentimientoPaciente, SesionProcedimiento, TratamientoPaciente


class SesionProcedimientoSerializer(serializers.ModelSerializer):
    paso_nombre = serializers.SerializerMethodField()
    paso_orden = serializers.SerializerMethodField()
    paso_semana = serializers.SerializerMethodField()
    paso_es_control = serializers.SerializerMethodField()
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    checkin_verificado = serializers.SerializerMethodField()
    procedimientos_ejecutados = serializers.SerializerMethodField()
    consentimientos = serializers.SerializerMethodField()
    foto_presencia_url = serializers.SerializerMethodField()

    class Meta:
        model = SesionProcedimiento
        fields = (
            "id",
            "tratamiento",
            "tipo_sesion",
            "numero",
            "paso",
            "procedimiento",
            "paso_nombre",
            "paso_orden",
            "paso_semana",
            "paso_es_control",
            "cita",
            "estado",
            "fecha",
            "hora",
            "profesional",
            "profesional_nombre",
            "observaciones",
            "procedimientos_ejecutados",
            "consentimientos",
            "forzado_sin_consentimiento",
            "motivo_forzado",
            "checkin_verificado",
            "checkin_metodo",
            "checkin_en",
            "foto_presencia_url",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "paso_nombre",
            "paso_orden",
            "paso_semana",
            "paso_es_control",
            "profesional_nombre",
            "checkin_verificado",
            "checkin_metodo",
            "checkin_en",
            "foto_presencia_url",
            "created_at",
            "updated_at",
        )

    def get_checkin_verificado(self, obj):
        return obj.checkin_verificado

    def get_foto_presencia_url(self, obj):
        path = obj.foto_presencia_url or (obj.foto_presencia.name if obj.foto_presencia else "")
        return get_signed_url(path, expires_in=3600) or ""

    def get_paso_nombre(self, obj):
        if obj.procedimiento_id:
            return obj.procedimiento.nombre
        if obj.paso_id:
            return obj.paso.nombre
        return None

    def get_paso_orden(self, obj):
        if obj.paso_id:
            return obj.paso.orden
        return None

    def get_paso_semana(self, obj):
        if obj.paso_id:
            return obj.paso.semana
        return None

    def get_paso_es_control(self, obj):
        if obj.paso_id:
            return obj.paso.es_control
        return False

    def get_procedimientos_ejecutados(self, obj):
        queryset = obj.procedimientos_ejecutados.all()
        if queryset.exists():
            return [procedimiento.nombre for procedimiento in queryset]
        if obj.procedimiento_id:
            return [obj.procedimiento.nombre]
        return []

    def get_consentimientos(self, obj):
        if obj.consentimientos_verificados.exists():
            return [
                {
                    "procedimiento": consentimiento.procedimiento.nombre if consentimiento.procedimiento_id else None,
                    "template_nombre": consentimiento.template_nombre,
                    "estado": "vigente" if consentimiento.vigente else "vencido",
                    "fecha_firma": consentimiento.fecha_firma,
                    "vence": consentimiento.vigencia_hasta if consentimiento.vigente else None,
                    "vencio": None if consentimiento.vigente else consentimiento.vigencia_hasta,
                }
                for consentimiento in obj.consentimientos_verificados.all()
            ]

        from apps.protocolos.services import consentimiento_status_sesion

        return consentimiento_status_sesion(obj)["consentimientos"]


class TratamientoPacienteSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    servicio_nombre = serializers.CharField(source="servicio.nombre", read_only=True)
    tratamiento_catalogo_nombre = serializers.CharField(source="tratamiento_catalogo.nombre", read_only=True)
    total_pasos = serializers.SerializerMethodField()
    pasos_completados = serializers.SerializerMethodField()
    total_sesiones = serializers.SerializerMethodField()
    sesiones_completadas = serializers.SerializerMethodField()
    progreso_pct = serializers.SerializerMethodField()
    sesiones = SesionProcedimientoSerializer(many=True, read_only=True)
    grupos = serializers.SerializerMethodField()

    class Meta:
        model = TratamientoPaciente
        fields = (
            "id",
            "paciente",
            "paciente_nombre",
            "servicio",
            "servicio_nombre",
            "tratamiento_catalogo",
            "tratamiento_catalogo_nombre",
            "cotizacion_item",
            "estado",
            "fecha_inicio",
            "activo",
            "total_pasos",
            "pasos_completados",
            "total_sesiones",
            "sesiones_completadas",
            "progreso_pct",
            "grupos",
            "sesiones",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            "servicio": {"required": False, "allow_null": True},
            "tratamiento_catalogo": {"required": False, "allow_null": True},
        }

    def get_total_pasos(self, obj):
        return obj.total_pasos

    def get_pasos_completados(self, obj):
        return obj.pasos_completados

    def get_progreso_pct(self, obj):
        return obj.progreso_pct

    def get_total_sesiones(self, obj):
        return obj.total_sesiones

    def get_sesiones_completadas(self, obj):
        return obj.sesiones_completadas

    def get_grupos(self, obj):
        grupos = []
        tipos = {}
        for sesion in obj.sesiones.select_related("tipo_sesion").prefetch_related(
            "procedimientos_ejecutados",
            "consentimientos_verificados",
            "tipo_sesion__procedimientos__procedimiento",
        ).all():
            tipo = sesion.tipo_sesion
            if tipo is None:
                continue
            key = str(tipo.id)
            if key not in tipos:
                procedimientos = [item.procedimiento.nombre for item in tipo.procedimientos.filter(activo=True).all()]
                tipos[key] = {
                    "tipo_sesion_id": str(tipo.id),
                    "tipo_sesion_nombre": tipo.nombre,
                    "procedimientos": procedimientos,
                    "total": 0,
                    "completadas": 0,
                    "pendientes": 0,
                    "sesiones": [],
                }
            grupo = tipos[key]
            grupo["total"] += 1
            if sesion.estado == SesionProcedimiento.Estado.COMPLETADO:
                grupo["completadas"] += 1
            elif sesion.estado == SesionProcedimiento.Estado.PENDIENTE:
                grupo["pendientes"] += 1
            grupo["sesiones"].append(SesionProcedimientoSerializer(sesion, context=self.context).data)
        grupos.extend(tipos.values())
        return grupos

    def validate(self, attrs):
        paciente = attrs.get("paciente", getattr(self.instance, "paciente", None))
        servicio = attrs.get("servicio", getattr(self.instance, "servicio", None))
        tratamiento_catalogo = attrs.get("tratamiento_catalogo", getattr(self.instance, "tratamiento_catalogo", None))
        cotizacion_item = attrs.get("cotizacion_item", getattr(self.instance, "cotizacion_item", None))
        request = self.context["request"]

        if paciente and servicio and paciente.clinica_id != servicio.clinica_id:
            raise serializers.ValidationError({"servicio": "El servicio no pertenece a la misma clinica del paciente."})
        if paciente and tratamiento_catalogo and paciente.clinica_id != tratamiento_catalogo.clinica_id:
            raise serializers.ValidationError(
                {"tratamiento_catalogo": "El tratamiento no pertenece a la misma clinica del paciente."}
            )
        if request.user.rol != "superadmin" and paciente and paciente.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"paciente": "El paciente no pertenece a tu clinica."})
        if not servicio and not tratamiento_catalogo:
            raise serializers.ValidationError({"error": "Debes enviar servicio o tratamiento_catalogo."})
        if cotizacion_item:
            if paciente and cotizacion_item.cotizacion.paciente_id != paciente.id:
                raise serializers.ValidationError({"cotizacion_item": "El item no corresponde al paciente."})
            if tratamiento_catalogo and cotizacion_item.tratamiento_id != tratamiento_catalogo.id:
                raise serializers.ValidationError({"cotizacion_item": "El item no corresponde al tratamiento."})
            if servicio and cotizacion_item.servicio_id != servicio.id:
                raise serializers.ValidationError({"cotizacion_item": "El item no corresponde al servicio."})
        return attrs

    def create(self, validated_data):
        tratamiento_catalogo = validated_data.get("tratamiento_catalogo")
        servicio = validated_data.get("servicio")
        if tratamiento_catalogo and servicio is None:
            primer_tipo = tratamiento_catalogo.tipos_sesion.filter(activo=True).order_by("orden").first()
            if primer_tipo is not None:
                primer_procedimiento = primer_tipo.procedimientos.filter(activo=True).select_related("procedimiento").first()
                if primer_procedimiento is not None:
                    validated_data["servicio"] = primer_procedimiento.procedimiento
                    servicio = primer_procedimiento.procedimiento
        with transaction.atomic():
            tratamiento = super().create(validated_data)
            if tratamiento_catalogo:
                sesiones = []
                for tipo in tratamiento_catalogo.tipos_sesion.filter(activo=True, es_compromiso=True).order_by("orden"):
                    tipo_procedimientos = list(tipo.procedimientos.filter(activo=True).select_related("procedimiento").order_by("orden"))
                    principal = tipo_procedimientos[0].procedimiento if tipo_procedimientos else None
                    for numero in range(1, tipo.cantidad + 1):
                        sesiones.append(
                            SesionProcedimiento(
                                tratamiento=tratamiento,
                                tipo_sesion=tipo,
                                numero=numero,
                                procedimiento=principal,
                            )
                        )
                SesionProcedimiento.objects.bulk_create(sesiones)
            else:
                pasos = list(servicio.pasos_protocolo.filter(activo=True).order_by("orden"))
                SesionProcedimiento.objects.bulk_create(
                    [SesionProcedimiento(tratamiento=tratamiento, paso=paso, procedimiento=servicio) for paso in pasos]
                )
            return tratamiento


class ConsentimientoPacienteSerializer(serializers.ModelSerializer):
    procedimiento_nombre = serializers.CharField(source="procedimiento.nombre", read_only=True)
    estado = serializers.SerializerMethodField()
    archivo_url = serializers.SerializerMethodField()

    class Meta:
        model = ConsentimientoPaciente
        fields = (
            "id",
            "paciente",
            "template_token",
            "template_nombre",
            "procedimiento",
            "procedimiento_nombre",
            "fecha_firma",
            "vigencia_hasta",
            "metodo",
            "archivo_url",
            "documenso_envelope_id",
            "notas",
            "estado",
            "created_at",
        )
        read_only_fields = ("id", "vigencia_hasta", "estado", "created_at", "archivo_url")
        extra_kwargs = {
            "paciente": {"required": False},
        }

    def get_estado(self, obj):
        return "vigente" if obj.vigente else "vencido"

    def get_archivo_url(self, obj):
        if not obj.archivo:
            return ""
        return get_signed_url(obj.archivo.name, expires_in=3600) or ""

    def validate(self, attrs):
        procedimiento = attrs.get("procedimiento")
        fecha_firma = attrs.get("fecha_firma", getattr(self.instance, "fecha_firma", date.today()))
        meses_vigencia = procedimiento.vigencia_meses if procedimiento else 12
        attrs["vigencia_hasta"] = fecha_firma + timedelta(days=30 * max(1, meses_vigencia))
        return attrs


class TratamientoPacienteListSerializer(TratamientoPacienteSerializer):
    class Meta(TratamientoPacienteSerializer.Meta):
        fields = tuple(field for field in TratamientoPacienteSerializer.Meta.fields if field != "sesiones")
