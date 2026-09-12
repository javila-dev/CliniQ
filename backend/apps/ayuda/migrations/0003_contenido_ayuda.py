"""Reescribe el contenido del centro de ayuda desde ``apps.ayuda.contenido``.

Reemplaza el seed mínimo de ``0002_seed_ayuda`` por el corpus completo: mismas
categorías base (con sus slugs originales) más las nuevas, y los artículos
reescritos y ampliados. Los slugs de los nueve artículos originales se conservan,
así que los enlaces existentes y la ayuda contextual (``helpSlug``) siguen
funcionando.

Idempotente: hace *upsert* por slug y no borra artículos cargados a mano.
"""

from django.db import migrations


def cargar_contenido(apps, schema_editor):
    from apps.ayuda.contenido import cargar

    CategoriaAyuda = apps.get_model("ayuda", "CategoriaAyuda")
    ArticuloAyuda = apps.get_model("ayuda", "ArticuloAyuda")
    cargar(CategoriaAyuda, ArticuloAyuda)


class Migration(migrations.Migration):

    dependencies = [
        ("ayuda", "0002_seed_ayuda"),
    ]

    operations = [
        # Sin reversa: volver atrás dejaría el contenido anterior a medias y no
        # hay nada que ganar en borrarlo.
        migrations.RunPython(cargar_contenido, migrations.RunPython.noop),
    ]
