from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0006_stock_por_sede_requerido'),
    ]

    operations = [
        migrations.AddField(
            model_name='insumo',
            name='permite_stock_negativo',
            field=models.BooleanField(
                default=False,
                help_text='Permite registrar salidas (consumo o venta) aunque el stock disponible no alcance.',
            ),
        ),
    ]
