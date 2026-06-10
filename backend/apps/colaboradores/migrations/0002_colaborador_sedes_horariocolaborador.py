import uuid

from django.db import migrations, models
import django.db.models.deletion


def backfill_sedes(apps, schema_editor):
    Colaborador = apps.get_model("colaboradores", "Colaborador")
    through_model = Colaborador.sedes.through

    rows = []
    for colaborador in Colaborador.objects.exclude(sede_principal_id=None).only("id", "sede_principal_id"):
        rows.append(
            through_model(
                colaborador_id=colaborador.id,
                sede_id=colaborador.sede_principal_id,
            )
        )

    if rows:
        through_model.objects.bulk_create(rows, ignore_conflicts=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("clinicas", "0004_clinica_telefono"),
        ("colaboradores", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="colaborador",
            name="sedes",
            field=models.ManyToManyField(blank=True, related_name="colaboradores_asignados", to="clinicas.sede"),
        ),
        migrations.CreateModel(
            name="HorarioColaborador",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("dia_semana", models.CharField(choices=[("lunes", "Lunes"), ("martes", "Martes"), ("miercoles", "Miercoles"), ("jueves", "Jueves"), ("viernes", "Viernes"), ("sabado", "Sabado"), ("domingo", "Domingo")], max_length=10)),
                ("hora_inicio", models.TimeField()),
                ("hora_fin", models.TimeField()),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="horarios", to="colaboradores.colaborador")),
                ("sede", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="horarios_colaboradores", to="clinicas.sede")),
            ],
            options={
                "db_table": "horarios_colaborador",
                "ordering": ["colaborador", "sede", "dia_semana"],
            },
        ),
        migrations.AddConstraint(
            model_name="horariocolaborador",
            constraint=models.UniqueConstraint(fields=("colaborador", "sede", "dia_semana"), name="uniq_horario_colaborador_sede_dia"),
        ),
        migrations.RunPython(backfill_sedes, noop_reverse),
    ]
