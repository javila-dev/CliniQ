"""Valida search_fields, ordering_fields y filterset_fields de todas las vistas.

    docker exec cliniq_backend python scripts/auditoria/verificar_campos_vistas.py

Un nombre de campo inválido no falla al arrancar: da 500 recién cuando alguien
usa el buscador, el filtro o el orden (p. ej. M6-04, "Buscar paciente…" en Ingresos).

Falsos positivos conocidos: campos de orden que la vista agrega con annotate()
(CarteraViewSet: total_cobrado, saldo, proxima_cuota_fecha).
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.urls import URLResolver, get_resolver  # noqa: E402


def recorrer(patrones):
    for p in patrones:
        if isinstance(p, URLResolver):
            yield from recorrer(p.url_patterns)
        else:
            yield p


def probar(modelo, campo, orden=False):
    try:
        qs = modelo.objects.order_by(campo) if orden else modelo.objects.filter(**{f"{campo}__isnull": True})
        str(qs.query)
        return None
    except Exception as exc:  # noqa: BLE001
        return f"{type(exc).__name__}: {str(exc)[:90]}"


def main():
    vistas, errores = set(), []
    for patron in recorrer(get_resolver().url_patterns):
        cls = getattr(patron.callback, "cls", None)
        if cls is None or cls in vistas or getattr(cls, "queryset", None) is None:
            continue
        vistas.add(cls)
        modelo = cls.queryset.model
        for campo in getattr(cls, "search_fields", None) or ():
            if error := probar(modelo, campo.lstrip("^=@$")):
                errores.append(f"{cls.__name__}.search_fields {campo} -> {error}")
        ordenables = getattr(cls, "ordering_fields", None) or ()
        for campo in () if ordenables == "__all__" else ordenables:
            if error := probar(modelo, campo, orden=True):
                errores.append(f"{cls.__name__}.ordering_fields {campo} -> {error}")
        filtros = getattr(cls, "filterset_fields", None)
        for campo in filtros if isinstance(filtros, (list, tuple)) else (filtros or {}):
            if error := probar(modelo, campo):
                errores.append(f"{cls.__name__}.filterset_fields {campo} -> {error}")
    print("\n".join(errores) or "Sin campos inválidos.")
    print(f"Vistas revisadas: {len(vistas)}")


if __name__ == "__main__":
    main()
