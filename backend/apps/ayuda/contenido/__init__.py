"""Corpus de contenido del centro de ayuda.

Fuente única del contenido base que se publica en `/ayuda`. Se carga con:

* la migración de datos ``ayuda.0003_contenido_ayuda`` (deploy automático), y
* el comando ``python manage.py cargar_ayuda`` (para refrescar tras editar aquí).

Ambos caminos llaman a :func:`cargar`, que hace *upsert* por ``slug``: crea lo
que falta y reescribe lo que ya existe. Los slugs de los artículos son parte del
contrato público (URLs de `/ayuda/articulo/<slug>` y la ayuda contextual
`helpSlug` de `PageHeader`), así que se cambian solo a conciencia.

Cada artículo es un dict con:

``slug``        identificador estable, no cambiar a la ligera.
``categoria``   slug de la categoría a la que pertenece.
``titulo``      título visible.
``resumen``     una frase para las tarjetas y la búsqueda.
``area``        una de ``apps.ayuda.models.AREA_CHOICES``.
``keywords``    sinónimos y términos que el usuario buscaría, separados por coma.
``destacado``   aparece en el landing de `/ayuda`.
``contenido``   cuerpo en Markdown. Los ``##`` arman el índice lateral.
"""

from apps.ayuda.contenido import (
    agenda,
    atenciones,
    cartera,
    catalogo,
    configuracion,
    consentimientos,
    cotizaciones,
    finanzas,
    inventario,
    pacientes,
    primeros_pasos,
)

CATEGORIAS = [
    {
        "slug": "primeros-pasos",
        "nombre": "Primeros pasos",
        "descripcion": "Qué es CliniQ, cómo moverte por la aplicación y qué dejar listo antes de empezar.",
        "icono": "rocket",
    },
    {
        "slug": "agenda",
        "nombre": "Agenda y citas",
        "descripcion": "Agendar, confirmar, reprogramar y bloquear horarios.",
        "icono": "calendar-days",
    },
    {
        "slug": "pacientes",
        "nombre": "Pacientes e historia clínica",
        "descripcion": "Fichas, antecedentes, fotos de evolución y datos sensibles.",
        "icono": "users",
    },
    {
        "slug": "atenciones",
        "nombre": "Atención al paciente",
        "descripcion": "La cola del día, el asistente de inicio y la nota clínica.",
        "icono": "stethoscope",
    },
    {
        "slug": "cotizaciones",
        "nombre": "Cotizaciones y ventas",
        "descripcion": "Armar propuestas, precios, campañas y qué pasa al aceptarlas.",
        "icono": "clipboard-list",
    },
    {
        "slug": "cartera-y-cobros",
        "nombre": "Cartera y cobros",
        "descripcion": "Cuotas, abonos, mora, bloqueo por deuda y acuerdos de pago.",
        "icono": "wallet",
    },
    {
        "slug": "caja-e-ingresos",
        "nombre": "Caja, ingresos y resultados",
        "descripcion": "Cobros del día, apertura y cierre de caja, gastos y márgenes.",
        "icono": "receipt",
    },
    {
        "slug": "consentimientos",
        "nombre": "Consentimientos y firmas",
        "descripcion": "Consentimientos informados, registro de asistencia y firma digital.",
        "icono": "file-signature",
    },
    {
        "slug": "catalogo",
        "nombre": "Catálogo de servicios",
        "descripcion": "Procedimientos, tratamientos, sesiones y zonas del cuerpo.",
        "icono": "package",
    },
    {
        "slug": "configuracion",
        "nombre": "Configuración y equipo",
        "descripcion": "Usuarios, roles, sedes, recordatorios, auditoría y puesta en marcha.",
        "icono": "settings-2",
    },
    {
        "slug": "inventario",
        "nombre": "Inventario y compras",
        "descripcion": "Insumos, movimientos de stock, proveedores y órdenes de compra.",
        "icono": "boxes",
    },
]

ARTICULOS = [
    *primeros_pasos.ARTICULOS,
    *agenda.ARTICULOS,
    *pacientes.ARTICULOS,
    *atenciones.ARTICULOS,
    *cotizaciones.ARTICULOS,
    *cartera.ARTICULOS,
    *finanzas.ARTICULOS,
    *consentimientos.ARTICULOS,
    *catalogo.ARTICULOS,
    *configuracion.ARTICULOS,
    *inventario.ARTICULOS,
]


def _validar():
    """Chequeos baratos para que un error de tipeo no llegue a producción."""
    slugs_categoria = {c["slug"] for c in CATEGORIAS}
    vistos = set()
    for art in ARTICULOS:
        slug = art["slug"]
        if slug in vistos:
            raise ValueError(f"Artículo de ayuda duplicado: {slug}")
        vistos.add(slug)
        if art["categoria"] not in slugs_categoria:
            raise ValueError(f"Artículo {slug}: categoría desconocida {art['categoria']!r}")


_validar()


def cargar(CategoriaAyuda, ArticuloAyuda, *, ahora=None, stdout=None):
    """Inserta o actualiza categorías y artículos a partir de este corpus.

    Recibe los modelos por parámetro para poder llamarse tanto desde una
    migración (modelos históricos) como desde un comando (modelos reales).
    Es idempotente: correrla dos veces deja el mismo resultado.

    No borra nada: un artículo cargado a mano desde el panel de gestión que no
    esté en este corpus se queda como está.
    """
    from django.utils import timezone

    ahora = ahora or timezone.now()
    creados = actualizados = 0

    categorias = {}
    for orden, data in enumerate(CATEGORIAS):
        cat, creada = CategoriaAyuda.objects.get_or_create(
            slug=data["slug"],
            defaults={
                "nombre": data["nombre"],
                "descripcion": data["descripcion"],
                "icono": data["icono"],
                "orden": orden,
            },
        )
        if not creada:
            cat.nombre = data["nombre"]
            cat.descripcion = data["descripcion"]
            cat.icono = data["icono"]
            cat.orden = orden
            cat.save()
        categorias[data["slug"]] = cat

    # `orden` se reinicia por categoría siguiendo el orden de este archivo.
    contador_por_categoria = {}
    for art in ARTICULOS:
        cat_slug = art["categoria"]
        orden = contador_por_categoria.get(cat_slug, 0)
        contador_por_categoria[cat_slug] = orden + 1

        campos = {
            "categoria": categorias[cat_slug],
            "titulo": art["titulo"],
            "resumen": art["resumen"],
            "contenido": art["contenido"].strip() + "\n",
            "area": art.get("area", ""),
            "keywords": art.get("keywords", ""),
            "destacado": art.get("destacado", False),
            "orden": orden,
            "estado": "publicado",
        }

        obj = ArticuloAyuda.objects.filter(slug=art["slug"]).first()
        if obj is None:
            ArticuloAyuda.objects.create(slug=art["slug"], publicado_at=ahora, **campos)
            creados += 1
        else:
            for campo, valor in campos.items():
                setattr(obj, campo, valor)
            if obj.publicado_at is None:
                obj.publicado_at = ahora
            obj.save()
            actualizados += 1

    if stdout is not None:
        stdout.write(
            f"Centro de ayuda: {len(CATEGORIAS)} categorías, "
            f"{creados} artículos creados, {actualizados} actualizados."
        )
    return {"creados": creados, "actualizados": actualizados}
