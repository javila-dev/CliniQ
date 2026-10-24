"""Cliente mínimo de la API de Wompi (Colombia) para el cobro recurrente.

La tarjeta la tokeniza el navegador directo en Wompi con la llave pública; aquí
solo llegan tokens. Con la llave privada se crea la fuente de pago y se cobra sin
el cliente presente. Docs: https://docs.wompi.co/docs/colombia/fuentes-de-pago/
"""

import hashlib
import hmac
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

URLS = {"sandbox": "https://sandbox.wompi.co/v1", "production": "https://production.wompi.co/v1"}
TIMEOUT = 20

# Estados finales de una transacción.
APROBADA = "APPROVED"
RECHAZADA = "DECLINED"
ANULADA = "VOIDED"
ERROR = "ERROR"
PENDIENTE = "PENDING"


class WompiError(Exception):
    """Wompi rechazó la petición o no respondió. El mensaje se puede mostrar."""


def configurado() -> bool:
    return bool(settings.WOMPI_PUBLIC_KEY and settings.WOMPI_PRIVATE_KEY and settings.WOMPI_INTEGRITY_SECRET)


def base_url() -> str:
    return URLS.get(settings.WOMPI_ENV, URLS["sandbox"])


def _pedir(metodo: str, ruta: str, *, privada: bool = True, **kwargs) -> dict:
    headers = kwargs.pop("headers", {})
    if privada:
        headers["Authorization"] = f"Bearer {settings.WOMPI_PRIVATE_KEY}"
    try:
        resp = requests.request(metodo, f"{base_url()}{ruta}", headers=headers, timeout=TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        logger.warning("Wompi no respondió: %s %s (%s)", metodo, ruta, exc)
        raise WompiError("No pudimos comunicarnos con la pasarela de pago. Intenta de nuevo en unos minutos.") from exc
    try:
        cuerpo = resp.json()
    except ValueError:
        cuerpo = {}
    if resp.status_code >= 400:
        logger.warning("Wompi respondió %s en %s %s: %s", resp.status_code, metodo, ruta, cuerpo.get("error"))
        raise WompiError(_mensaje_error(cuerpo))
    return cuerpo.get("data") or {}


def _mensaje_error(cuerpo: dict) -> str:
    error = cuerpo.get("error") or {}
    mensajes = error.get("messages")
    if isinstance(mensajes, dict):
        for valor in mensajes.values():
            if isinstance(valor, list) and valor:
                return f"La pasarela de pago rechazó los datos: {valor[0]}"
    if error.get("reason"):
        return f"La pasarela de pago rechazó la operación: {error['reason']}"
    return "La pasarela de pago rechazó la operación."


def tokens_aceptacion() -> dict:
    """Políticas de Wompi que el usuario debe aceptar antes de guardar la tarjeta."""
    data = _pedir("GET", "/merchants/info", privada=False, headers={"x-merchant-public-key": settings.WOMPI_PUBLIC_KEY})
    politicas = data.get("presigned_acceptance") or {}
    datos_personales = data.get("presigned_personal_data_auth") or {}
    return {
        "acceptance_token": politicas.get("acceptance_token", ""),
        "acceptance_permalink": politicas.get("permalink", ""),
        "personal_auth_token": datos_personales.get("acceptance_token", ""),
        "personal_auth_permalink": datos_personales.get("permalink", ""),
    }


def crear_fuente_pago(*, token: str, email: str, acceptance_token: str, accept_personal_auth: str) -> dict:
    return _pedir("POST", "/payment_sources", json={
        "type": "CARD",
        "token": token,
        "customer_email": email,
        "acceptance_token": acceptance_token,
        "accept_personal_auth": accept_personal_auth,
    })


def anular_fuente_pago(fuente_id: str) -> None:
    _pedir("PUT", f"/payment_sources/{fuente_id}/void")


def firma_integridad(referencia: str, monto_centavos: int, moneda: str = "COP") -> str:
    texto = f"{referencia}{monto_centavos}{moneda}{settings.WOMPI_INTEGRITY_SECRET}"
    return hashlib.sha256(texto.encode()).hexdigest()


def cobrar(*, referencia: str, monto_centavos: int, email: str, fuente_id: str) -> dict:
    """Cobro sin el cliente presente con la tarjeta guardada (COF recurrente)."""
    return _pedir("POST", "/transactions", json={
        "amount_in_cents": monto_centavos,
        "currency": "COP",
        "signature": firma_integridad(referencia, monto_centavos),
        "customer_email": email,
        "reference": referencia,
        "payment_source_id": int(fuente_id) if str(fuente_id).isdigit() else fuente_id,
        "payment_method": {"installments": 1},
        "recurrent": True,
    })


def consultar_transaccion(transaccion_id: str) -> dict:
    return _pedir("GET", f"/transactions/{transaccion_id}")


def _valor(datos: dict, ruta: str):
    for parte in ruta.split("."):
        datos = datos.get(parte) if isinstance(datos, dict) else None
    return datos


def evento_valido(evento: dict) -> bool:
    """Checksum del evento: valores de signature.properties (rutas dentro de
    `data`, en orden) + timestamp + secreto de eventos, en SHA256."""
    firma = evento.get("signature") or {}
    propiedades = firma.get("properties") or []
    if not settings.WOMPI_EVENTS_SECRET or not propiedades or not firma.get("checksum"):
        return False
    texto = "".join(str(_valor(evento.get("data") or {}, p)) for p in propiedades)
    texto += f"{evento.get('timestamp', '')}{settings.WOMPI_EVENTS_SECRET}"
    calculado = hashlib.sha256(texto.encode()).hexdigest()
    return hmac.compare_digest(calculado.upper(), str(firma["checksum"]).upper())
