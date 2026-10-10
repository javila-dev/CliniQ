"""Extrae las llamadas HTTP del frontend (apiClient/axios) a un JSON.

Se corre en el host (no en docker), desde la raíz del repo:

    python backend/scripts/auditoria/extraer_llamadas_frontend.py

Escribe backend/scripts/auditoria/salida/llamadas_frontend.json, que luego
lee verificar_rutas.py dentro del contenedor del backend.
"""

import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
FRONT = RAIZ / "frontend" / "src"
SALIDA = Path(__file__).resolve().parent / "salida"

RECEPTOR = r"\b(\w*[Cc]lient|axios)\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\s*\(\s*"
# receptor.metodo<Generico<...>>( 'ruta' | "ruta" | `ruta`
LLAMADA = re.compile(RECEPTOR + r"([`'\"])")
# receptor.metodo<...>(CONSTANTE, ...): la ruta es una constante del archivo.
LLAMADA_CONST = re.compile(RECEPTOR + r"([A-Z_][A-Z0-9_]*)\s*[,)]")
CONSTANTE = re.compile(r"^const\s+([A-Z_][A-Z0-9_]*)\s*=\s*['\"`]([^'\"`$]*)['\"`]", re.MULTILINE)


def leer_template(texto: str, i: int, consts: dict) -> tuple[str, int]:
    """Lee un template literal desde texto[i] (después del backtick de apertura).

    Devuelve la ruta con cada ${...} reemplazado por {p} (o por el valor de la
    constante del archivo) y la posición final. Un ${...} con más ruta adentro
    (`${id ? `/${id}` : ''}`) se marca {dyn}.
    """
    out = []
    while i < len(texto):
        c = texto[i]
        if c == "`":
            return "".join(out), i + 1
        if c == "$" and texto[i + 1 : i + 2] == "{":
            j, nivel = i + 2, 1
            while j < len(texto) and nivel:
                if texto[j] == "{":
                    nivel += 1
                elif texto[j] == "}":
                    nivel -= 1
                j += 1
            expr = texto[i + 2 : j - 1].strip()
            if expr in consts:
                out.append(consts[expr])
            elif "BASE_URL" in expr or "API_URL" in expr:
                out.append("")
            elif "`" in expr or "'/" in expr or '"/' in expr:
                out.append("{dyn}")
            else:
                out.append("{p}")
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out), i


def main():
    llamadas = []
    for archivo in sorted(FRONT.rglob("*.ts*")):
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        rel = str(archivo.relative_to(RAIZ)).replace("\\", "/")
        consts = {k: v for k, v in CONSTANTE.findall(texto) if k not in ("BASE_URL", "API_URL")}

        def agregar(m, ruta):
            llamadas.append({
                "archivo": rel,
                "linea": texto.count("\n", 0, m.start()) + 1,
                "receptor": m.group(1),
                "metodo": m.group(2).upper(),
                "ruta": ruta,
            })

        for m in LLAMADA_CONST.finditer(texto):
            if m.group(3) in consts:
                agregar(m, consts[m.group(3)])
        for m in LLAMADA.finditer(texto):
            comilla, inicio = m.group(3), m.end()
            if comilla == "`":
                ruta, _ = leer_template(texto, inicio, consts)
            else:
                ruta = texto[inicio : texto.find(comilla, inicio)]
            agregar(m, ruta)

    SALIDA.mkdir(exist_ok=True)
    (SALIDA / "llamadas_frontend.json").write_text(json.dumps(llamadas, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(llamadas)} llamadas -> {SALIDA / 'llamadas_frontend.json'}")


if __name__ == "__main__":
    main()
