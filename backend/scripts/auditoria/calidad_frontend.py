"""Señales de manejo de errores y carga en el frontend, archivo por archivo.

Se corre en el host, desde la raíz del repo:

    python backend/scripts/auditoria/calidad_frontend.py

Escribe salida/calidad_frontend.txt con:
- archivos con más useMutation que onError (algún guardado falla en silencio,
  salvo que el error se maneje con try/catch alrededor de mutateAsync);
- archivos con useQuery que nunca miran isError/error (si la API falla, la
  pantalla queda vacía o como "sin datos" en vez de avisar);
- archivos con useMutation sin isPending/isLoading (botón sin estado de guardando:
  riesgo de doble envío).
Es una heurística: cada archivo listado se revisa a mano.

Desde el paso 5, QueryProvider tiene un MutationCache que avisa con un toast
cuando una mutación sin onError falla: la primera lista ya no implica fallas
silenciosas, solo mensajes genéricos (revisar si conviene un mensaje propio).
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
FRONT = RAIZ / "frontend" / "src"
SALIDA = Path(__file__).resolve().parent / "salida"


def contar(patron, texto):
    return len(re.findall(patron, texto))


def main():
    sin_onerror, sin_iserror, sin_pending = [], [], []
    for archivo in sorted(FRONT.rglob("*.tsx")) + sorted(FRONT.rglob("*.ts")):
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        rel = str(archivo.relative_to(RAIZ)).replace("\\", "/")
        mutaciones = contar(r"\buseMutation\s*\(", texto)
        consultas = contar(r"\buseQuery\s*[<(]", texto)
        if mutaciones:
            on_error = contar(r"\bonError\b", texto)
            catch = contar(r"\bcatch\b", texto)
            if on_error + catch < mutaciones:
                sin_onerror.append(f"{rel}  useMutation={mutaciones} onError={on_error} catch={catch}")
            if not re.search(r"\b(isPending|isLoading|status\s*===\s*'pending')\b", texto):
                sin_pending.append(f"{rel}  useMutation={mutaciones}")
        if consultas and not re.search(r"\b(isError|error\b|isLoadingError|throwOnError)", texto):
            sin_iserror.append(f"{rel}  useQuery={consultas}")
    SALIDA.mkdir(exist_ok=True)
    lineas = [
        f"## Más useMutation que onError/catch ({len(sin_onerror)})", *sin_onerror, "",
        f"## useQuery sin manejo de error ({len(sin_iserror)})", *sin_iserror, "",
        f"## useMutation sin estado de guardando ({len(sin_pending)})", *sin_pending,
    ]
    (SALIDA / "calidad_frontend.txt").write_text("\n".join(lineas), encoding="utf-8")
    print(f"sin_onError={len(sin_onerror)} sin_isError={len(sin_iserror)} sin_pending={len(sin_pending)}")


if __name__ == "__main__":
    main()
