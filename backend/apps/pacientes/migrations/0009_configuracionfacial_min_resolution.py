from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pacientes', '0008_alter_configuracionfacial_min_det_score_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracionfacial',
            name='min_resolution',
            field=models.FloatField(default=400.0),
        ),
    ]
