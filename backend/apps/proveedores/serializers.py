from __future__ import annotations

from django.db import transaction
from rest_framework import serializers

from apps.proveedores.models import ItemOrdenCompra, OrdenCompra, Proveedor


class ProveedorSerializer(serializers.ModelSerializer):
    nombre_clinica = serializers.CharField(source="clinica.nombre", read_only=True)

    class Meta:
        model = Proveedor
        fields = (
            "id",
            "clinica",
            "nombre",
            "nombre_clinica",
            "nit",
            "contacto",
            "telefono",
            "email",
            "categoria",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_clinica(self, value):
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.rol != "superadmin":
            if value.id != request.user.clinica_id:
                raise serializers.ValidationError("No puedes asignar proveedores a otra clinica.")
        return value


class ItemOrdenCompraSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    insumo_nombre = serializers.CharField(source="insumo.nombre", read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    pendiente_recibir = serializers.DecimalField(max_digits=10, decimal_places=3, read_only=True)

    class Meta:
        model = ItemOrdenCompra
        fields = (
            "id",
            "insumo",
            "insumo_nombre",
            "cantidad",
            "precio_unitario",
            "cantidad_recibida",
            "pendiente_recibir",
            "subtotal",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "cantidad_recibida",
            "pendiente_recibir",
            "subtotal",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        cantidad = attrs.get("cantidad")
        precio_unitario = attrs.get("precio_unitario")
        if cantidad is not None and cantidad <= 0:
            raise serializers.ValidationError({"cantidad": "La cantidad debe ser mayor a 0."})
        if precio_unitario is not None and precio_unitario <= 0:
            raise serializers.ValidationError({"precio_unitario": "El precio unitario debe ser mayor a 0."})
        return attrs


class OrdenCompraSerializer(serializers.ModelSerializer):
    items = ItemOrdenCompraSerializer(many=True)
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)
    created_by_nombre = serializers.CharField(source="created_by.nombre_completo", read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = OrdenCompra
        fields = (
            "id",
            "proveedor",
            "proveedor_nombre",
            "sede",
            "sede_nombre",
            "numero",
            "fecha",
            "fecha_entrega_esperada",
            "estado",
            "notas",
            "created_by",
            "created_by_nombre",
            "total",
            "items",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "numero",
            "created_by",
            "created_by_nombre",
            "total",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        request = self.context.get("request")
        proveedor = attrs.get("proveedor") or getattr(self.instance, "proveedor", None)
        sede = attrs.get("sede") or getattr(self.instance, "sede", None)
        estado = attrs.get("estado") or getattr(self.instance, "estado", OrdenCompra.Estado.BORRADOR)
        items = self.initial_data.get("items") if hasattr(self, "initial_data") else None

        if proveedor and sede and proveedor.clinica_id != sede.clinica_id:
            raise serializers.ValidationError(
                {"error": "El proveedor y la sede deben pertenecer a la misma clinica.", "code": "CLINICA_NO_COINCIDE"}
            )

        if request and request.user.is_authenticated and request.user.rol != "superadmin":
            if proveedor and proveedor.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError(
                    {"error": "No puedes crear ordenes para otra clinica.", "code": "CLINICA_INVALIDA"}
                )

        if self.instance and self.instance.estado in {
            OrdenCompra.Estado.RECIBIDA_PARCIAL,
            OrdenCompra.Estado.RECIBIDA_TOTAL,
            OrdenCompra.Estado.CANCELADA,
        }:
            raise serializers.ValidationError(
                {"error": "No puedes editar una orden ya cerrada o recibida.", "code": "ORDEN_BLOQUEADA"}
            )

        if estado in {OrdenCompra.Estado.RECIBIDA_PARCIAL, OrdenCompra.Estado.RECIBIDA_TOTAL}:
            raise serializers.ValidationError(
                {"error": "Los estados de recepcion solo pueden definirse desde la accion recibir.", "code": "ESTADO_INVALIDO"}
            )

        if not self.instance and not items:
            raise serializers.ValidationError(
                {"error": "Debes agregar al menos un item a la orden.", "code": "SIN_ITEMS"}
            )

        return attrs

    def _validar_insumos(self, orden, items_data):
        for item_data in items_data:
            insumo = item_data["insumo"]
            if insumo.clinica_id != orden.proveedor.clinica_id:
                raise serializers.ValidationError(
                    {
                        "error": f"El insumo '{insumo.nombre}' no pertenece a la clinica de la orden.",
                        "code": "INSUMO_CLINICA_INVALIDA",
                    }
                )

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        validated_data["created_by"] = self.context["request"].user
        orden = OrdenCompra.objects.create(**validated_data)
        self._validar_insumos(orden, items_data)
        ItemOrdenCompra.objects.bulk_create(
            [ItemOrdenCompra(orden=orden, **item_data) for item_data in items_data]
        )
        return orden

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            existentes = {str(item.id): item for item in instance.items.filter(activo=True)}
            enviados = set()
            self._validar_insumos(instance, items_data)

            for item_data in items_data:
                item_id = str(item_data.get("id", "")) if item_data.get("id") else ""
                if item_id and item_id in existentes:
                    item = existentes[item_id]
                    if item.cantidad_recibida > 0:
                        raise serializers.ValidationError(
                            {"error": "No puedes editar items ya recibidos parcialmente.", "code": "ITEM_RECIBIDO"}
                        )
                    for attr, value in item_data.items():
                        if attr != "id":
                            setattr(item, attr, value)
                    item.save()
                    enviados.add(item_id)
                else:
                    item_data.pop("id", None)
                    ItemOrdenCompra.objects.create(orden=instance, **item_data)

            for item_id, item in existentes.items():
                if item_id not in enviados and item.cantidad_recibida == 0:
                    item.activo = False
                    item.save(update_fields=["activo", "updated_at"])
        return instance


class RecepcionItemSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    cantidad = serializers.DecimalField(max_digits=10, decimal_places=3)


class RecepcionOrdenSerializer(serializers.Serializer):
    items_recibidos = RecepcionItemSerializer(many=True)
