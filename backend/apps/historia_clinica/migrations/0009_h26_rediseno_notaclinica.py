"""
H26 — Rediseño NotaClinica: atención = nota completa.

Cada atención genera una única NotaClinica con estado borrador → completada.
Se eliminan los campos clínicos específicos (tipo, anamnesis, diagnostico, etc.)
y se añaden motivo_consulta y plan_manejo como campos unificados de la nota.
Los registros históricos se migran: anamnesis → motivo_consulta, estado=completada.

FK nota nullable añadida a ResultadoExamen y OrdenMedica.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def migrar_datos_notas_historicas(apps, schema_editor):
    NotaClinica = apps.get_model("historia_clinica", "NotaClinica")
    # Mapear datos históricos al nuevo esquema y marcar como completadas
    NotaClinica.objects.all().update(estado="completada")
    for nota in NotaClinica.objects.exclude(anamnesis=""):
        if not nota.motivo_consulta:
            nota.motivo_consulta = nota.anamnesis
            nota.save(update_fields=["motivo_consulta"])


class Migration(migrations.Migration):
    # atomic=False porque PostgreSQL no permite ALTER TABLE con triggers diferibles pendientes
    # en la misma transacción (ocurre al combinar AlterField de FK con otras alteraciones).
    atomic = False

    dependencies = [
        ("historia_clinica", "0008_notaclinica_causa_externa_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Añadir nuevos campos a NotaClinica
        migrations.AddField(
            model_name="notaclinica",
            name="estado",
            field=models.CharField(
                choices=[("borrador", "Borrador"), ("completada", "Completada")],
                default="borrador",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="notaclinica",
            name="motivo_consulta",
            field=models.TextField(blank=True, null=True),
        ),
        # 2. Hacer plan_manejo nullable (conserva datos existentes)
        migrations.AlterField(
            model_name="notaclinica",
            name="plan_manejo",
            field=models.TextField(blank=True, null=True),
        ),
        # 3. Hacer firmada_por y firmada_en nullable
        migrations.AlterField(
            model_name="notaclinica",
            name="firmada_por",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="notas_firmadas",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="notaclinica",
            name="firmada_en",
            field=models.DateTimeField(blank=True, null=True),
        ),
        # 4. Data migration: copiar anamnesis → motivo_consulta, marcar estado=completada
        migrations.RunPython(migrar_datos_notas_historicas, migrations.RunPython.noop),
        # 5. Eliminar campos clínicos específicos viejos
        migrations.RemoveField(model_name="notaclinica", name="nota_aclarada"),
        migrations.RemoveField(model_name="notaclinica", name="servicio"),
        migrations.RemoveField(model_name="notaclinica", name="tipo"),
        migrations.RemoveField(model_name="notaclinica", name="anamnesis"),
        migrations.RemoveField(model_name="notaclinica", name="diagnostico"),
        migrations.RemoveField(model_name="notaclinica", name="observaciones"),
        migrations.RemoveField(model_name="notaclinica", name="zona_tratada"),
        migrations.RemoveField(model_name="notaclinica", name="productos_usados"),
        migrations.RemoveField(model_name="notaclinica", name="tecnica"),
        migrations.RemoveField(model_name="notaclinica", name="reacciones_adversas"),
        migrations.RemoveField(model_name="notaclinica", name="cuidados_post"),
        migrations.RemoveField(model_name="notaclinica", name="proxima_cita_sugerida"),
        migrations.RemoveField(model_name="notaclinica", name="modalidad_consulta"),
        migrations.RemoveField(model_name="notaclinica", name="tipo_consulta"),
        migrations.RemoveField(model_name="notaclinica", name="causa_externa"),
        migrations.RemoveField(model_name="notaclinica", name="via_ingreso"),
        migrations.RemoveField(model_name="notaclinica", name="lugar_atencion"),
        migrations.RemoveField(model_name="notaclinica", name="consecutivo_consulta"),
        # 6. Cambiar ordering de NotaClinica
        migrations.AlterModelOptions(
            name="notaclinica",
            options={"db_table": "notas_clinicas", "ordering": ["-created_at"]},
        ),
        # 7. Añadir FK nota a ResultadoExamen
        migrations.AddField(
            model_name="resultadoexamen",
            name="nota",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="examenes",
                to="historia_clinica.notaclinica",
            ),
        ),
        # 8. Añadir FK nota a OrdenMedica
        migrations.AddField(
            model_name="ordenmedica",
            name="nota",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="ordenes",
                to="historia_clinica.notaclinica",
            ),
        ),
    ]
