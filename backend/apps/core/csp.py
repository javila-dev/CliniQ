"""Reportes de la política de seguridad de contenido (CSP) del front.

El navegador manda aquí cada recurso que la política habría bloqueado. Mientras
la política estricta esté en modo "solo reporte", estos avisos dicen qué falta
permitir antes de activarla. Se registran en el log, sin guardar nada en la base.
"""
import json
import logging
from urllib.parse import urlsplit

from django.core.cache import cache
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger("cliniq.csp")

TAMANO_MAXIMO = 10_000
REPORTES_POR_IP = 60
VENTANA_SEG = 600
# El mismo bloqueo se repite en cada carga de página: se registra una vez por hora.
REPETIDO_SEG = 3600


def _sin_consulta(url):
    """Origen y ruta, sin la consulta: la URL puede llevar tokens o ids."""
    if not isinstance(url, str) or not url:
        return ""
    if "://" not in url:
        return url[:60]  # "inline", "eval", "data", "blob"...
    partes = urlsplit(url)
    return f"{partes.scheme}://{partes.netloc}{partes.path}"[:200]


def _ip(request):
    reenviada = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return reenviada.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


@csrf_exempt
@require_POST
def reporte_csp(request):
    if len(request.body) > TAMANO_MAXIMO:
        return HttpResponse(status=413)

    clave_ip = f"csp:ip:{_ip(request)}"
    cache.add(clave_ip, 0, VENTANA_SEG)
    if cache.incr(clave_ip) > REPORTES_POR_IP:
        return HttpResponse(status=204)

    try:
        datos = json.loads(request.body or b"{}")
    except ValueError:
        return HttpResponse(status=400)
    reporte = datos.get("csp-report") if isinstance(datos, dict) else None
    if not isinstance(reporte, dict):
        return HttpResponse(status=400)

    directiva = str(reporte.get("effective-directive") or reporte.get("violated-directive") or "")[:60]
    bloqueado = _sin_consulta(reporte.get("blocked-uri"))
    if cache.add(f"csp:visto:{directiva}:{bloqueado}", 1, REPETIDO_SEG):
        logger.warning(
            "CSP bloquearía %s en %s (página %s, %s:%s)",
            bloqueado or "?",
            directiva or "?",
            _sin_consulta(reporte.get("document-uri")),
            _sin_consulta(reporte.get("source-file")),
            reporte.get("line-number", ""),
        )
    return HttpResponse(status=204)
