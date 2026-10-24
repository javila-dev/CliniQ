"""Departamentos y municipios tal como los nombra Alegra (que los traduce a los
códigos DANE para la DIAN). Alegra no valida el texto: una ciudad mal escrita se
acepta en el contacto y la factura falla al emitirse, por eso se valida aquí.

`datos/municipios_alegra.json` se extrajo de https://developer.alegra.com/reference/colombia
(sección "Departamentos y municipios"). Ojo: difiere del DANE en algunos nombres
("Abrego", "Barranco Minas", "Bogotá, D.C.").
"""

import json
from functools import lru_cache
from pathlib import Path

ARCHIVO = Path(__file__).parent / "datos" / "municipios_alegra.json"


@lru_cache(maxsize=1)
def catalogo() -> dict[str, list[str]]:
    return json.loads(ARCHIVO.read_text(encoding="utf-8"))


def municipio_valido(departamento: str, ciudad: str) -> bool:
    return ciudad in catalogo().get(departamento, [])
