"""Crea la suscripción de cada clínica existente (ver §10 del plan).

- Con plan asignado: activa con cobro manual y sin vencimiento (pagan por fuera).
- Sin plan, con prueba vigente: sigue en prueba hasta la misma fecha.
- Sin plan, con prueba vencida: solo lectura desde hoy (antes quedaban
  bloqueadas del todo), así tienen 30 días antes de la suspensión.
- Sin plan ni prueba (creadas desde la consola): activa manual sin vencimiento,
  con una nota para revisarlas.
"""

from django.db import migrations
from django.utils import timezone


def crear(apps, schema_editor):
    Clinica = apps.get_model("clinicas", "Clinica")
    Suscripcion = apps.get_model("suscripciones", "Suscripcion")
    ahora = timezone.now()
    hoy = timezone.localdate()

    nuevas = []
    for clinica in Clinica.objects.filter(suscripcion__isnull=True).only("id", "plan_id", "trial_expires_at"):
        datos = {"clinica_id": clinica.id, "estado_desde": ahora}
        if clinica.plan_id is not None:
            datos.update(estado="activa", modo_cobro="manual", periodo_inicio=hoy)
        elif clinica.trial_expires_at is not None and clinica.trial_expires_at >= ahora:
            datos.update(estado="prueba", modo_cobro="automatico", prueba_termina_el=clinica.trial_expires_at)
        elif clinica.trial_expires_at is not None:
            datos.update(estado="solo_lectura", modo_cobro="automatico", prueba_termina_el=clinica.trial_expires_at)
        else:
            datos.update(
                estado="activa", modo_cobro="manual", periodo_inicio=hoy,
                nota_interna="Creada desde la consola sin plan ni prueba: revisar cómo se cobra.",
            )
        nuevas.append(Suscripcion(**datos))
    Suscripcion.objects.bulk_create(nuevas)


class Migration(migrations.Migration):
    dependencies = [
        ("suscripciones", "0001_initial"),
        ("clinicas", "0048_desactivar_consentimientos_de_plantillas_borradas"),
    ]

    operations = [migrations.RunPython(crear, migrations.RunPython.noop)]
