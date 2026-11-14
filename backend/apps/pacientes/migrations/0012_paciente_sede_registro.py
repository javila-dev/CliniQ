from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Count, OuterRef, Subquery
from django.db.models.functions import Coalesce


def llenar_sede_registro(apps, schema_editor):
    """Pacientes existentes: la sede de su primera cita; si no tiene, la de su
    primera cotización con sede; si tampoco, la única sede de la clínica."""
    Paciente = apps.get_model("pacientes", "Paciente")
    Cita = apps.get_model("agenda", "Cita")
    Cotizacion = apps.get_model("cotizaciones", "Cotizacion")
    Sede = apps.get_model("clinicas", "Sede")

    primera_cita = Cita.objects.filter(paciente=OuterRef("pk")).order_by("fecha_inicio").values("sede_id")[:1]
    primera_cotizacion = (
        Cotizacion.objects.filter(paciente=OuterRef("pk"), sede__isnull=False)
        .order_by("created_at")
        .values("sede_id")[:1]
    )
    Paciente.objects.filter(sede_registro__isnull=True).update(
        sede_registro_id=Coalesce(Subquery(primera_cita), Subquery(primera_cotizacion))
    )

    clinicas_una_sede = (
        Sede.objects.values("clinica_id").annotate(n=Count("id")).filter(n=1).values_list("clinica_id", flat=True)
    )
    unica = Sede.objects.filter(clinica_id=OuterRef("clinica_id")).values("id")[:1]
    Paciente.objects.filter(sede_registro__isnull=True, clinica_id__in=list(clinicas_una_sede)).update(
        sede_registro_id=Subquery(unica)
    )


class Migration(migrations.Migration):

    dependencies = [
        ("pacientes", "0011_checkin_omitido"),
        ("clinicas", "0055_recurso_sala_nombre_unico_por_clinica"),
        ("agenda", "0019_correccion_cambiar_tratamiento"),
        ("cotizaciones", "0021_autorizacion_precios"),
    ]

    operations = [
        migrations.AddField(
            model_name="paciente",
            name="sede_registro",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pacientes_registrados",
                to="clinicas.sede",
            ),
        ),
        migrations.RunPython(llenar_sede_registro, migrations.RunPython.noop),
    ]
