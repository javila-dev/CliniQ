"""Qué necesita la factura electrónica del cliente (la clínica) y cómo se valida.

Se usa al guardar los datos (no se puede pagar con datos incompletos) y otra vez
antes de emitir, para los datos guardados antes de estas reglas.
"""

import re

from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from .ubicacion import catalogo, municipio_valido

# Ids de Alegra de las responsabilidades fiscales (Alegra las traduce al código DIAN).
RESPONSABILIDADES = {
    "5": "Gran contribuyente (O-13)",
    "7": "Autorretenedor (O-15)",
    "12": "Agente de retención de IVA (O-23)",
    "114": "Régimen simple de tributación (O-47)",
}

_PESOS_DV = (3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71)


def dv_nit(numero: str) -> str:
    """Dígito de verificación de un NIT (algoritmo de la DIAN)."""
    digitos = [int(c) for c in reversed(numero)]
    residuo = sum(d * p for d, p in zip(digitos, _PESOS_DV)) % 11
    return str(11 - residuo if residuo > 1 else residuo)


def limpiar_documento(numero: str) -> str:
    """Quita puntos, espacios y guiones: "900.123.456" → "900123456"."""
    return re.sub(r"[\s.\-]", "", numero or "").upper()


def problemas(d: dict) -> dict[str, str]:
    """Campo → qué falta o está mal. Vacío si los datos sirven para facturar."""
    errores: dict[str, str] = {}
    persona = d.get("tipo_persona")
    tipo = d.get("tipo_documento")
    numero = limpiar_documento(d.get("numero_documento", ""))

    if persona not in ("juridica", "natural"):
        errores["tipo_persona"] = "Indica si facturas a nombre de una empresa o de una persona."
    if persona == "juridica" and tipo != "NIT":
        errores["tipo_documento"] = "Una empresa factura con NIT."

    if tipo in ("NIT", "CC"):
        if not numero.isdigit() or not (5 <= len(numero) <= 10):
            errores["numero_documento"] = "Escribe solo los números del documento (sin el dígito de verificación)."
    elif tipo in ("CE", "PP"):
        if not re.fullmatch(r"[A-Z0-9]{3,15}", numero):
            errores["numero_documento"] = "El documento debe tener entre 3 y 15 letras o números."
    else:
        errores["tipo_documento"] = "Elige un tipo de documento válido."

    if tipo == "NIT" and "numero_documento" not in errores:
        dv = str(d.get("dv", "")).strip()
        if not dv.isdigit():
            errores["dv"] = "Indica el dígito de verificación del NIT."
        elif dv != dv_nit(numero):
            errores["dv"] = "El dígito de verificación no corresponde a ese NIT. Revisa el RUT."

    if persona == "juridica" and len(str(d.get("razon_social", "")).strip()) < 3:
        errores["razon_social"] = "Escribe la razón social tal como aparece en el RUT."
    if persona == "natural":
        if len(str(d.get("nombres", "")).strip()) < 2:
            errores["nombres"] = "Escribe los nombres."
        if len(str(d.get("apellidos", "")).strip()) < 2:
            errores["apellidos"] = "Escribe los apellidos."

    try:
        validate_email(str(d.get("email_facturacion", "")).strip())
    except ValidationError:
        errores["email_facturacion"] = "Escribe un correo válido: ahí llega la factura."

    telefono = re.sub(r"\D", "", str(d.get("telefono", "")))
    if not (7 <= len(telefono) <= 15):
        errores["telefono"] = "Escribe un teléfono de contacto."

    if len(str(d.get("direccion", "")).strip()) < 5:
        errores["direccion"] = "Escribe la dirección completa."
    departamento = d.get("departamento", "")
    if departamento not in catalogo():
        errores["departamento"] = "Elige el departamento de la lista."
    elif not municipio_valido(departamento, d.get("ciudad", "")):
        errores["ciudad"] = "Elige el municipio de la lista."

    otras = [r for r in (d.get("responsabilidades_fiscales") or []) if str(r) not in RESPONSABILIDADES]
    if otras:
        errores["responsabilidades_fiscales"] = "Hay una responsabilidad fiscal que no reconocemos."
    return errores


def problemas_de(instancia) -> dict[str, str]:
    """Lo mismo, sobre unos DatosFacturacion guardados."""
    campos = (
        "tipo_persona", "tipo_documento", "numero_documento", "dv", "razon_social", "nombres", "apellidos",
        "email_facturacion", "telefono", "direccion", "ciudad", "departamento", "responsabilidades_fiscales",
    )
    return problemas({c: getattr(instancia, c) for c in campos})
