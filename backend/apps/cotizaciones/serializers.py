from decimal import Decimal

from django.db import models, transaction
from django.db.models import Q
from rest_framework import serializers

from apps.cotizaciones.models import Cotizacion, CotizacionEnvio, FormaPagoCotizacion, ItemCotizacion
from apps.users.authorization import user_has_permission
from apps.users.permissions import get_clinica_activa


def lookup_campana_item(*, clinica, sede, procedimiento=None, tratamiento=None):
    from datetime import date
    from apps.clinicas.models import CampanaItem

    if not clinica or not (procedimiento or tratamiento):
        return None

    hoy = date.today()
    qs = CampanaItem.objects.filter(
        activo=True,
        campana__activo=True,
        campana__fecha_inicio__lte=hoy,
        campana__fecha_fin__gte=hoy,
        campana__clinica=clinica,
    ).select_related("campana")
    if sede:
        qs = qs.filter(Q(campana__sedes__isnull=True) | Q(campana__sedes=sede)).distinct()
    else:
        qs = qs.filter(campana__sedes__isnull=True)
    if procedimiento:
        qs = qs.filter(procedimiento=procedimiento)
    else:
        qs = qs.filter(tratamiento=tratamiento)
    return qs.first()


def lookup_precio_campana(*, clinica, sede, procedimiento=None, tratamiento=None):
    item = lookup_campana_item(
        clinica=clinica,
        sede=sede,
        procedimiento=procedimiento,
        tratamiento=tratamiento,
    )
    return item.precio_campana if item else None


def resolve_campana_for_item(*, clinica, sede, procedimiento=None, tratamiento=None, valor_unitario=None):
    """Return the campaign whose price was applied, or None."""
    if valor_unitario in (None, ""):
        return None
    campana_item = lookup_campana_item(
        clinica=clinica,
        sede=sede,
        procedimiento=procedimiento,
        tratamiento=tratamiento,
    )
    if campana_item and campana_item.precio_campana == valor_unitario:
        return campana_item.campana
    return None


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
    precio_campana_disponible = serializers.SerializerMethodField()
    campana_id = serializers.SerializerMethodField()
    campana_nombre = serializers.SerializerMethodField()
    descuento_maximo_pct = serializers.SerializerMethodField()
    precio_lista = serializers.SerializerMethodField()

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
            "descuento_maximo_pct",
            "precio_lista",
            "precio_bloqueado",
            "subtotal",
            "citas_agendadas",
            "citas_completadas",
            "citas_restantes",
            "precio_campana_disponible",
            "campana_id",
            "campana_nombre",
        )
        extra_kwargs = {
            "descripcion": {"required": False, "allow_blank": True},
            "num_citas": {"required": False},
            "valor_unitario": {"required": False},
            "precio_bloqueado": {"required": False},
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

        # Si el item tiene precio bloqueado y el usuario intenta un valor diferente al de catálogo,
        # requiere el permiso cotizaciones.cambiar_precio, salvo que el valor coincida con una campaña activa.
        precio_bloqueado = attrs.get(
            "precio_bloqueado",
            getattr(self.instance, "precio_bloqueado", False),
        )
        if precio_bloqueado:
            valor_unitario = attrs.get(
                "valor_unitario",
                getattr(self.instance, "valor_unitario", None),
            )
            catalogo_precio = None
            if tratamiento and tratamiento.precio_estimado is not None:
                catalogo_precio = tratamiento.precio_estimado
            elif procedimiento and getattr(procedimiento, "precio_base", None) is not None:
                catalogo_precio = procedimiento.precio_base
            if catalogo_precio is not None and valor_unitario is not None and valor_unitario != catalogo_precio:
                clinica, sede = self._resolve_clinica_sede()
                precio_campana = lookup_precio_campana(
                    clinica=clinica,
                    sede=sede,
                    procedimiento=procedimiento,
                    tratamiento=tratamiento,
                )
                permite_por_campana = precio_campana is not None and valor_unitario == precio_campana
                if not permite_por_campana and not (
                    request and user_has_permission(request.user, "cotizaciones.cambiar_precio", request=request)
                ):
                    raise serializers.ValidationError({
                        "valor_unitario": "No tienes permiso para modificar el precio de un item con precio bloqueado.",
                        "code": "PRECIO_BLOQUEADO",
                    })

        clinica, sede = self._resolve_clinica_sede()
        valor_unitario = attrs.get(
            "valor_unitario",
            getattr(self.instance, "valor_unitario", None),
        )
        attrs["campana"] = resolve_campana_for_item(
            clinica=clinica,
            sede=sede,
            procedimiento=procedimiento,
            tratamiento=tratamiento,
            valor_unitario=valor_unitario,
        )

        # Tope de descuento del catálogo: el precio efectivo del ítem
        # (valor_unitario ya con el descuento aplicado) no puede bajar de
        # precio_lista * (1 - descuento_maximo_pct/100). Es un tope DURO: no lo
        # levanta ningún permiso; para descontar más hay que subir el tope en el
        # catálogo o usar una campaña activa.
        precio_lista = None
        desc_max = Decimal("0")
        if tratamiento is not None and tratamiento.precio_estimado is not None:
            precio_lista = tratamiento.precio_estimado
            desc_max = tratamiento.descuento_maximo_pct or Decimal("0")
        elif procedimiento is not None and getattr(procedimiento, "precio_base", None) is not None:
            precio_lista = procedimiento.precio_base
            desc_max = getattr(procedimiento, "descuento_maximo_pct", None) or Decimal("0")

        if precio_lista is not None and valor_unitario not in (None, ""):
            descuento_pct = attrs.get(
                "descuento_porcentaje",
                getattr(self.instance, "descuento_porcentaje", Decimal("0")),
            ) or Decimal("0")
            valor_unit_dec = Decimal(valor_unitario)
            descuento_dec = Decimal(descuento_pct)
            precio_efectivo = valor_unit_dec * (Decimal("1") - descuento_dec / Decimal("100"))
            piso = Decimal(precio_lista) * (Decimal("1") - Decimal(desc_max) / Decimal("100"))
            precio_campana = lookup_precio_campana(
                clinica=clinica, sede=sede, procedimiento=procedimiento, tratamiento=tratamiento,
            )
            # Excepción: el ítem está a precio exacto de campaña activa y sin
            # descuento adicional encima (así funciona "aplicar precio de campaña").
            permite_por_campana = (
                precio_campana is not None
                and descuento_dec == 0
                and valor_unit_dec.quantize(Decimal("0.01")) == Decimal(precio_campana).quantize(Decimal("0.01"))
            )
            # tolerancia de 1 centavo por redondeo
            if not permite_por_campana and precio_efectivo < piso - Decimal("0.01"):
                if desc_max <= 0:
                    msg = (
                        "Este ítem no admite descuento. El precio no puede bajar del "
                        f"precio de lista (${float(precio_lista):,.0f})."
                    )
                else:
                    msg = (
                        f"El descuento supera el máximo permitido ({float(desc_max):g}%). "
                        f"El precio del ítem no puede bajar de ${float(piso):,.0f}."
                    )
                raise serializers.ValidationError({
                    "descuento_porcentaje": msg,
                    "code": "DESCUENTO_EXCEDE_MAXIMO",
                })

        return attrs

    def _resolve_clinica_sede(self):
        cotizacion = getattr(self.instance, "cotizacion", None)
        if cotizacion is not None:
            return cotizacion.clinica, cotizacion.sede
        cotizacion_ref = self.context.get("cotizacion_ref")
        if cotizacion_ref is not None:
            return cotizacion_ref.clinica, cotizacion_ref.sede
        return self.context.get("draft_clinica"), self.context.get("draft_sede")

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

    def _get_campana_item(self, obj):
        cache = getattr(self, "_campana_cache", None)
        if cache is None:
            self._campana_cache = {}
            cache = self._campana_cache
        obj_key = str(obj.pk)
        if obj_key in cache:
            return cache[obj_key]

        result = None
        if obj.procedimiento or obj.tratamiento:
            result = lookup_campana_item(
                clinica=obj.cotizacion.clinica,
                sede=getattr(obj.cotizacion, "sede", None),
                procedimiento=obj.procedimiento,
                tratamiento=obj.tratamiento,
            )

        cache[obj_key] = result
        return result

    def _catalogo_precio_descmax(self, obj):
        """(precio_lista, descuento_maximo_pct) del catálogo del ítem, o (None, None)."""
        if obj.tratamiento_id and obj.tratamiento and obj.tratamiento.precio_estimado is not None:
            return obj.tratamiento.precio_estimado, obj.tratamiento.descuento_maximo_pct
        proc = obj.procedimiento or obj.servicio
        if proc and getattr(proc, "precio_base", None) is not None:
            return proc.precio_base, getattr(proc, "descuento_maximo_pct", Decimal("0"))
        return None, None

    def get_descuento_maximo_pct(self, obj):
        _, desc_max = self._catalogo_precio_descmax(obj)
        return str(desc_max) if desc_max is not None else None

    def get_precio_lista(self, obj):
        precio_lista, _ = self._catalogo_precio_descmax(obj)
        return str(precio_lista) if precio_lista is not None else None

    def get_precio_campana_disponible(self, obj):
        item = self._get_campana_item(obj)
        return str(item.precio_campana) if item else None

    def get_campana_id(self, obj):
        if obj.campana_id:
            return str(obj.campana_id)
        item = self._get_campana_item(obj)
        return str(item.campana_id) if item else None

    def get_campana_nombre(self, obj):
        if obj.campana_id:
            return obj.campana.nombre
        item = self._get_campana_item(obj)
        return item.campana.nombre if item else None

    def _hydrate_from_tratamiento(self, attrs):
        tratamiento = attrs.get("tratamiento")
        if not tratamiento:
            return attrs
        if not attrs.get("descripcion"):
            attrs["descripcion"] = tratamiento.nombre
        if not attrs.get("num_citas"):
            attrs["num_citas"] = tratamiento.total_sesiones or 1
        if tratamiento.precio_estimado is not None:
            attrs["precio_bloqueado"] = True
            if attrs.get("valor_unitario") in (None, ""):
                attrs["valor_unitario"] = tratamiento.precio_estimado
        return attrs

    def _hydrate_from_procedimiento(self, attrs):
        procedimiento = attrs.get("procedimiento") or attrs.get("servicio")
        if not procedimiento:
            return attrs
        if not attrs.get("descripcion"):
            attrs["descripcion"] = procedimiento.nombre
        if not attrs.get("num_citas"):
            attrs["num_citas"] = 1
        if not attrs.get("duracion_estimada") and procedimiento.duracion_min:
            attrs["duracion_estimada"] = f"{procedimiento.duracion_min} min"
        precio_base = getattr(procedimiento, "precio_base", None)
        if precio_base is not None:
            attrs["precio_bloqueado"] = True
            if attrs.get("valor_unitario") in (None, ""):
                attrs["valor_unitario"] = precio_base
        elif procedimiento.precio is not None:
            if attrs.get("valor_unitario") in (None, ""):
                attrs["valor_unitario"] = procedimiento.precio
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
    total_pagado = serializers.SerializerMethodField()
    saldo_pendiente = serializers.SerializerMethodField()

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
            "total_pagado",
            "saldo_pendiente",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "fecha_vencimiento",
            "total",
            "total_pagado",
            "saldo_pendiente",
            "created_at",
            "updated_at",
        )

    def _total_pagado_valor(self, obj):
        """Suma de pagos recibidos de los cobros no anulados de la cotizacion.

        Se lee de la anotacion ``_total_pagado`` del queryset del viewset; si no
        viene anotado (p. ej. respuesta de create) se calcula al vuelo.
        """
        anotado = getattr(obj, "_total_pagado", None)
        if anotado is not None:
            return Decimal(anotado)
        from apps.cobros.models import Cobro, PagoRecibido

        total = (
            PagoRecibido.objects.filter(cobro__cotizacion=obj)
            .exclude(cobro__estado=Cobro.Estado.ANULADO)
            .aggregate(s=models.Sum("valor"))["s"]
        )
        return Decimal(total or 0)

    def get_total_pagado(self, obj):
        """Total abonado (string 2 decimales). None mientras la cotizacion no este aceptada."""
        if obj.estado != Cotizacion.Estado.ACEPTADA:
            return None
        return str(self._total_pagado_valor(obj).quantize(Decimal("0.01")))

    def get_saldo_pendiente(self, obj):
        """Saldo por cobrar = total - pagado (string 2 decimales). None si no esta aceptada."""
        if obj.estado != Cotizacion.Estado.ACEPTADA:
            return None
        saldo = Decimal(obj.total) - self._total_pagado_valor(obj)
        return str(saldo.quantize(Decimal("0.01")))

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["items"] = ItemCotizacionSerializer(
            instance.items.filter(activo=True), many=True, context=self.context
        ).data
        ret["formas_pago"] = FormaPagoCotizacionSerializer(
            instance.formas_pago.filter(activo=True), many=True, context=self.context
        ).data
        return ret

    def to_internal_value(self, data):
        items_field = self.fields.get("items")
        if items_field is not None:
            child = items_field.child
            if self.instance is not None:
                child.context["cotizacion_ref"] = self.instance
            else:
                request = self.context.get("request")
                if request:
                    clinica_draft = get_clinica_activa(request)
                    if clinica_draft:
                        child.context["draft_clinica"] = clinica_draft
                sede_id = data.get("sede") if isinstance(data, dict) else None
                if sede_id:
                    from apps.clinicas.models import Sede

                    try:
                        child.context["draft_sede"] = Sede.objects.get(pk=sede_id)
                    except (Sede.DoesNotExist, ValueError, TypeError):
                        pass
        return super().to_internal_value(data)

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
        clinica = get_clinica_activa(request) or validated_data["paciente"].clinica
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
    estado = serializers.ChoiceField(choices=(
        (Cotizacion.Estado.ACEPTADA, "Aceptada"),
        (Cotizacion.Estado.DESCARTADA, "Descartada"),
        (Cotizacion.Estado.BORRADOR, "Borrador"),
    ))


class EnviarCotizacionEmailSerializer(serializers.Serializer):
    destinatario = serializers.EmailField(required=False, allow_blank=False)
    notas = serializers.CharField(max_length=300, required=False, allow_blank=True)


class RegistrarEnvioCotizacionSerializer(serializers.Serializer):
    canal = serializers.ChoiceField(choices=((CotizacionEnvio.Canal.PDF, "PDF descargado"),))
    notas = serializers.CharField(max_length=300, required=False, allow_blank=True)
