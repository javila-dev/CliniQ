from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('proveedores', '0002_ordencompra_fecha_factura_proveedor_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ordencompra',
            name='numero_factura_proveedor',
            field=models.CharField(max_length=50),
        ),
    ]
