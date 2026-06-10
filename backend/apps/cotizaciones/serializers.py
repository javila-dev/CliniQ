from django.db import transaction
from rest_framework import serializers

from apps.cotizaciones.models import Cotizacion, CotizacionEnvio, FormaPagoCotizacion, ItemCotizacion


class ItemCotizacionSerializer(serializers.ModelSerializer):
    _TIPO_WAS_PROVIDED = "_tipo_was_provided"
    _CATALOGO_WAS_PROVIDED = "_catalogo_was_provided"

    id = serializers.UUIDField(required=False)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    tratamiento_nombre = serializers.SerializerMethodField()
    procedimiento_nombre = serializers.SerializerMethodField()
    citas_agendadas = serializers.SerializerMethodField()
    citas_completadas = serializers.SerializerMethodField()
    citas_restantes = serializers.SerializerMethodField()

    class Meta:
        model = ItemCotizacion
        fields = (
            "id",
            "tipo",
            "servicio",
            "tratamiento",
            "tratamiento_nombre",
            "procedimiento",
            "procedimiento_nombre",
            "descripcion",
            "num_citas",
            "duracion_estimada",
            "periodicidad",
            "valor_unitario",
            "descuento_porcentaje",
            "subtotal",
            "citas_agendadas",
            "citas_completadas",
            "citas_restantes",
        )
        extra_kwargs = {
            "descripcion": {"required": False, "allow_blank": True},
            "num_citas": {"required": False},
            "valor_unitario": {"required": False},
        }

    def validate_num_citas(self, value):
        if value <= 0:
            raise serializers.ValidationError("Debe ser mayor a 0.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        tipo_was_provided = attrs.pop(self._TIPO_WAS_PROVIDED, False)
        catalogo_was_provided = attrs.pop(self._CATALOGO_WAS_PROVIDED, False)
        tipo = attrs.get("tipo", getattr(self.instance, "tipo", ItemCotizacion.Tipo.LIBRE))
        servicio = attrs.get("servicio", getattr(self.instance, "servicio", None))
        tratamiento = attrs.get("tratamiento", getattr(self.instance, "tratamiento", None))
        procedimiento = attrs.get("procedimiento", getattr(self.instance, "procedimiento", None))
        cotizacion = getattr(self.instance, "cotizacion", None)
        request = self.context.get("request")

        if servicio and not procedimiento:
            attrs["procedimiento"] = servicio
            procedimiento = servicio

        if tipo == ItemCotizacion.Tipo.TRATAMIENTO:
            if not tratamiento:
                raise serializers.ValidationError({"tratamiento": "Requerido para tipo tratamiento."})
            attrs["procedimiento"] = None
            attrs["servicio"] = None
            procedimiento = None
            servicio = None
        elif tipo == ItemCotizacion.Tipo.PROCEDIMIENTO:
            if not procedimiento:
                raise serializers.ValidationError({"procedimiento": "Requerido para tipo procedimiento."})
            attrs["tratamiento"] = None
            tratamiento = None
        elif tipo == ItemCotizacion.Tipo.LIBRE:
            if tipo_was_provided or catalogo_was_provided:
                attrs["tratamiento"] = None
                attrs["procedimiento"] = None
                attrs["servicio"] = None
                tratamiento = None
                procedimiento = None
                servicio = None

        if servicio and cotizacion and servicio.clinica_id != cotizacion.clinica_id:
            raise serializers.ValidationError({"servicio": "El servicio no pertenece a la clinica de la cotizacion."})
        if servicio and request and request.user.rol != "superadmin" and servicio.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"servicio": "El servicio no pertenece a tu clinica."})
        if tratamiento and cotizacion and tratamiento.clinica_id != cotizacion.clinica_id:
            raise serializers.ValidationError({"tratamiento": "El tratamiento no pertenece a la clinica de la cotizacion."})
        if tratamiento and request and request.user.rol != "superadmin" and tratamiento.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"tratamiento": "El tratamiento no pertenece a tu clinica."})
        if procedimiento and cotizacion and procedimiento.clinica_id != cotizacion.clinica_id:
            raise serializers.ValidationError({"procedimiento": "El procedimiento no pertenece a la clinica de la cotizacion."})
        if procedimiento and request and request.user.rol != "superadmin" and procedimiento.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"procedimiento": "El procedimiento no pertenece a tu clinica."})
        if not attrs.get("descripcion", getattr(self.instance, "descripcion", "")):
            raise serializers.ValidationError({"descripcion": "Este campo es obligatorio."})
        if attrs.get("valor_unitario", getattr(self.instance, "valor_unitario", None)) in (None, ""):
            raise serializers.ValidationError({"valor_unitario": "Este campo es obligatorio."})
        return attrs

    def get_tratamiento_nombre(self, obj):
        return obj.tratamiento.nombre if obj.tratamiento_id else None

    def get_procedimiento_nombre(self, obj):
        procedimiento = obj.procedimiento or obj.servicio
        return procedimiento.nombre if procedimiento else None

    def get_citas_agendadas(self, obj):
        return obj.citas_no_canceladas()

    def get_citas_completadas(self, obj):
        return obj.citas.filter(estado="completada").count()

    def get_citas_restantes(self, obj):
        return obj.citas_restantes()

    def _hydrate_from_tratamiento(self, attrs):
        tratamiento = attrs.get("tratamiento")
        if not tratamiento:
            return attrs
        if not attrs.get("descripcion"):
            attrs["descripcion"] = tratamiento.nombre
        if attrs.get("valor_unitario") in (None, "") and tratamiento.precio_estimado is not None:
            attrs["valor_unitario"] = tratamiento.precio_estimado
        if not attrs.get("num_citas"):
            attrs["num_citas"] = tratamiento.total_sesiones or 1
        return attrs

    def _hydrate_from_procedimiento(self, attrs):
        procedimiento = attrs.get("procedimiento") or attrs.get("servicio")
        if not procedimiento:
            return attrs
        if not attrs.get("descripcion"):
            attrs["descripcion"] = procedimiento.nombre
        if attrs.get("valor_unitario") in (None, "") and procedimiento.precio is not None:
            attrs["valor_unitario"] = procedimiento.precio
        if not attrs.get("num_citas"):
            attrs["num_citas"] = 1
        if not attrs.get("duracion_estimada") and procedimiento.duracion_min:
            attrs["duracion_estimada"] = f"{procedimiento.duracion_min} min"
        return attrs

    def to_internal_value(self, data):
        attrs = super().to_internal_value(data)
        tipo_was_provided = "tipo" in data
        catalogo_was_provided = any(field in data for field in ("tratamiento", "procedimiento", "servicio"))
        if not tipo_was_provided:
            if attrs.get("tratamiento"):
                attrs["tipo"] = ItemCotizacion.Tipo.TRATAMIENTO
            elif attrs.get("procedimiento") or attrs.get("servicio"):
                attrs["tipo"] = ItemCotizacion.Tipo.PROCEDIMIENTO
            else:
                attrs.pop("tipo", None)
        if attrs.get("servicio") and not attrs.get("procedimiento"):
            attrs["procedimiento"] = attrs["servicio"]
        attrs = self._hydrate_from_tratamiento(attrs)
        attrs = self._hydrate_from_procedimiento(attrs)
        attrs[self._TIPO_WAS_PROVIDED] = tipo_was_provided
        attrs[self._CATALOGO_WAS_PROVIDED] = catalogo_was_provided
        return attrs


class FormaPagoCotizacionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = FormaPagoCotizacion
        fields = ("id", "tipo", "descripcion", "valor", "fecha")

    def validate_valor(self, value):
        if value <= 0:
            raise serializers.ValidationError("Debe ser mayor a 0.")
        return value


class CotizacionEnvioSerializer(serializers.ModelSerializer):
    enviado_por_nombre = serializers.CharField(source="enviado_por.nombre_completo", read_only=True)

    class Meta:
        model = CotizacionEnvio
        fields = (
            "id",
            "canal",
            "destinatario",
            "enviado_por",
            "enviado_por_nombre",
            "notas",
            "created_at",
        )
        read_only_fields = fields


class CotizacionSerializer(serializers.ModelSerializer):
    items = ItemCotizacionSerializer(many=True)
    formas_pago = FormaPagoCotizacionSerializer(many=True)
    envios = CotizacionEnvioSerializer(many=True, read_only=True)
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    fecha_vencimiento = serializers.DateField(read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Cotizacion
        fields = (
            "id",
            "paciente",
            "paciente_nombre",
            "profesional",
            "profesional_nombre",
            "sede",
            "estado",
            "validez_dias",
            "fecha_vencimiento",
            "notas",
            "items",
            "formas_pago",
            "envios",
            "total",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "fecha_vencimiento", "total", "created_at", "updated_at")

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["items"] = ItemCotizacionSerializer(
            instance.items.filter(activo=True), many=True, context=self.context
        ).data
        ret["formas_pago"] = FormaPagoCotizacionSerializer(
            instance.formas_pago.filter(activo=True), many=True, context=self.context
        ).data
        return ret

    def validate(self, attrs):
        request = self.context["request"]
        paciente = attrs.get("paciente", getattr(self.instance, "paciente", None))
        sede = attrs.get("sede", getattr(self.instance, "sede", None))
        estado = attrs.get("estado")
        clinica = getattr(self.instance, "clinica", None) or (paciente.clinica if paciente else None)

        if request.user.rol != "superadmin" and paciente and paciente.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"paciente": "El paciente no pertenece a tu clinica."})
        if request.user.rol != "superadmin" and sede and sede.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError({"sede": "La sede no pertenece a tu clinica."})
        if sede and clinica and sede.clinica_id != clinica.id:
            raise serializers.ValidationError({"sede": "La sede no pertenece a la clinica de la cotizacion."})
        self._validate_items_clinica(attrs.get("items"), clinica)
        if self.instance and self.instance.estado != Cotizacion.Estado.BORRADOR:
            raise serializers.ValidationError(
                {
                    "error": "Solo se pueden editar cotizaciones en borrador.",
                    "code": "COTIZACION_NO_EDITABLE",
                }
            )
        if estado is not None and estado != Cotizacion.Estado.BORRADOR:
            raise serializers.ValidationError(
                {"error": "El estado solo puede cambiarse desde la accion cambiar_estado.", "code": "ESTADO_INVALIDO"}
            )
        return attrs

    def _validate_items_clinica(self, items, clinica):
        if not items or not clinica:
            return
        for index, item in enumerate(items, start=1):
            for field in ("tratamiento", "procedimiento", "servicio"):
                catalogo = item.get(field)
                if catalogo and catalogo.clinica_id != clinica.id:
                    raise serializers.ValidationError(
                        {
                            "items": (
                                f"El campo {field} del item {index} no pertenece "
                                "a la clinica de la cotizacion."
                            )
                        }
                    )

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        formas_pago_data = validated_data.pop("formas_pago")
        request = self.context["request"]
        clinica = request.user.clinica or validated_data["paciente"].clinica
        if not validated_data.get("sede"):
            validated_data["sede"] = clinica.sedes.filter(activo=True).order_by("created_at").first()
        cotizacion = Cotizacion.objects.create(
            **validated_data,
            clinica=clinica,
            profesional=validated_data.get("profesional") or request.user,
        )
        ItemCotizacion.objects.bulk_create([ItemCotizacion(cotizacion=cotizacion, **item) for item in items_data])
        FormaPagoCotizacion.objects.bulk_create(
            [FormaPagoCotizacion(cotizacion=cotizacion, **forma) for forma in formas_pago_data]
        )
        return cotizacion

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        formas_pago_data = validated_data.pop("formas_pago", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            instance.items.filter(activo=True).update(activo=False)
            ItemCotizacion.objects.bulk_create([
                ItemCotizacion(cotizacion=instance, **{k: v for k, v in item_data.items() if k != "id"})
                for item_data in items_data
            ])

        if formas_pago_data is not None:
            existentes = {str(item.id): item for item in instance.formas_pago.filter(activo=True)}
            enviados = set()
            for forma_data in formas_pago_data:
                forma_id = str(forma_data.get("id", "")) if forma_data.get("id") else ""
                if forma_id and forma_id in existentes:
                    forma = existentes[forma_id]
                    for attr, value in forma_data.items():
                        if attr != "id":
                            setattr(forma, attr, value)
                    forma.save()
                    enviados.add(forma_id)
                else:
                    forma_data.pop("id", None)
                    FormaPagoCotizacion.objects.create(cotizacion=instance, **forma_data)
            for forma_id, forma in existentes.items():
                if forma_id not in enviados:
                    forma.activo = False
                    forma.save(update_fields=["activo", "updated_at"])

        instance.refresh_from_db()
        return instance


class CambiarEstadoCotizacionSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=((Cotizacion.Estado.ACEPTADA, "Aceptada"),))


class EnviarCotizacionEmailSerializer(serializers.Serializer):
    destinatario = serializers.EmailField(required=False, allow_blank=False)
    notas = serializers.CharField(max_length=300, required=False, allow_blank=True)


class RegistrarEnvioCotizacionSerializer(serializers.Serializer):
    canal = serializers.ChoiceField(choices=((CotizacionEnvio.Canal.PDF, "PDF descargado"),))
    notas = serializers.CharField(max_length=300, required=False, allow_blank=True)
