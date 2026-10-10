"""Cruza permisos: catálogo, base de datos, backend y frontend.

Primero, en el host:  python backend/scripts/auditoria/extraer_permisos_frontend.py
Luego:  docker exec cliniq_backend python scripts/auditoria/verificar_permisos.py

Reporta en salida/permisos.txt:
- claves que el código revisa pero no existen en el catálogo (nadie las puede tener);
- claves del catálogo que ningún código revisa (el switch del rol no hace nada);
- claves que el frontend revisa y el backend no (o al revés);
- diferencias catálogo <-> tabla `permisos` y roles con permisos huérfanos;
- roles personalizados y su contenido;
- chequeos por rol fijo (rol == "admin"...) que ignoran los roles personalizados.
"""

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from apps.users import permissions_catalog as cat  # noqa: E402
from apps.users.models import Permiso, Rol, RolPermiso, User  # noqa: E402

AQUI = Path(__file__).resolve().parent
APPS = Path(__file__).resolve().parents[2] / "apps"
CLAVE = r"[a-z_]+\.[a-z_]+(?:\.[a-z_]+)*"
LITERAL = re.compile(r"[\"'](" + CLAVE + r")[\"']")
ROL_FIJO = re.compile(r"\.rol\s*(?:==|!=)\s*[\"'](\w+)[\"']|\.rol\s+(?:not\s+)?in\s*[\(\[\{]|rol=User\.Role\.\w+|rol__in=")


def clave_de(item):
    return item[0] if isinstance(item, (tuple, list)) else item


def main():
    catalogo = {clave_de(p) for p in cat.PERMISSION_CATALOG}
    asignables = {clave_de(p) for p in cat.PERMISSION_CATALOG if p[4]} if len(cat.PERMISSION_CATALOG[0]) > 4 else catalogo
    lineas = [f"# Permisos — catálogo: {len(catalogo)} claves", ""]

    # 1. Catálogo interno: capacidades y defaults de rol
    malas_cap = sorted({p for perms in cat.CAPABILITY_PERMISSIONS.values() for p in perms} - catalogo)
    malas_def = sorted({p for perms in cat.ROLE_PERMISSION_DEFAULTS.values() for p in perms} - catalogo)
    sin_capacidad = sorted(catalogo - {p for perms in cat.CAPABILITY_PERMISSIONS.values() for p in perms})
    lineas += [f"## Capacidades con claves fuera del catálogo ({len(malas_cap)})", *malas_cap, ""]
    lineas += [f"## Defaults de rol con claves fuera del catálogo ({len(malas_def)})", *malas_def, ""]
    lineas += [
        f"## Claves del catálogo que no aparecen en ninguna capacidad (no se pueden activar desde la pantalla de roles) ({len(sin_capacidad)})",
        *sin_capacidad, "",
    ]

    # 2. Backend: literales de clave en el código (sin migraciones ni tests)
    usadas_back = defaultdict(list)
    roles_fijos_back = []
    for archivo in sorted(APPS.rglob("*.py")):
        rel = str(archivo.relative_to(APPS.parent))
        if "/migrations/" in rel.replace("\\", "/") or "test" in archivo.name or archivo.name == "permissions_catalog.py":
            continue
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        for n, linea in enumerate(texto.splitlines(), 1):
            for m in LITERAL.finditer(linea):
                clave = m.group(1)
                if clave in catalogo or re.search(r"perm|Permission|PERM|permiso", linea):
                    usadas_back[clave].append(f"{rel}:{n}")
            if ROL_FIJO.search(linea) and "def " not in linea:
                roles_fijos_back.append(f"{rel}:{n}  {linea.strip()[:140]}")
    fuera_back = {k: v for k, v in usadas_back.items() if k not in catalogo and not k.endswith((".py", ".html", ".pdf"))}
    lineas += [f"## Backend revisa claves que no existen en el catálogo ({len(fuera_back)})"]
    lineas += [f"{k}  <- {', '.join(v[:3])}" for k, v in sorted(fuera_back.items())] + [""]
    sin_uso_back = sorted(catalogo - set(usadas_back))
    lineas += [f"## Claves del catálogo que el backend nunca revisa ({len(sin_uso_back)})", *sin_uso_back, ""]

    # 3. Frontend
    front = json.loads((AQUI / "salida" / "permisos_frontend.json").read_text(encoding="utf-8"))
    mapa = front["mapa"]
    fuera_mapa = {k: v for k, v in mapa.items() if v not in catalogo}
    lineas += [f"## PERM del frontend que no existen en el catálogo ({len(fuera_mapa)})"]
    lineas += [f"PERM.{k} = {v}" for k, v in sorted(fuera_mapa.items())] + [""]
    fuera_lit = [x for x in front["literales"] if x["clave"] not in catalogo]
    lineas += [f"## Literales en hasPermission(...) que no existen en el catálogo ({len(fuera_lit)})"]
    lineas += [f"{x['clave']}  <- {x['donde']}" for x in fuera_lit] + [""]
    perm_sin_definir = sorted(set(front["usos_perm"]) - set(mapa))
    lineas += [f"## PERM.X usados pero no definidos en permissions.ts ({len(perm_sin_definir)})"]
    lineas += [f"PERM.{k}  <- {', '.join(front['usos_perm'][k][:3])}" for k in perm_sin_definir] + [""]
    claves_front = set(mapa.values()) | {x["clave"] for x in front["literales"]}
    solo_front = sorted((claves_front & catalogo) - set(usadas_back))
    lineas += [f"## El frontend las revisa pero el backend no (la API no protege) ({len(solo_front)})", *solo_front, ""]

    # 4. Base de datos
    en_db = set(Permiso.objects.values_list("clave", flat=True))
    lineas += [f"## Catálogo sin fila en la tabla permisos (falta sync) ({len(catalogo - en_db)})", *sorted(catalogo - en_db), ""]
    lineas += [f"## Filas de la tabla permisos fuera del catálogo ({len(en_db - catalogo)})", *sorted(en_db - catalogo), ""]
    huerfanos = (
        RolPermiso.objects.exclude(permiso__clave__in=catalogo)
        .values_list("rol__clinica__nombre", "rol__nombre", "permiso__clave")
    )
    lineas += [f"## Roles con permisos fuera del catálogo ({huerfanos.count()})"]
    lineas += [f"{c} / {r}: {p}" for c, r, p in huerfanos[:50]] + [""]
    no_asignables = (
        RolPermiso.objects.filter(permiso__assignable=False, rol__es_sistema=False)
        .exclude(rol__slug="admin")
        .values_list("rol__clinica__nombre", "rol__nombre", "permiso__clave")
    )
    lineas += [f"## Roles personalizados con permisos no asignables ({no_asignables.count()})"]
    lineas += [f"{c} / {r}: {p}" for c, r, p in no_asignables[:50]] + [""]

    lineas += ["## Roles personalizados (no de sistema)"]
    for rol in Rol.objects.filter(es_sistema=False).select_related("clinica").prefetch_related("permisos"):
        claves = sorted(rol.permisos.values_list("clave", flat=True))
        usuarios = User.objects.filter(rol_dinamico=rol).count()
        lineas.append(f"- {rol.clinica.nombre} / {rol.nombre} (slug={rol.slug}, activo={getattr(rol, 'activo', '?')}, "
                      f"profesional={rol.es_profesional}, usuarios={usuarios}, permisos={len(claves)})")
    lineas.append("")

    # Usuarios cuyo rol fijo (User.rol) no coincide con su rol dinámico: los
    # chequeos por rol fijo los tratan distinto a lo que dice su rol.
    desfase = []
    for u in User.objects.filter(rol_dinamico__isnull=False).select_related("rol_dinamico", "clinica"):
        slug = u.rol_dinamico.slug
        if slug in ("admin", "recepcion", "profesional") and u.rol != slug:
            desfase.append(f"{u.email}: rol={u.rol} rol_dinamico={slug}")
        elif slug not in ("admin", "recepcion", "profesional"):
            desfase.append(f"{u.email}: rol={u.rol} rol_dinamico={slug} (personalizado)")
    sin_rol = User.objects.filter(rol_dinamico__isnull=True, is_active=True).exclude(rol="superadmin").count()
    lineas += [f"## Usuarios con rol personalizado o desfasado ({len(desfase)}); activos sin rol dinámico: {sin_rol}"]
    lineas += desfase[:60] + [""]

    # 5. Chequeos por rol fijo
    lineas += [f"## Backend: chequeos por rol fijo ({len(roles_fijos_back)}) — revisar si dejan fuera a roles personalizados"]
    lineas += roles_fijos_back + [""]
    lineas += [f"## Frontend: chequeos por rol fijo ({len(front['roles_fijos'])})"]
    lineas += [f"{x['donde']}  {x['codigo']}" for x in front["roles_fijos"]]

    (AQUI / "salida" / "permisos.txt").write_text("\n".join(lineas), encoding="utf-8")
    print(
        f"cap_malas={len(malas_cap)} def_malos={len(malas_def)} fuera_back={len(fuera_back)} sin_uso_back={len(sin_uso_back)} "
        f"fuera_front={len(fuera_mapa) + len(fuera_lit)} solo_front={len(solo_front)} roles_fijos_back={len(roles_fijos_back)} "
        f"roles_fijos_front={len(front['roles_fijos'])}"
    )


if __name__ == "__main__":
    main()
