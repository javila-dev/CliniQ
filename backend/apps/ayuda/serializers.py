from rest_framework import serializers
from django.utils.text import slugify

from .models import ArticuloAyuda, CategoriaAyuda
from .videos import embed_url, parse_video, thumbnail_url


class CategoriaAyudaSerializer(serializers.ModelSerializer):
    articulos_count = serializers.SerializerMethodField()
    articulos_total = serializers.SerializerMethodField()

    class Meta:
        model = CategoriaAyuda
        fields = (
            "id", "nombre", "slug", "descripcion", "icono", "orden",
            "articulos_count", "articulos_total", "created_at", "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def get_articulos_count(self, obj):
        valor = getattr(obj, "articulos_count", None)
        if valor is not None:
            return valor
        return obj.articulos.filter(estado=ArticuloAyuda.Estado.PUBLICADO).count()

    def get_articulos_total(self, obj):
        valor = getattr(obj, "articulos_total", None)
        if valor is not None:
            return valor
        return obj.articulos.count()


class ArticuloAyudaListSerializer(serializers.ModelSerializer):
    categoria_slug   = serializers.CharField(source="categoria.slug", read_only=True)
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    area_display     = serializers.CharField(source="get_area_display", read_only=True)
    tiene_video      = serializers.BooleanField(read_only=True)
    thumbnail_url    = serializers.SerializerMethodField()

    class Meta:
        model = ArticuloAyuda
        fields = (
            "id", "titulo", "slug", "resumen", "keywords",
            "categoria", "categoria_slug", "categoria_nombre",
            "area", "area_display", "tiene_video", "thumbnail_url",
            "destacado", "estado", "orden", "publicado_at", "updated_at",
        )

    def get_thumbnail_url(self, obj):
        proveedor, video_id = parse_video(obj.video_url)
        return thumbnail_url(proveedor, video_id)


class ArticuloAyudaDetailSerializer(ArticuloAyudaListSerializer):
    video_provider         = serializers.SerializerMethodField()
    video_id               = serializers.SerializerMethodField()
    video_embed_url        = serializers.SerializerMethodField()
    actualizado_por_nombre = serializers.SerializerMethodField()

    class Meta(ArticuloAyudaListSerializer.Meta):
        fields = ArticuloAyudaListSerializer.Meta.fields + (
            "contenido", "video_url", "video_provider", "video_id", "video_embed_url",
            "vistas", "util_si", "util_no", "actualizado_por_nombre", "created_at",
        )

    def get_video_provider(self, obj):
        return parse_video(obj.video_url)[0]

    def get_video_id(self, obj):
        return parse_video(obj.video_url)[1]

    def get_video_embed_url(self, obj):
        return embed_url(*parse_video(obj.video_url))

    def get_actualizado_por_nombre(self, obj):
        return obj.actualizado_por.nombre_completo if obj.actualizado_por_id else None


class ArticuloAyudaWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticuloAyuda
        fields = (
            "id", "categoria", "titulo", "slug", "resumen", "contenido",
            "video_url", "keywords", "area", "destacado", "estado", "orden",
        )
        read_only_fields = ("id",)
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def validate_slug(self, value):
        if not value:
            return value
        value = slugify(value)
        qs = ArticuloAyuda.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un artículo con ese slug.")
        return value

    def validate_video_url(self, value):
        if value and parse_video(value)[0] is None:
            raise serializers.ValidationError(
                "No reconocemos esa URL de video. Usa un enlace de YouTube o Vimeo."
            )
        return value


class ArticuloReordenSerializer(serializers.Serializer):
    categoria = serializers.UUIDField(required=False)
    orden = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)


class CategoriaReordenSerializer(serializers.Serializer):
    orden = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)


class FeedbackSerializer(serializers.Serializer):
    util = serializers.BooleanField()
