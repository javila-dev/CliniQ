"""Muchas plantillas de órdenes para ver el selector con volumen real (17/10/2026).

    docker exec cliniq_backend python scripts/auditoria/qa_muchas_plantillas.py crear
    docker exec cliniq_backend python scripts/auditoria/qa_muchas_plantillas.py borrar

Crea 24 plantillas compartidas en la clínica de QA y órdenes que usan tres de
ellas en la cita de hoy del flujo QA (qa_flujo_critico.py --persistir), para que
las sugeridas por procedimiento tengan datos. Lo creado queda en
salida/qa_muchas_plantillas.json y `borrar` lo quita.
"""
import json
import os
import sys
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.agenda.models import Cita  # noqa: E402
from apps.historia_clinica.models import HistoriaClinica, OrdenMedica, PlantillaOrden  # noqa: E402

SALIDA = Path(__file__).resolve().parent / "salida"
ARCHIVO = SALIDA / "qa_muchas_plantillas.json"
NOMBRES = [
    "Perfil lipídico", "Hemograma completo", "Glicemia en ayunas", "TSH y T4 libre", "Perfil hormonal femenino",
    "Ecografía de tejidos blandos", "Ecografía abdominal total", "Rx de tórax", "Uroanálisis", "Creatinina y BUN",
    "Pruebas hepáticas", "Ferritina y hierro sérico", "Vitamina D", "Vitamina B12", "Insulina basal y HOMA",
    "Prueba de embarazo", "Coagulación (PT/PTT)", "Cultivo de lesión", "Valoración por dermatología",
    "Valoración por nutrición", "Incapacidad médica", "Indicaciones post toxina", "Indicaciones post láser",
    "Indicaciones post peeling",
]
USADAS_EN_PROCEDIMIENTO = {"Indicaciones post láser": 4, "Cultivo de lesión": 2, "Valoración por dermatología": 1}

if sys.argv[1] == "crear":
    ids = json.loads((SALIDA / "qa_flujo_ids.json").read_text(encoding="utf-8"))
    cita = Cita.objects.select_related("paciente", "profesional").get(id=ids["cita_hoy"])
    historia = HistoriaClinica.objects.get(paciente=cita.paciente)
    clinica = historia.clinica
    creadas, ordenes = [], []
    for nombre in NOMBRES:
        p = PlantillaOrden.objects.create(clinica=clinica, nombre=nombre, contenido=f"{nombre}.\nSegún indicación médica.")
        creadas.append(str(p.id))
        for _ in range(USADAS_EN_PROCEDIMIENTO.get(nombre, 0)):
            o = OrdenMedica.objects.create(historia=historia, cita=cita, plantilla_origen=p, contenido=p.contenido,
                                           titulo=p.nombre, profesional=cita.profesional)
            ordenes.append(str(o.id))
    ARCHIVO.write_text(json.dumps({"plantillas": creadas, "ordenes": ordenes}), encoding="utf-8")
    print(f"{len(creadas)} plantillas y {len(ordenes)} órdenes de prueba")
elif sys.argv[1] == "borrar":
    datos = json.loads(ARCHIVO.read_text(encoding="utf-8"))
    OrdenMedica.objects.filter(id__in=datos["ordenes"]).delete()
    PlantillaOrden.objects.filter(id__in=datos["plantillas"]).delete()
    ARCHIVO.unlink()
    print("borradas")
