"""Comprueba que las zonas de las atenciones existentes no cambian con el paso a
diagramas por nota (20/10/2026).

    docker exec cliniq_backend python scripts/auditoria/qa_zonas_migracion.py antes
    (aplicar migraciones)
    docker exec cliniq_backend python scripts/auditoria/qa_zonas_migracion.py despues

`antes` guarda, por nota, lo que mostraba la pestaña con la regla anterior (copia
literal del endpoint viejo) y sus marcas. `despues` pide la pestaña con el código
nuevo y verifica: mismos diagramas en el mismo orden al principio, marcas
intactas, y que ninguna nota completada se escribió al consultarla.
"""
import json
import os
import sys
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.db import connection  # noqa: E402

SALIDA = Path(__file__).resolve().parent / "salida"
ARCHIVO = SALIDA / "qa_zonas_migracion.json"


def regla_anterior(cita):
    """Copia literal de NotaClinicaViewSet.zonas antes del cambio (solo los ids)."""
    servicio_ids = []
    if cita is not None:
        from apps.protocolos.services import contexto_sesion_para_cita

        contexto = contexto_sesion_para_cita(cita)
        if contexto and contexto["procedimientos"]:
            servicio_ids = [p["id"] for p in contexto["procedimientos"]]
        elif cita.servicio_id:
            servicio_ids = [str(cita.servicio_id)]
    diagramas = []
    if servicio_ids:
        from apps.clinicas.models import ServicioGrupoZonas
        grupos_rels = (
            ServicioGrupoZonas.objects
            .filter(servicio_id__in=servicio_ids, activo=True)
            .prefetch_related("grupo__diagramas__diagrama")
            .order_by("orden")
        )
        seen = set()
        for srel in grupos_rels:
            for gd in srel.grupo.diagramas.order_by("orden"):
                if gd.diagrama_id not in seen:
                    seen.add(gd.diagrama_id)
                    diagramas.append(str(gd.diagrama_id))
    return diagramas


def marcas(nota_id):
    with connection.cursor() as c:
        c.execute(
            "SELECT id, diagrama_id, x, y, radio, texto, activo FROM anotaciones_zona WHERE nota_id = %s ORDER BY id",
            [nota_id],
        )
        return [[str(v) for v in fila] for fila in c.fetchall()]


def notas():
    # SQL directo: antes de migrar el modelo ya tiene campos que la tabla no.
    with connection.cursor() as c:
        c.execute("SELECT id, cita_id, estado FROM notas_clinicas ORDER BY created_at")
        return [(str(i), str(cita) if cita else None, estado) for i, cita, estado in c.fetchall()]


if sys.argv[1] == "antes":
    from apps.agenda.models import Cita

    datos = {}
    for nota_id, cita_id, estado in notas():
        cita = Cita.objects.filter(pk=cita_id).first() if cita_id else None
        datos[nota_id] = {"estado": estado, "diagramas": regla_anterior(cita), "marcas": marcas(nota_id)}
    SALIDA.mkdir(exist_ok=True)
    ARCHIVO.write_text(json.dumps(datos), encoding="utf-8")
    print(f"{len(datos)} notas guardadas; {sum(1 for d in datos.values() if d['diagramas'])} con diagramas, "
          f"{sum(1 for d in datos.values() if d['marcas'])} con marcas")

elif sys.argv[1] == "despues":
    from apps.historia_clinica import zonas
    from apps.historia_clinica.models import NotaClinica, NotaDiagramaZona

    datos = json.loads(ARCHIVO.read_text(encoding="utf-8"))
    errores = []
    for nota_id, antes in datos.items():
        nota = NotaClinica.objects.select_related("cita").get(pk=nota_id)
        filas_antes = NotaDiagramaZona.objects.filter(nota=nota).count()
        ahora = [str(d.id) for d in zonas.diagramas_de_nota(nota)]
        if ahora[: len(antes["diagramas"])] != antes["diagramas"]:
            errores.append(f"{nota_id}: antes {antes['diagramas']} ahora {ahora}")
        marcados = {m[1] for m in antes["marcas"] if m[6] == "True"}
        if not marcados.issubset(set(ahora)):
            errores.append(f"{nota_id}: diagramas con marcas fuera de la pestaña {marcados - set(ahora)}")
        if marcas(nota_id) != antes["marcas"]:
            errores.append(f"{nota_id}: cambiaron las marcas")
        if antes["estado"] == "completada" and NotaDiagramaZona.objects.filter(nota=nota).count() != filas_antes:
            errores.append(f"{nota_id}: se escribió una nota completada al consultarla")
    print(f"{len(datos)} notas revisadas, {len(errores)} diferencias")
    for e in errores[:30]:
        print(" ", e)
