import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventario", "0005_backfill_stock_por_sede"),
    ]

    operations = [
        migrations.AlterField(
            model_name="movimientoinventario",
            name="sede",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="movimientos_inventario",
                to="clinicas.sede",
            ),
        ),
        migrations.RemoveField(
            model_name="insumo",
            name="costo_promedio",
        ),
        migrations.RemoveField(
            model_name="insumo",
            name="stock_actual",
        ),
    ]
