"""Resume salida/qa_recorrido.json: qué pantalla falla, a quién y por qué.

    python backend/scripts/auditoria/qa_analizar_recorrido.py [perfil...]

Por perfil y pantalla clasifica:
- MENU_ROTO: está en su menú pero lo saca, le dice "sin permiso" o carga con errores de la API.
- SIN_GUARDA: no está en su menú, pero entrando por URL la pantalla carga y pide datos que le niegan.
- ERRORES_API: carga, pero alguna consulta responde 4xx/5xx (lo que la pantalla muestra vacío o en cero).
- ERROR_JS: excepciones de la página o errores de consola.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

AQUI = Path(__file__).resolve().parent / "salida"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
RUIDO_CONSOLA = re.compile(r"Failed to load resource|favicon|Download the React DevTools|\[Fast Refresh\]|webpack-hmr")


def tiene(perms, *claves):
    return any(c in perms for c in claves)


CONFIG = {
    "clinica": "clinicas.editar", "sedes": "sedes.ver", "plan": "clinicas.editar", "whatsapp": "clinicas.editar",
    "agenda": "clinicas.editar", "seguimiento": "clinicas.editar", "recepcion": "clinicas.editar",
    "biometria": "clinicas.editar", "atencion": "clinicas.editar", "historia-clinica": "clinicas.editar",
    "plantillas-ordenes": "clinicas.editar", "consentimientos": "consentimientos.plantillas.ver",
    "cartera": "clinicas.editar", "formas-pago": "configuracion.formas_pago.ver", "cajas": "caja.cajas.gestionar",
    "usuarios": "usuarios.ver", "grupos-atencion": "colaboradores.gestionar", "roles": "roles.ver",
    "log-acciones": "core.ver_log_acciones", "campanas": "campanas.gestionar",
}
SOLO_CONSULTA = {"sedes.ver": "sedes.gestionar", "consentimientos.plantillas.ver": "consentimientos.plantillas.gestionar",
                 "configuracion.formas_pago.ver": "configuracion.formas_pago.gestionar"}


def esperado(ruta, perms):
    """Si el frontend debería dejar entrar (lo que dicen menú y guardas). None = no se evalúa."""
    r = UUID.sub("{id}", ruta)
    partes = r.strip("/").split("/")
    raiz = partes[0]
    if raiz in ("dashboard", "perfil", "ayuda"):
        return True
    if raiz == "console":
        return False
    if raiz == "atenciones":
        return tiene(perms, "historia.notas.crear")
    if raiz == "pacientes":
        if r == "/pacientes/nuevo":
            return tiene(perms, "pacientes.crear")
        if r.endswith("/editar"):
            return tiene(perms, "pacientes.editar")
        if r.endswith("/historia"):
            return tiene(perms, "historia.ver")
        return tiene(perms, "pacientes.ver")
    if r == "/cotizaciones/nueva":
        return tiene(perms, "cotizaciones.gestionar")
    if r == "/compras/nueva":
        return tiene(perms, "proveedores.ordenes.gestionar")
    simple = {
        "agenda": ["agenda.citas.ver"], "seguimiento": ["seguimiento.oportunidades.ver"],
        "cotizaciones": ["cotizaciones.ver"], "ventas": ["cotizaciones.ver"], "autorizaciones": ["cotizaciones.cambiar_precio"],
        "cartera": ["cartera.ver"], "consentimientos": ["consentimientos.ver"], "ingresos": ["cobros.ver"],
        "cobros": ["cobros.ver"], "catalogo": ["servicios.ver"], "inventario": ["inventario.ver"],
        "compras": ["proveedores.ordenes.ver"], "proveedores": ["proveedores.ver"],
        "colaboradores": ["colaboradores.ver", "usuarios.ver"], "equipo": ["colaboradores.ver", "usuarios.ver"],
        "puesta-en-marcha": ["cotizaciones.gestionar"],
    }
    if raiz in simple:
        return tiene(perms, *simple[raiz])
    if raiz == "resultados":
        if r == "/resultados/egresos":
            return tiene(perms, "caja.gastos.ver")
        if r == "/resultados/caja":
            return tiene(perms, "caja.cierre.ver")
        return tiene(perms, "cobros.ver", "caja.gastos.ver", "caja.cierre.ver")
    if raiz == "configuracion":
        if len(partes) == 1:
            return any(tiene(perms, k) and (k not in SOLO_CONSULTA or tiene(perms, SOLO_CONSULTA[k])) for k in set(CONFIG.values()))
        sub = partes[1]
        if sub in ("procedimientos", "servicios", "tratamientos", "recordatorios"):
            return None  # redirigen a Catálogo / Agenda
        if sub == "consentimientos" and len(partes) > 2:
            return tiene(perms, "consentimientos.plantillas.gestionar")
        return tiene(perms, CONFIG[sub]) if sub in CONFIG else None
    return None


def norm(url):
    return UUID.sub("{id}", url.split("?")[0])


def main():
    datos = json.loads((AQUI / "qa_recorrido.json").read_text(encoding="utf-8"))
    perfiles = sys.argv[1:] or list(datos)
    por_endpoint = defaultdict(lambda: defaultdict(set))
    for clave in perfiles:
        p = datos.get(clave)
        if not p or "rutas" not in p:
            print(f"\n## {clave}: sin datos ({p and p.get('error')})")
            continue
        perms = set(p["permisos"])
        print(f"\n## {clave}  aterriza en {p['aterrizaje']}  ({len(perms)} permisos)")
        for r in p["rutas"]:
            ruta = r["ruta"]
            api = [a for a in r["api"] if a["status"] != 401]
            consola = [c for c in r["consola"] if not RUIDO_CONSOLA.search(c)]
            en_menu = esperado(ruta, perms)
            entro = r["final"] == ruta.split("?")[0]
            bloqueado = (not entro) or bool(r.get("textoSinPermiso"))
            for a in api:
                por_endpoint[f"{a['metodo']} {norm(a['url'])} -> {a['status']}"][clave].add(norm(ruta))
            etiquetas = []
            if en_menu is True and bloqueado:
                etiquetas.append(f"NO_ENTRA(final={r['final']}, texto={r.get('textoSinPermiso')})")
            if en_menu is False and entro and not r.get("textoSinPermiso"):
                etiquetas.append("SIN_GUARDA" + ("" if api else "(carga sin errores)"))
            if entro and not r.get("textoSinPermiso") and api:
                etiquetas.append("ERRORES_API: " + "; ".join(sorted({f"{a['metodo']} {norm(a['url'])} {a['status']}" for a in api})))
            if r["pagina"] or consola:
                etiquetas.append("ERROR_JS: " + " | ".join((r["pagina"] + consola)[:2])[:220])
            if r.get("textoError"):
                etiquetas.append(f"TEXTO_ERROR({r['textoError']})")
            if r.get("avisos"):
                etiquetas.append("AVISOS: " + " | ".join(r["avisos"])[:160])
            if etiquetas:
                estado = {True: "debe", False: "no debe", None: "?"}[en_menu] + ("" if entro else f" →{r['final']}")
                print(f"  {ruta[:58]:58} [{estado}] " + " · ".join(etiquetas))
    print("\n## Endpoints que fallan (endpoint -> perfiles: pantallas)")
    for ep, quienes in sorted(por_endpoint.items()):
        print(f"- {ep}")
        for clave, rutas in sorted(quienes.items()):
            print(f"    {clave}: {', '.join(sorted(rutas))[:200]}")


if __name__ == "__main__":
    main()
