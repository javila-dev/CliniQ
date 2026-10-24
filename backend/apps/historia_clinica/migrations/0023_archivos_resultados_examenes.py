"""
Un resultado de examen pasa a tener varios archivos (ArchivoResultadoExamen).

El archivo único que tenía cada resultado se mueve a la tabla nueva sin copiar
nada en el storage: el registro nuevo apunta al mismo objeto.
"""
import os

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models

import apps.historia_clinica.models


def mover_archivos(apps, schema_editor):
    ResultadoExamen = apps.get_model("historia_clinica", "ResultadoExamen")
    ArchivoResultadoExamen = apps.get_model("historia_clinica", "ArchivoResultadoExamen")
    nuevos = [
        ArchivoResultadoExamen(
            resultado_id=r.id,
            archivo=r.archivo.name,
            nombre=os.path.basename(r.archivo.name),
            subido_por_id=r.created_by_id,
        )
        for r in ResultadoExamen.objects.exclude(archivo="").exclude(archivo__isnull=True)
    ]
    ArchivoResultadoExamen.objects.bulk_create(nuevos)


def devolver_archivos(apps, schema_editor):
    ResultadoExamen = apps.get_model("historia_clinica", "ResultadoExamen")
    ArchivoResultadoExamen = apps.get_model("historia_clinica", "ArchivoResultadoExamen")
    for a in ArchivoResultadoExamen.objects.filter(activo=True).order_by("-created_at"):
        ResultadoExamen.objects.filter(pk=a.resultado_id).update(archivo=a.archivo.name)


class Migration(migrations.Migration):

    dependencies = [
        ("historia_clinica", "0022_zonas_por_nota"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ArchivoResultadoExamen",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("archivo", models.FileField(upload_to=apps.historia_clinica.models.resultado_examen_upload_path)),
                ("nombre", models.CharField(blank=True, default="", max_length=255)),
                (
                    "resultado",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="archivos",
                        to="historia_clinica.resultadoexamen",
                    ),
                ),
                (
                    "subido_por",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="archivos_examenes_subidos",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "resultados_examenes_archivos",
                "ordering": ["created_at"],
            },
        ),
        migrations.RunPython(mover_archivos, devolver_archivos),
        migrations.RemoveField(model_name="resultadoexamen", name="archivo"),
    ]
