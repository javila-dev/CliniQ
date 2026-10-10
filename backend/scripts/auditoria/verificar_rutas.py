"""Cruza las llamadas del frontend con las rutas reales del backend.

Primero, en el host:  python backend/scripts/auditoria/extraer_llamadas_frontend.py
Luego:  docker exec cliniq_backend python scripts/auditoria/verificar_rutas.py

Reporta:
- llamadas a rutas que no existen (404 seguro);
- llamadas con un método que la ruta no acepta (405 seguro);
- rutas del backend que ningún archivo del frontend llama (código muerto o
  pantalla faltante; revisar a mano: algunas las usa n8n o un link público).
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.urls import Resolver404, URLPattern, URLResolver, get_resolver, resolve  # noqa: E402

AQUI = Path(__file__).resolve().parent
PREFIJO = "/api/v1"
VALORES = ["00000000-0000-4000-8000-000000000001", "1", "abc"]
METODOS = ["get", "post", "put", "patch", "delete"]


def metodos_de(match) -> set[str]:
    func = match.func
    acciones = getattr(func, "actions", None)
    if acciones:
        return {m.upper() for m in acciones}
    cls = getattr(func, "view_class", None) or getattr(func, "cls", None)
    if cls is None:
        return set(m.upper() for m in METODOS)
    return {m.upper() for m in METODOS if hasattr(cls, m)}


def resolver(ruta: str):
    ruta = ruta.split("?")[0]
    if not ruta.startswith("/"):
        ruta = "/" + ruta
    for valor in VALORES:
        candidata = PREFIJO + ruta.replace("{p}", valor)
        try:
            return resolve(candidata)
        except Resolver404:
            continue
    return None


def recorrer(patrones, prefijo=""):
    for p in patrones:
        if isinstance(p, URLResolver):
            yield from recorrer(p.url_patterns, prefijo + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefijo + str(p.pattern), p


def main():
    llamadas = json.loads((AQUI / "salida" / "llamadas_frontend.json").read_text(encoding="utf-8"))
    no_existen, metodo_malo, dinamicas = [], [], []
    usadas = set()
    for ll in llamadas:
        ruta = ll["ruta"]
        if not ruta.startswith("/") or "{dyn}" in ruta:
            dinamicas.append(ll)
            continue
        match = resolver(ruta)
        if match is None:
            no_existen.append(ll)
            continue
        usadas.add(match.func)
        if ll["metodo"] not in metodos_de(match):
            metodo_malo.append({**ll, "acepta": sorted(metodos_de(match)), "vista": match.view_name})

    sin_uso = []
    for patron, p in recorrer(get_resolver().url_patterns):
        if not patron.startswith("api/v1/"):
            continue
        if p.pattern.regex.pattern.endswith(r"\.(?P<format>[a-z0-9]+)/?$"):
            continue
        if p.callback not in usadas and p.name != "api-root":
            sin_uso.append(f"{patron}  ({p.name})")

    def fmt(ll):
        return f"{ll['archivo']}:{ll['linea']}  {ll['metodo']} {ll['ruta']}"

    lineas = [f"# Rutas: {len(llamadas)} llamadas del frontend", ""]
    lineas += [f"## No existen en el backend ({len(no_existen)})", *[fmt(x) for x in no_existen], ""]
    lineas += [f"## Método no aceptado ({len(metodo_malo)})"]
    lineas += [f"{fmt(x)}  -> acepta {x['acepta']} ({x['vista']})" for x in metodo_malo]
    lineas += ["", f"## Ruta armada en variables, revisar a mano ({len(dinamicas)})", *[fmt(x) for x in dinamicas]]
    lineas += ["", f"## Rutas del backend sin llamada desde el frontend ({len(sin_uso)})", *sorted(sin_uso)]
    (AQUI / "salida" / "rutas.txt").write_text("\n".join(lineas), encoding="utf-8")
    print(f"no existen={len(no_existen)} metodo={len(metodo_malo)} dinamicas={len(dinamicas)} sin_uso={len(sin_uso)}")


if __name__ == "__main__":
    main()
