import logging
import re
import unicodedata

import requests
from django.conf import settings


logger = logging.getLogger(__name__)


class DocumensoTemplatesConfigurationError(Exception):
    pass


class DocumensoTemplatesUpstreamError(Exception):
    pass


def _extract_template_token(template: dict) -> str | None:
    direct_link = template.get("directLink") or template.get("direct_link") or {}
    return (
        direct_link.get("token")
        or direct_link.get("publicId")
        or direct_link.get("public_id")
        or direct_link.get("externalId")
        or direct_link.get("external_id")
        or template.get("externalId")
        or template.get("external_id")
        or template.get("publicId")
        or template.get("public_id")
        or template.get("templatePublicId")
        or template.get("template_public_id")
        or template.get("token")
    )


def _build_documenso_bearer_token(raw_api_key: str) -> str:
    api_key = (raw_api_key or "").strip()
    if api_key.lower().startswith("bearer "):
        api_key = api_key[7:].strip()
    return f"Bearer {api_key}"


def _normalize_template_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_text.lower()
    return re.sub(r"[^a-z0-9]+", " ", lowered).strip()


def _infer_template_tipo(*, nombre: str | None, token: str | None) -> str:
    haystack = " ".join(filter(None, [_normalize_template_text(nombre), _normalize_template_text(token)]))

    if "toxina botulinica" in haystack or "botulinica" in haystack:
        return "toxina_botulinica"
    if "relleno" in haystack:
        return "rellenos"
    if any(keyword in haystack for keyword in ("laser", "luz pulsada", "ipl", "co2")):
        return "laser"
    if any(keyword in haystack for keyword in ("peeling", "exfoliacion", "exfoliaciones")):
        return "peelings"
    if "mesoterapia" in haystack:
        return "mesoterapia"
    if "general" in haystack:
        return "general"
    return "otros"


def _ensure_local_template(*, clinica, nombre: str | None, token: str | None):
    from apps.configuracion.models import DocumensoConsentimientoTemplate

    if not token:
        return None

    existing = DocumensoConsentimientoTemplate.objects.filter(clinica=clinica, template_token=token).first()
    if existing is not None:
        return existing

    tipo = _infer_template_tipo(nombre=nombre, token=token)
    created = DocumensoConsentimientoTemplate.objects.create(
        clinica=clinica,
        tipo=tipo,
        template_token=token,
    )
    logger.info(
        "Documenso template local autocreado | clinica_id=%s template_id=%s tipo=%s token=%s",
        clinica.id,
        created.id,
        created.tipo,
        created.template_token,
    )
    return created


def listar_templates_documenso_disponibles(*, clinica) -> list[dict]:
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY:
        raise DocumensoTemplatesConfigurationError("La integracion con Documenso no esta configurada.")

    url = f"{settings.DOCUMENSO_API_URL.rstrip('/')}/api/v1/templates"
    headers = {
        "Authorization": _build_documenso_bearer_token(settings.DOCUMENSO_API_KEY),
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        logger.exception("No fue posible listar templates desde Documenso")
        raise DocumensoTemplatesUpstreamError("No fue posible consultar los templates en Documenso.") from exc
    except ValueError as exc:
        logger.exception("Documenso devolvio una respuesta invalida al listar templates")
        raise DocumensoTemplatesUpstreamError("Documenso devolvio una respuesta invalida.") from exc

    templates = payload.get("templates") or []
    mapped_templates = []
    for template in templates:
        token = _extract_template_token(template)
        nombre = template.get("title") or template.get("name")
        if not token:
            logger.warning(
                "Template de Documenso sin token/publicId detectable | template_id=%s keys=%s",
                template.get("id"),
                sorted(template.keys()),
            )
        configurado = _ensure_local_template(clinica=clinica, nombre=nombre, token=token)
        mapped_templates.append(
            {
                "id": str(configurado.id) if configurado else None,
                "documenso_id": template.get("id"),
                "nombre": nombre,
                "token": token,
            }
        )
    return mapped_templates
