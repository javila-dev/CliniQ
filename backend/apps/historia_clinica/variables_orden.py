"""Variables del paciente en el texto de las órdenes médicas (17/10/2026).

La pantalla ya no ofrece variables: los datos del paciente salen en el
encabezado del PDF y la orden lleva solo su contenido. Se siguen llenando por
si una plantilla vieja las escribió (antes el formulario las sugería y se
imprimían tal cual).
"""
import re

from django.utils import timezone

VARIABLES = {
    "nombre_paciente": "Nombre completo del paciente",
    "documento": "Número de documento del paciente",
    "edad": "Edad del paciente (p. ej. 34 años)",
    "fecha": "Fecha de la orden (dd/mm/aaaa)",
    "profesional": "Nombre del profesional que emite la orden",
}

_PATRON = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def _edad(paciente, fecha) -> str:
    nac = paciente.fecha_nacimiento
    if not nac:
        return ""
    anios = fecha.year - nac.year - ((fecha.month, fecha.day) < (nac.month, nac.day))
    return f"{anios} años"


def _valores(paciente, profesional, fecha) -> dict[str, str]:
    return {
        "nombre_paciente": paciente.nombre_completo,
        "documento": paciente.numero_documento or "",
        "edad": _edad(paciente, fecha),
        "fecha": fecha.strftime("%d/%m/%Y"),
        "profesional": profesional.nombre_completo if profesional else "",
    }


def llenar_variables(texto: str, paciente, profesional, fecha=None) -> str:
    """Reemplaza {{variable}} por el dato real. Las que no existen quedan igual."""
    valores = _valores(paciente, profesional, fecha or timezone.localdate())
    return _PATRON.sub(lambda m: valores.get(m.group(1), m.group(0)), texto)

