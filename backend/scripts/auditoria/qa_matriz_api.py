"""Matriz endpoint x perfil: estado HTTP y cuántos registros ve cada usuario QA.

    docker exec cliniq_backend python scripts/auditoria/qa_matriz_api.py

Llama cada GET sin parámetros de ruta (listados, contadores, catálogos) y los
detalles de los registros de salida/qa_ids.json, como cada perfil de
qa_roles_seed.py. Todo corre en una transacción que se deshace al final.
Salida: salida/qa_matriz_api.json
"""

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.users.authorization import get_user_permission_keys  # noqa: E402
from apps.users.models import User  # noqa: E402

AQUI = Path(__file__).resolve().parent / "salida"
# Rutas que no son de la app de la clínica o que tienen efectos (descargas pesadas, webhooks, consola).
EXCLUIR = re.compile(
    r"^api/v1/(admin/|console/|auth/(logout|google|refresh|firma-movil|captura)|webhooks?/|public|registro|"
    r"documenso|whatsapp/webhook|n8n|health|schema|docs)|/pdf/?$|exportar|export|descargar|plantilla-excel|\.(?:pdf|xlsx)"
)


def rutas(patrones, prefijo=""):
    for p in patrones:
        if isinstance(p, URLResolver):
            yield from rutas(p.url_patterns, prefijo + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefijo + str(p.pattern), p


def a_ruta(regex):
    """Convierte el patrón a una URL fija; None si necesita parámetros."""
    r = regex.replace("^", "").replace("$", "")
    if "<" in r or "(?P" in r or "\\." in r or "[" in r:
        return None
    return "/" + r


def contar(data):
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        if "count" in data and isinstance(data.get("results"), list):
            return data["count"]
        if isinstance(data.get("results"), list):
            return len(data["results"])
        return "obj"
    return None


def main():
    credenciales = json.loads((AQUI / "qa_usuarios.json").read_text(encoding="utf-8"))
    ids = json.loads((AQUI / "qa_ids.json").read_text(encoding="utf-8"))
    urls = set()
    for regex, patron in rutas(get_resolver().url_patterns):
        url = a_ruta(regex)
        if not url or not url.startswith("/api/v1/") or EXCLUIR.search(url[1:]):
            continue
        cb = patron.callback
        metodos = getattr(cb, "actions", None)
        if metodos is not None and "get" not in metodos:
            continue
        cls = getattr(cb, "cls", None) or getattr(cb, "view_class", None)
        if cls is not None and metodos is None and "get" not in [m.lower() for m in getattr(cls, "http_method_names", [])]:
            continue
        if cls is not None and metodos is None and not hasattr(cls, "get"):
            continue
        urls.add(url)
    detalles = {
        "/api/v1/pacientes/{paciente}/": "paciente",
        "/api/v1/agenda/citas/{cita_a}/": "cita_a",
        "/api/v1/agenda/citas/{cita_b}/": "cita_b",
        "/api/v1/cotizaciones/{cotizacion_a}/": "cotizacion_a",
        "/api/v1/cotizaciones/{cotizacion_b}/": "cotizacion_b",
        "/api/v1/cotizaciones/{venta_a}/": "venta_a",
        "/api/v1/cotizaciones/{venta_b}/": "venta_b",
        "/api/v1/cartera/{cartera}/": "cartera",
        "/api/v1/clinicas/procedimientos/{procedimiento}/": "procedimiento",
    }
    for plantilla in detalles:
        urls.add(plantilla.format(**ids))

    resultado = {"urls": sorted(urls), "perfiles": {}}
    with transaction.atomic():
        for clave, cred in credenciales.items():
            user = User.objects.get(email=cred["email"])
            api = APIClient(SERVER_NAME="localhost")
            api.force_authenticate(user)
            fila = {"permisos": sorted(get_user_permission_keys(user)), "respuestas": {}}
            for url in sorted(urls):
                try:
                    r = api.get(url)
                    fila["respuestas"][url] = {
                        "status": r.status_code,
                        "n": contar(getattr(r, "data", None)) if r.status_code < 400 else None,
                        "detalle": (str(getattr(r, "data", ""))[:160] if r.status_code >= 400 else None),
                    }
                except Exception as e:  # noqa: BLE001 - se registra la excepción del endpoint
                    fila["respuestas"][url] = {"status": "excepcion", "n": None, "detalle": repr(e)[:200]}
            resultado["perfiles"][clave] = fila
            print(clave, sum(1 for v in fila["respuestas"].values() if v["status"] == 200), "/", len(urls))
        transaction.set_rollback(True)
    (AQUI / "qa_matriz_api.json").write_text(json.dumps(resultado, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
