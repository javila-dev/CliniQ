from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("consentimientos", "0004_consentimiento_documenso_documento_id_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="consentimiento",
            name="plantilla",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="consentimientos",
                to="consentimientos.plantillaconsentimiento",
                help_text="Nulo para el compromiso de pago estandar (texto no configurable).",
            ),
        ),
    ]
