from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.core.models import BaseModel


AREA_CHOICES = [
    ("general",       "General"),
    ("agenda",        "Agenda"),
    ("pacientes",     "Pacientes"),
    ("atenciones",    "Atenciones"),
    ("cotizaciones",  "Cotizaciones"),
    ("cartera",       "Cartera y cobros"),
    ("consentimientos", "Consentimientos"),
    ("configuracion", "Configuración"),
    ("reportes",      "Reportes"),
]


def slug_unico(modelo, base: str, instance_pk=None, *, max_len: int = 60) -> str:
    """Slug derivado de ``base``, único en ``modelo`` (agrega -2, -3, ... si choca)."""
    raiz = slugify(base)[:max_len] or "item"
    candidato = raiz
    sufijo = 2
    qs = modelo.objects.all()
    if instance_pk:
        qs = qs.exclude(pk=instance_pk)
    while qs.filter(slug=candidato).exists():
        candidato = f"{raiz[:max_len - len(str(sufijo)) - 1]}-{sufijo}"
        sufijo += 1
    return candidato


class CategoriaAyuda(BaseModel):
    """Agrupa artículos del centro de ayuda. Contenido global (no por clínica)."""

    nombre      = models.CharField(max_length=100)
    slug        = models.SlugField(max_length=64, unique=True, blank=True)
    descripcion = models.CharField(max_length=255, blank=True)
    icono       = models.CharField(
        max_length=40, blank=True,
        help_text="Nombre de icono lucide, ej. 'calendar-days'.",
    )
    orden       = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "ayuda_categorias"
        ordering = ["orden", "nombre"]
        verbose_name = "categoría de ayuda"
        verbose_name_plural = "categorías de ayuda"

    def __str__(self):
        return self.nombre

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slug_unico(CategoriaAyuda, self.nombre, self.pk, max_len=64)
        super().save(*args, **kwargs)


class ArticuloAyuda(BaseModel):
    """FAQ / artículo del centro de ayuda. Un 'video de ayuda' es un artículo con ``video_url``."""

    class Estado(models.TextChoices):
        BORRADOR  = "borrador",  "Borrador"
        PUBLICADO = "publicado", "Publicado"
        ARCHIVADO = "archivado", "Archivado"

    categoria       = models.ForeignKey(
        CategoriaAyuda, on_delete=models.PROTECT, related_name="articulos",
    )
    titulo          = models.CharField(max_length=160)
    slug            = models.SlugField(max_length=180, unique=True, blank=True)
    resumen         = models.CharField(
        max_length=300, blank=True,
        help_text="Texto corto para las tarjetas y la búsqueda.",
    )
    contenido       = models.TextField(blank=True, help_text="Cuerpo del artículo en Markdown.")
    video_url       = models.URLField(
        blank=True,
        help_text="URL de YouTube o Vimeo (no listado). Opcional.",
    )
    keywords        = models.CharField(
        max_length=255, blank=True,
        help_text="Términos extra para la búsqueda, separados por coma.",
    )
    area            = models.CharField(max_length=30, blank=True, choices=AREA_CHOICES)
    orden           = models.PositiveIntegerField(default=0)
    destacado       = models.BooleanField(default=False)
    estado          = models.CharField(
        max_length=12, choices=Estado.choices, default=Estado.BORRADOR,
    )
    publicado_at    = models.DateTimeField(null=True, blank=True)
    vistas          = models.PositiveIntegerField(default=0)
    util_si         = models.PositiveIntegerField(default=0)
    util_no         = models.PositiveIntegerField(default=0)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="articulos_ayuda_editados",
    )

    class Meta:
        db_table = "ayuda_articulos"
        ordering = ["orden", "-publicado_at", "-created_at"]
        indexes = [
            models.Index(fields=["estado", "categoria"]),
            models.Index(fields=["estado", "destacado"]),
        ]
        verbose_name = "artículo de ayuda"
        verbose_name_plural = "artículos de ayuda"

    def __str__(self):
        return self.titulo

    @property
    def tiene_video(self) -> bool:
        return bool(self.video_url)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slug_unico(ArticuloAyuda, self.titulo, self.pk, max_len=180)
        # Se sella la primera vez que pasa a publicado; no se limpia al despublicar
        # para conservar el orden de "Novedades" si se vuelve a publicar.
        if self.estado == self.Estado.PUBLICADO and self.publicado_at is None:
            self.publicado_at = timezone.now()
        super().save(*args, **kwargs)
