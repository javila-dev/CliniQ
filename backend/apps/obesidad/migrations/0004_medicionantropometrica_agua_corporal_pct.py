# Generated manually 2026-08-30

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('obesidad', '0003_medicionantropometrica_campos_adicionales_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicionantropometrica',
            name='agua_corporal_pct',
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=4, null=True),
        ),
    ]
