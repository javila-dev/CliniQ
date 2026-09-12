import os
import uuid

from django.db.models import Count, F, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.storage import get_public_url, upload_public_file
from apps.users.permissions import PuedeGestionarAyuda

from .models import ArticuloAyuda, CategoriaAyuda
from .permissions import PuedeVerAyuda
from .serializers import (
    ArticuloAyudaDetailSerializer,
    ArticuloAyudaListSerializer,
    ArticuloAyudaWriteSerializer,
    ArticuloReordenSerializer,
    CategoriaAyudaSerializer,
    CategoriaReordenSerializer,
    FeedbackSerializer,
)

IMAGEN_TIPOS_OK = {"image/png", "image/jpeg", "image/webp", "image/gif"}
IMAGEN_MAX_BYTES = 5 * 1024 * 1024
_PUBLICADO = ArticuloAyuda.Estado.PUBLICADO


def es_gestor(request) -> bool:
    """True si el usuario puede editar el centro de ayuda (superadmin o is_staff)."""
    return PuedeGestionarAyuda().has_permission(request, None)


class CategoriaAyudaViewSet(viewsets.ModelViewSet):
    serializer_class = CategoriaAyudaSerializer
    lookup_field = "slug"

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [PuedeVerAyuda()]
        return [PuedeGestionarAyuda()]

    def get_queryset(self):
        return CategoriaAyuda.objects.annotate(
            articulos_count=Count("articulos", filter=Q(articulos__estado=_PUBLICADO)),
            articulos_total=Count("articulos"),
        ).order_by("orden", "nombre")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.articulos.exists():
            return Response(
                {"error": "La categoría tiene artículos. Muévelos o elimínalos primero."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="reordenar")
    def reordenar(self, request):
        serializer = CategoriaReordenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = [str(x) for x in serializer.validated_data["orden"]]
        existentes = set(map(str, CategoriaAyuda.objects.values_list("id", flat=True)))
        for posicion, cid in enumerate(ids):
            if cid in existentes:
                CategoriaAyuda.objects.filter(pk=cid).update(orden=posicion)
        return Response({"ok": True})


class ArticuloAyudaViewSet(viewsets.ModelViewSet):
    lookup_field = "slug"

    def get_permissions(self):
        if self.action in ("list", "retrieve", "feedback"):
            return [PuedeVerAyuda()]
        return [PuedeGestionarAyuda()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ArticuloAyudaWriteSerializer
        if self.action == "retrieve":
            return ArticuloAyudaDetailSerializer
        return ArticuloAyudaListSerializer

    def get_queryset(self):
        qs = ArticuloAyuda.objects.select_related("categoria", "actualizado_por")
        params = self.request.query_params

        if es_gestor(self.request):
            if self.action == "list" and (estado := params.get("estado")):
                qs = qs.filter(estado=estado)
        else:
            qs = qs.filter(estado=_PUBLICADO)

        if (categoria := params.get("categoria")):
            qs = qs.filter(categoria__slug=categoria)
        if (area := params.get("area")):
            qs = qs.filter(area=area)
        if params.get("tiene_video") in ("true", "1"):
            qs = qs.exclude(video_url="")
        if params.get("destacado") in ("true", "1"):
            qs = qs.filter(destacado=True)
        if (buscar := params.get("search")):
            qs = qs.filter(
                Q(titulo__icontains=buscar)
                | Q(resumen__icontains=buscar)
                | Q(keywords__icontains=buscar)
            )
        return qs

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        es_preview = request.query_params.get("preview") in ("1", "true")
        if instance.estado == _PUBLICADO and not es_preview:
            ArticuloAyuda.objects.filter(pk=instance.pk).update(vistas=F("vistas") + 1)
            instance.vistas += 1
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(actualizado_por=self.request.user)

    def perform_update(self, serializer):
        serializer.save(actualizado_por=self.request.user)

    def create(self, request, *args, **kwargs):
        write = self.get_serializer(data=request.data)
        write.is_valid(raise_exception=True)
        self.perform_create(write)
        salida = ArticuloAyudaDetailSerializer(write.instance, context=self.get_serializer_context())
        return Response(salida.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write = self.get_serializer(instance, data=request.data, partial=partial)
        write.is_valid(raise_exception=True)
        self.perform_update(write)
        salida = ArticuloAyudaDetailSerializer(write.instance, context=self.get_serializer_context())
        return Response(salida.data)

    @action(detail=False, methods=["post"], url_path="reordenar")
    def reordenar(self, request):
        serializer = ArticuloReordenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = [str(x) for x in serializer.validated_data["orden"]]
        qs = ArticuloAyuda.objects.all()
        if (categoria := serializer.validated_data.get("categoria")):
            qs = qs.filter(categoria_id=categoria)
        existentes = set(map(str, qs.values_list("id", flat=True)))
        for posicion, aid in enumerate(ids):
            if aid in existentes:
                ArticuloAyuda.objects.filter(pk=aid).update(orden=posicion)
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="feedback")
    def feedback(self, request, slug=None):
        instance = self.get_object()
        serializer = FeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        campo = "util_si" if serializer.validated_data["util"] else "util_no"
        ArticuloAyuda.objects.filter(pk=instance.pk).update(**{campo: F(campo) + 1})
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="duplicar")
    def duplicar(self, request, slug=None):
        original = self.get_object()
        copia = ArticuloAyuda(
            categoria=original.categoria,
            titulo=f"{original.titulo} (copia)",
            resumen=original.resumen,
            contenido=original.contenido,
            video_url=original.video_url,
            keywords=original.keywords,
            area=original.area,
            destacado=False,
            estado=ArticuloAyuda.Estado.BORRADOR,
            orden=original.orden,
            actualizado_por=request.user,
        )
        copia.save()
        salida = ArticuloAyudaDetailSerializer(copia, context=self.get_serializer_context())
        return Response(salida.data, status=status.HTTP_201_CREATED)


class SubirImagenAyudaView(APIView):
    """POST /api/v1/ayuda/imagenes/ — sube una imagen al bucket público y devuelve su URL."""

    permission_classes = [PuedeGestionarAyuda]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        archivo = request.FILES.get("archivo")
        if not archivo:
            return Response({"error": "Falta el archivo en el campo 'archivo'."}, status=400)
        if (archivo.content_type or "") not in IMAGEN_TIPOS_OK:
            return Response({"error": "Formato no permitido. Usa PNG, JPG, WebP o GIF."}, status=400)
        if archivo.size > IMAGEN_MAX_BYTES:
            return Response({"error": "La imagen supera el límite de 5 MB."}, status=400)

        ext = os.path.splitext(archivo.name)[1].lower() or ".png"
        path = f"ayuda/imagenes/{uuid.uuid4().hex}{ext}"
        upload_public_file(archivo.read(), path, archivo.content_type or "image/png")
        return Response({"url": get_public_url(path)}, status=status.HTTP_201_CREATED)
