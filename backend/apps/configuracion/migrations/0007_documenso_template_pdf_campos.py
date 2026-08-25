from django.db import migrations, models
import apps.configuracion.models


class Migration(migrations.Migration):

    dependencies = [
        ("configuracion", "0006_add_paso_verificacion_facial"),
    ]

    operations = [
        migrations.AddField(
            model_name="documensoconsentimientotemplate",
            name="nombre",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="documensoconsentimientotemplate",
            name="pdf_file",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=apps.configuracion.models.plantilla_pdf_upload_path,
            ),
        ),
        migrations.AddField(
            model_name="documensoconsentimientotemplate",
            name="campos",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Lista de campos de firma/texto/fecha/checkbox con posición en el PDF",
            ),
        ),
        migrations.AlterField(
            model_name="documensoconsentimientotemplate",
            name="tipo",
            field=models.CharField(
                blank=True,
                choices=[
                    ("general", "Consentimiento General"),
                    ("toxina_botulinica", "Toxina Botulinica"),
                    ("rellenos", "Rellenos Dermicos"),
                    ("laser", "Laser y Luz Pulsada"),
                    ("peelings", "Peelings y Exfoliaciones"),
                    ("mesoterapia", "Mesoterapia"),
                    ("otros", "Otros procedimientos"),
                ],
                default="",
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="documensoconsentimientotemplate",
            name="template_token",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.RemoveConstraint(
            model_name="documensoconsentimientotemplate",
            name="uniq_documenso_template_clinica_token",
        ),
        migrations.AddConstraint(
            model_name="documensoconsentimientotemplate",
            constraint=models.UniqueConstraint(
                condition=models.Q(template_token__gt=""),
                fields=["clinica", "template_token"],
                name="uniq_documenso_template_clinica_token",
            ),
        ),
    ]
