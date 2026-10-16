"""Preparación del QA en navegador de los hallazgos medios (AT-13, AG-06, cola).

Usa los datos de `qa_flujo_critico.py --persistir`. Modos:
  cola_vacia     mueve la cita de hoy a mañana (la cola del profesional queda vacía)
  cola_restaurar la devuelve a su hora
  ag06           apaga check-in, pago y firma en el asistente y crea una cita de hoy sin confirmar
  limpiar        borra la cita de AG-06 y devuelve la configuración del asistente

    docker exec cliniq_backend python scripts/auditoria/qa_medios_setup.py <modo>
"""
import json
import os
import sys
from datetime import timedelta
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.utils import timezone  # noqa: E402

from apps.agenda.models import Cita  # noqa: E402
from apps.configuracion.models import ConfiguracionWizard  # noqa: E402

SALIDA = Path(__file__).resolve().parent / "salida"
IDS = SALIDA / "qa_flujo_ids.json"
ESTADO = SALIDA / "qa_medios_estado.json"
PASOS = ("paso_checkin", "paso_pago", "paso_firma_asistencia", "paso_verificacion_facial")

ids = json.loads(IDS.read_text(encoding="utf-8"))
estado = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}
modo = sys.argv[1]
cita_hoy = Cita.objects.get(id=ids["cita_hoy"])

if modo == "cola_vacia":
    estado["cita_hoy_inicio"] = cita_hoy.fecha_inicio.isoformat()
    Cita.objects.filter(id=cita_hoy.id).update(
        fecha_inicio=cita_hoy.fecha_inicio + timedelta(days=1), fecha_fin=cita_hoy.fecha_fin + timedelta(days=1),
    )
elif modo == "cola_restaurar":
    Cita.objects.filter(id=cita_hoy.id).update(
        fecha_inicio=cita_hoy.fecha_inicio - timedelta(days=1), fecha_fin=cita_hoy.fecha_fin - timedelta(days=1),
    )
elif modo == "ag06":
    config, _ = ConfiguracionWizard.objects.get_or_create(clinica_id=cita_hoy.sede.clinica_id)
    estado["wizard"] = {p: getattr(config, p) for p in PASOS}
    for p in PASOS:
        setattr(config, p, False)
    config.save()
    inicio = timezone.localtime().replace(second=0, microsecond=0) + timedelta(minutes=30)
    cita = Cita.objects.create(
        paciente=cita_hoy.paciente, sede=cita_hoy.sede, profesional=cita_hoy.profesional,
        servicio_nombre="QA llegada sin check-in", fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
        duracion_min=30, estado=Cita.Estado.PENDIENTE, canal_confirmacion=cita_hoy.paciente.canal_confirmacion,
        canal_origen=Cita.CanalOrigen.PRESENCIAL,
    )
    estado["cita_ag06"] = str(cita.id)
elif modo == "limpiar":
    if estado.get("cita_ag06"):
        from apps.agenda.models import RegistroConfirmacion

        RegistroConfirmacion.objects.filter(cita_id=estado["cita_ag06"]).delete()
        Cita.objects.filter(id=estado["cita_ag06"]).delete()
    if estado.get("wizard"):
        ConfiguracionWizard.objects.filter(clinica_id=cita_hoy.sede.clinica_id).update(**estado["wizard"])
    estado = {}
else:
    raise SystemExit(f"Modo desconocido: {modo}")

ESTADO.write_text(json.dumps(estado, indent=1), encoding="utf-8")
print(modo, "OK", estado)
