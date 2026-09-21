from decimal import Decimal

from django.db import models, transaction
from django.db.models import Q
from rest_framework import serializers

from apps.clinicas.models import Sede
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio, FormaPagoCotizacion, ItemCotizacion
from apps.users.authorization import user_has_permission
from apps.users.permissions import get_clinica_activa


def campana_items_vigentes(*, clinica, sede):
    """CampanaItem activos de campañas vigentes de la clínica.

    Filtra por sede: una campaña sin sedes aplica a todas; con ``sede=None`` solo
    se consideran las campañas globales. Fuente única de la semántica "vigente"
    que comparten el lookup por ítem y el endpoint de precios de campaña.
    """
    from datetime import date
    from apps.clinicas.models import CampanaItem

    if not clinica:
        return CampanaItem.objects.none()

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
    return qs


def lookup_campana_item(*, clinica, sede, procedimiento=None, tratamiento=None):
    if not (procedimiento or tratamiento):
        return None

    qs = campana_items_vigentes(clinica=clinica, sede=sede)
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
    tipo_sesion_origen_nombre = serializers.SerializerMethodField()
    insumo_nombre = serializers.SerializerMethodField()
    insumo_unidad = serializers.SerializerMethodField()
    entregado_por_nombre = serializers.SerializerMethodField()
    sede_entrega = serializers.SerializerMethodField()
    sede_entrega_nombre = serializers.SerializerMethodField()
    stock_disponible = serializers.SerializerMethodField()
    # Posición (base 0) del ítem tratamiento de origen dentro de ``items``. Los
    # ítems se recrean con id nuevo en cada guardado, así que el origen no puede
    # viajar por id; el serializer de la cotización lo resuelve a ``item_origen``.
    origen_indice = serializers.IntegerField(write_only=True, required=False, allow_null=True, min_value=0)

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
            "es_obsequio",
            "agendable",
            "valor_referencia",
            "item_origen",
            "origen_indice",
            "tipo_sesion_origen",
            "tipo_sesion_origen_nombre",
            "insumo",
            "insumo_nombre",
            "insumo_unidad",
            "cantidad_insumo",
            "stock_disponible",
            "entregado_at",
            "entregado_por_nombre",
            "sede_entrega",
            "sede_entrega_nombre",
        )
        extra_kwargs = {
            "entregado_at": {"read_only": True},
            "descripcion": {"required": False, "allow_blank": True},
            "num_citas": {"required": False},
            "valor_unitario": {"required": False},
            "precio_bloqueado": {"required": False},
            "es_obsequio": {"required": False},
            "agendable": {"required": False},
            "valor_referencia": {"required": False},
            "item_origen": {"read_only": True},
            "tipo_sesion_origen": {"required": False, "allow_null": True},
            "insumo": {"required": False, "allow_null": True},
            "cantidad_insumo": {"required": False, "allow_null": True},
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
        es_obsequio = attrs.get("es_obsequio", getattr(self.instance, "es_obsequio", False))

        if tipo == ItemCotizacion.Tipo.INSUMO and not es_obsequio:
            raise serializers.ValidationError({"tipo": "Un producto solo puede agregarse como obsequio."})
        if es_obsequio and tipo == ItemCotizacion.Tipo.TRATAMIENTO:
            raise serializers.ValidationError(
                {"tipo": "Un tratamiento completo no puede ser un obsequio: obsequia una de sus sesiones."}
            )

        if servicio and not procedimiento:
            attrs["procedimiento"] = servicio
            procedimiento = servicio

        if tipo == ItemCotizacion.Tipo.INSUMO:
            attrs["tratamiento"] = None
            attrs["procedimiento"] = None
            attrs["servicio"] = None
            tratamiento = procedimiento = servicio = None
        elif tipo == ItemCotizacion.Tipo.TRATAMIENTO:
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

        if es_obsequio:
            # Un obsequio no pasa por las reglas de precio (bloqueo, tope de
            # descuento, campaña): su valor cobrado es siempre 0.
            return self._validar_obsequio(attrs, tipo=tipo, procedimiento=procedimiento, request=request)
        self._limpiar_campos_obsequio(attrs)

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

    @staticmethod
    def _limpiar_campos_obsequio(attrs):
        attrs["es_obsequio"] = False
        attrs["agendable"] = False
        attrs["valor_referencia"] = Decimal("0.00")
        attrs["tipo_sesion_origen"] = None
        attrs["insumo"] = None
        attrs["cantidad_insumo"] = None
        attrs["origen_indice"] = None

    def _validar_obsequio(self, attrs, *, tipo, procedimiento, request):
        """Reglas de un ítem obsequio (valor cobrado 0, valor de referencia aparte).

        El cruce con los demás ítems (que el origen sea un tratamiento de la misma
        cotización) lo valida ``CotizacionSerializer``, que ve la lista completa.
        """
        Tipo = ItemCotizacion.Tipo
        insumo = attrs.get("insumo", getattr(self.instance, "insumo", None))
        tipo_sesion = attrs.get("tipo_sesion_origen", getattr(self.instance, "tipo_sesion_origen", None))
        agendable = attrs.get("agendable", getattr(self.instance, "agendable", False))
        cantidad_insumo = attrs.get("cantidad_insumo", getattr(self.instance, "cantidad_insumo", None))
        indice = attrs.get("origen_indice")
        es_superadmin = bool(request and request.user.rol == "superadmin")
        clinica_usuario = request.user.clinica_id if request else None

        referencia = attrs.get("valor_referencia") or Decimal("0")
        if not referencia:
            if procedimiento is not None:
                referencia = getattr(procedimiento, "precio_base", None) or procedimiento.precio or Decimal("0")
            elif tipo == Tipo.INSUMO and insumo is not None:
                referencia = insumo.precio_venta or Decimal("0")
        attrs["valor_referencia"] = Decimal(referencia)
        attrs["valor_unitario"] = Decimal("0.00")
        attrs["descuento_porcentaje"] = Decimal("0.00")
        attrs["precio_bloqueado"] = False
        attrs["campana"] = None
        attrs["es_obsequio"] = True

        if tipo == Tipo.INSUMO:
            if insumo is None:
                raise serializers.ValidationError({"insumo": "Selecciona el producto a obsequiar."})
            if not insumo.activo:
                raise serializers.ValidationError({"insumo": "El producto está inactivo."})
            if not es_superadmin and insumo.clinica_id != clinica_usuario:
                raise serializers.ValidationError({"insumo": "El producto no pertenece a tu clinica."})
            if cantidad_insumo is None or cantidad_insumo <= 0:
                raise serializers.ValidationError({"cantidad_insumo": "Debe ser mayor a 0."})
            attrs["agendable"] = False
            attrs["num_citas"] = 1
            attrs["tipo_sesion_origen"] = None
            attrs["origen_indice"] = None
            if not attrs.get("descripcion", getattr(self.instance, "descripcion", "")):
                attrs["descripcion"] = insumo.nombre
        else:
            attrs["insumo"] = None
            attrs["cantidad_insumo"] = None
            if tipo == Tipo.PROCEDIMIENTO:
                attrs["tipo_sesion_origen"] = None
                attrs["origen_indice"] = None
            elif tipo_sesion is not None:
                if indice is None:
                    raise serializers.ValidationError(
                        {"origen_indice": "Indica el tratamiento del que se clona la sesión."}
                    )
                if not es_superadmin and tipo_sesion.tratamiento.clinica_id != clinica_usuario:
                    raise serializers.ValidationError({"tipo_sesion_origen": "La sesión no pertenece a tu clinica."})
                if agendable and not (tipo_sesion.es_compromiso and tipo_sesion.activo):
                    raise serializers.ValidationError(
                        {"tipo_sesion_origen": "Solo se puede obsequiar como sesión agendable un tipo de sesión de compromiso."}
                    )
                if not attrs.get("descripcion", getattr(self.instance, "descripcion", "")):
                    attrs["descripcion"] = tipo_sesion.nombre
            elif agendable:
                raise serializers.ValidationError(
                    {
                        "agendable": (
                            "Una sesión obsequio agendable debe ser un procedimiento del catálogo "
                            "o una sesión clonada de un tratamiento cotizado."
                        )
                    }
                )
            else:
                attrs["origen_indice"] = None

        if not attrs.get("descripcion", getattr(self.instance, "descripcion", "")):
            raise serializers.ValidationError({"descripcion": "Este campo es obligatorio."})
        return attrs

    def get_tipo_sesion_origen_nombre(self, obj):
        return obj.tipo_sesion_origen.nombre if obj.tipo_sesion_origen_id else None

    def get_insumo_nombre(self, obj):
        return obj.insumo.nombre if obj.insumo_id else None

    def get_insumo_unidad(self, obj):
        return obj.insumo.unidad_medida if obj.insumo_id else None

    def get_entregado_por_nombre(self, obj):
        return obj.entregado_por.nombre_completo if obj.entregado_por_id else None

    def get_sede_entrega(self, obj):
        return str(obj.movimiento_entrega.sede_id) if obj.movimiento_entrega_id else None

    def get_sede_entrega_nombre(self, obj):
        return obj.movimiento_entrega.sede.nombre if obj.movimiento_entrega_id else None

    def get_stock_disponible(self, obj):
        """Stock del producto en la sede de la cotización, para avisar antes de entregar.

        Solo aplica a obsequios de producto aún no entregados y con sede definida;
        es informativo (la entrega vuelve a validar el stock).
        """
        if obj.tipo != ItemCotizacion.Tipo.INSUMO or obj.entregado_at is not None:
            return None
        sede_id = obj.cotizacion.sede_id
        if not sede_id or not obj.insumo_id:
            return None
        from apps.inventario.models import StockInsumoSede

        stock = (
            StockInsumoSede.objects.filter(insumo_id=obj.insumo_id, sede_id=sede_id)
            .values_list("stock_actual", flat=True)
            .first()
        )
        return str(stock if stock is not None else Decimal("0"))

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
        if not obj.es_obsequio and (obj.procedimiento or obj.tratamiento):
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
        if obj.es_obsequio:
            return None, None
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
            # 100% de descuento máximo = precio libre: se pre-carga pero no se
            # bloquea ni exige permiso para cambiarlo.
            desc_max = tratamiento.descuento_maximo_pct or Decimal("0")
            attrs["precio_bloqueado"] = Decimal(desc_max) < Decimal("100")
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
            desc_max = getattr(procedimiento, "descuento_maximo_pct", None) or Decimal("0")
            attrs["precio_bloqueado"] = Decimal(desc_max) < Decimal("100")
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
            "es_migracion",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "es_migracion",
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
            instance.items.filter(activo=True).select_related(
                "cotizacion", "insumo", "tipo_sesion_origen", "entregado_por", "movimiento_entrega__sede",
            ),
            many=True,
            context=self.context,
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
        self._validate_obsequios(attrs.get("items"))
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

    def _validate_obsequios(self, items):
        """Reglas que cruzan ítems: al menos un ítem pagado y origen de las sesiones clonadas."""
        if not items:
            return
        if all(item.get("es_obsequio") for item in items):
            raise serializers.ValidationError(
                {"items": "La cotización debe incluir al menos un ítem que no sea obsequio."}
            )
        for posicion, item in enumerate(items):
            indice = item.get("origen_indice")
            if indice is None:
                continue
            origen = items[indice] if indice < len(items) and indice != posicion else None
            tipo_sesion = item.get("tipo_sesion_origen")
            if (
                origen is None
                or origen.get("es_obsequio")
                or origen.get("tipo") != ItemCotizacion.Tipo.TRATAMIENTO
                or origen.get("tratamiento") is None
                or tipo_sesion is None
                or tipo_sesion.tratamiento_id != origen["tratamiento"].id
            ):
                raise serializers.ValidationError(
                    {
                        "items": (
                            f"El obsequio del ítem {posicion + 1} debe clonar una sesión de un "
                            "tratamiento incluido en esta misma cotización."
                        )
                    }
                )

    def _validate_items_clinica(self, items, clinica):
        if not items or not clinica:
            return
        for index, item in enumerate(items, start=1):
            for field in ("tratamiento", "procedimiento", "servicio", "insumo"):
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

    @staticmethod
    def _crear_items(cotizacion, items_data):
        """Crea los ítems y enlaza cada sesión obsequiada clonada con su tratamiento.

        El origen llega como posición dentro de la lista (``origen_indice``); el pk
        de cada ítem se genera al instanciarlo, así que se puede referenciar antes
        del ``bulk_create``.
        """
        objetos = []
        indices = []
        for item_data in items_data:
            datos = {k: v for k, v in item_data.items() if k != "id"}
            indices.append(datos.pop("origen_indice", None))
            objetos.append(ItemCotizacion(cotizacion=cotizacion, **datos))
        for objeto, indice in zip(objetos, indices):
            if indice is not None:
                objeto.item_origen_id = objetos[indice].pk
        ItemCotizacion.objects.bulk_create(objetos)

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
        self._crear_items(cotizacion, items_data)
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
            self._crear_items(instance, items_data)

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


class EntregarObsequioSerializer(serializers.Serializer):
    sede = serializers.PrimaryKeyRelatedField(queryset=Sede.objects.filter(activo=True))

    def validate_sede(self, sede):
        request = self.context.get("request")
        if request and request.user.rol != "superadmin" and sede.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError("La sede no pertenece a tu clinica.")
        return sede


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
