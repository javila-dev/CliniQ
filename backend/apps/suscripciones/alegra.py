"""Cliente mínimo de la API de Alegra (Colombia) para la factura electrónica de
la suscripción. Docs: https://developer.alegra.com/reference/post_invoices

Autenticación Basic con correo y token. Límite: 150 solicitudes por minuto.
"""

import base64
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

URL = "https://api.alegra.com/api/v1"
TIMEOUT = 30


class AlegraError(Exception):
    def __init__(self, mensaje: str, cuerpo: dict | None = None, status: int | None = None):
        super().__init__(mensaje)
        self.cuerpo = cuerpo or {}
        self.status = status


def configurado() -> bool:
    return bool(
        settings.ALEGRA_EMAIL and settings.ALEGRA_TOKEN and settings.ALEGRA_NUMBER_TEMPLATE_ID
        and settings.ALEGRA_ITEM_ID and settings.ALEGRA_BANK_ACCOUNT_ID
    )


def _auth() -> str:
    return "Basic " + base64.b64encode(f"{settings.ALEGRA_EMAIL}:{settings.ALEGRA_TOKEN}".encode()).decode()


def _pedir(metodo: str, ruta: str, **kwargs):
    try:
        resp = requests.request(
            metodo, f"{URL}{ruta}", headers={"Authorization": _auth(), "Accept": "application/json"},
            timeout=TIMEOUT, **kwargs,
        )
    except requests.RequestException as exc:
        raise AlegraError(f"Alegra no respondió: {exc}") from exc
    try:
        cuerpo = resp.json()
    except ValueError:
        cuerpo = {}
    if resp.status_code >= 400:
        mensaje = cuerpo.get("message") if isinstance(cuerpo, dict) else None
        logger.warning("Alegra respondió %s en %s %s: %s", resp.status_code, metodo, ruta, mensaje)
        raise AlegraError(mensaje or f"Alegra respondió {resp.status_code}", cuerpo if isinstance(cuerpo, dict) else {}, resp.status_code)
    return cuerpo


def listar(ruta: str, **params) -> list:
    datos = _pedir("GET", ruta, params=params)
    return datos if isinstance(datos, list) else datos.get("data", [])


def buscar_contacto(numero_documento: str) -> dict | None:
    for contacto in listar("/contacts", identification=numero_documento):
        identificacion = contacto.get("identificationObject") or {}
        if str(identificacion.get("number") or contacto.get("identification")) == str(numero_documento):
            return contacto
    return None


def crear_contacto(datos: dict) -> dict:
    return _pedir("POST", "/contacts", json=datos)


def actualizar_contacto(contacto_id: str, datos: dict) -> dict:
    return _pedir("PUT", f"/contacts/{contacto_id}", json=datos)


def crear_factura(datos: dict) -> dict:
    return _pedir("POST", "/invoices", json=datos)


def timbrar(ids: list[str]) -> dict:
    """Reintenta enviar a la DIAN facturas que quedaron en borrador (máx. 10)."""
    return _pedir("POST", "/invoices/stamp", json={"ids": [int(i) if str(i).isdigit() else i for i in ids]})


def obtener_factura(factura_id: str) -> dict:
    return _pedir("GET", f"/invoices/{factura_id}", params={"fields": "pdf,stamp"})


def enviar_factura(factura_id: str, correos: list[str]) -> dict:
    return _pedir("POST", f"/invoices/{factura_id}/email", json={"emails": correos})
