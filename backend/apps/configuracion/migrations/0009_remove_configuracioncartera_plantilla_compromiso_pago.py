from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("configuracion", "0008_alter_documensoconsentimientotemplate_options_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="configuracioncartera",
            name="plantilla_compromiso_pago",
        ),
    ]
