"""Extrae del frontend las claves de permiso y los chequeos por rol fijo.

Se corre en el host, desde la raíz del repo:

    python backend/scripts/auditoria/extraer_permisos_frontend.py

Escribe salida/permisos_frontend.json, que lee verificar_permisos.py.
"""

import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
FRONT = RAIZ / "frontend" / "src"
SALIDA = Path(__file__).resolve().parent / "salida"

CLAVE = r"[a-z_]+\.[a-z_]+(?:\.[a-z_]+)*"
# PERM.X -> 'clave' en lib/permissions.ts
MAPA = re.compile(r"^\s*([A-Z0-9_]+)\s*:\s*'(" + CLAVE + r")'", re.MULTILINE)
# hasPermission(user, 'clave') / hasAnyPermission(user, ['a', 'b']) con literales
LITERAL_EN_CHEQUEO = re.compile(r"has(?:Any|All)?Permission\s*\([^)]*?'(" + CLAVE + r")'")
USO_PERM = re.compile(r"\bPERM\.([A-Z0-9_]+)")
# Chequeos por rol fijo: ignoran los roles personalizados.
ROL_FIJO = re.compile(r"\.rol\s*(?:===|!==|==|!=)\s*'(\w+)'|\[([^\]]*'(?:admin|recepcion|profesional|superadmin)'[^\]]*)\]\s*\.includes\(\s*\w+(?:\?)?\.rol")


def main():
    permisos_ts = (FRONT / "lib" / "permissions.ts").read_text(encoding="utf-8")
    mapa = dict(MAPA.findall(permisos_ts))
    literales, usos_perm, roles_fijos = [], {}, []
    for archivo in sorted(FRONT.rglob("*.ts*")):
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        rel = str(archivo.relative_to(RAIZ)).replace("\\", "/")
        for m in LITERAL_EN_CHEQUEO.finditer(texto):
            literales.append({"clave": m.group(1), "donde": f"{rel}:{texto.count(chr(10), 0, m.start()) + 1}"})
        for m in USO_PERM.finditer(texto):
            usos_perm.setdefault(m.group(1), []).append(f"{rel}:{texto.count(chr(10), 0, m.start()) + 1}")
        for m in ROL_FIJO.finditer(texto):
            linea = texto.count(chr(10), 0, m.start()) + 1
            roles_fijos.append({"donde": f"{rel}:{linea}", "codigo": texto.splitlines()[linea - 1].strip()[:140]})
    SALIDA.mkdir(exist_ok=True)
    datos = {"mapa": mapa, "literales": literales, "usos_perm": usos_perm, "roles_fijos": roles_fijos}
    (SALIDA / "permisos_frontend.json").write_text(json.dumps(datos, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"PERM={len(mapa)} literales={len(literales)} roles_fijos={len(roles_fijos)}")


if __name__ == "__main__":
    main()
