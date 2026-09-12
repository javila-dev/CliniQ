"""Carga o refresca el contenido del centro de ayuda.

Uso::

    python manage.py cargar_ayuda

Hace *upsert* por slug del corpus de ``apps.ayuda.contenido``: crea lo que falta
y reescribe lo que ya existe. No borra artículos creados desde el panel de
gestión que no estén en el corpus.

Correrlo después de editar cualquier archivo de ``apps/ayuda/contenido/``.
"""

from django.core.management.base import BaseCommand

from apps.ayuda.contenido import cargar
from apps.ayuda.models import ArticuloAyuda, CategoriaAyuda


class Command(BaseCommand):
    help = "Carga o actualiza las categorías y artículos del centro de ayuda."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Solo valida el corpus y muestra qué se cargaría, sin escribir.",
        )

    def handle(self, *args, **options):
        from apps.ayuda.contenido import ARTICULOS, CATEGORIAS

        if options["dry_run"]:
            self.stdout.write(
                f"Corpus válido: {len(CATEGORIAS)} categorías y {len(ARTICULOS)} artículos."
            )
            for categoria in CATEGORIAS:
                cuantos = sum(1 for a in ARTICULOS if a["categoria"] == categoria["slug"])
                self.stdout.write(f"  {categoria['nombre']}: {cuantos}")
            return

        resultado = cargar(CategoriaAyuda, ArticuloAyuda, stdout=self.stdout)
        self.stdout.write(
            self.style.SUCCESS(
                f"Listo. {resultado['creados']} creados, {resultado['actualizados']} actualizados."
            )
        )
