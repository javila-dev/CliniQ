"""Citas cuya hora de fin no coincide con inicio + duración.

Al editar una cita (cambiar profesional, notas, etc.) el backend recalculaba
`fecha_fin = fecha_inicio + duracion_min`. En estas citas esa cuenta daría otra
hora de fin. Solo lee: no modifica nada.

Uso: docker exec cliniq_backend python manage.py shell < scripts/auditoria/citas_fin_inconsistente.py
"""

from datetime import timedelta

from apps.agenda.models import Cita

total = Cita.objects.count()
sin_duracion = Cita.objects.filter(duracion_min__isnull=True).count()
distintas = []
for cita in Cita.objects.exclude(duracion_min__isnull=True).only("id", "fecha_inicio", "fecha_fin", "duracion_min", "estado"):
    if cita.fecha_inicio + timedelta(minutes=cita.duracion_min) != cita.fecha_fin:
        distintas.append(cita)

print(f"Citas: {total}")
print(f"Sin duracion_min (editarlas dejaba fin = inicio): {sin_duracion}")
print(f"Con fin distinto de inicio + duracion: {len(distintas)}")
for cita in distintas[:15]:
    real = int((cita.fecha_fin - cita.fecha_inicio).total_seconds() // 60)
    print(f"  {cita.id} {cita.estado} duracion_min={cita.duracion_min} fin-inicio={real} min")
