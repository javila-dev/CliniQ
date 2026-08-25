import django.db.models.deletion
import django.utils.timezone
import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("cotizaciones", "__first__"),
        ("historia_clinica", "__first__"),
        ("pacientes", "__first__"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AntecedentesObesidad",
            fields=[
                ("id",                    models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("activo",                models.BooleanField(default=True)),
                ("created_at",            models.DateTimeField(auto_now_add=True)),
                ("updated_at",            models.DateTimeField(auto_now=True)),
                ("historia",              models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="antecedentes_obesidad", to="historia_clinica.historiaclinica")),
                ("peso_maximo_kg",        models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("peso_minimo_adulto_kg", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("intentos_previos",      models.TextField(blank=True)),
                ("comorbilidades",        models.JSONField(blank=True, default=list)),
                ("medicamentos_actuales", models.TextField(blank=True)),
                ("antecedente_familiar",  models.BooleanField(null=True, blank=True)),
                ("actividad_fisica",      models.CharField(blank=True, max_length=20, choices=[("sedentario","Sedentario"),("leve","Leve (1-2 días/semana)"),("moderado","Moderado (3-4 días/semana)"),("intenso","Intenso (5+ días/semana)")])),
                ("patron_alimentario",    models.TextField(blank=True)),
                ("factores_emocionales",  models.TextField(blank=True)),
            ],
            options={"db_table": "obesidad_antecedentes"},
        ),
        migrations.CreateModel(
            name="ObjetivoObesidad",
            fields=[
                ("id",               models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("activo",           models.BooleanField(default=True)),
                ("created_at",       models.DateTimeField(auto_now_add=True)),
                ("updated_at",       models.DateTimeField(auto_now=True)),
                ("paciente",         models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="objetivos_obesidad", to="pacientes.paciente")),
                ("cotizacion",       models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="objetivo_obesidad", to="cotizaciones.cotizacion")),
                ("peso_inicial_kg",  models.DecimalField(decimal_places=2, max_digits=5)),
                ("peso_objetivo_kg", models.DecimalField(decimal_places=2, max_digits=5)),
                ("fecha_inicio",     models.DateField()),
                ("fecha_objetivo",   models.DateField(blank=True, null=True)),
            ],
            options={"db_table": "obesidad_objetivos", "ordering": ["-fecha_inicio"]},
        ),
        migrations.CreateModel(
            name="MedicionAntropometrica",
            fields=[
                ("id",                  models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("activo",              models.BooleanField(default=True)),
                ("created_at",          models.DateTimeField(auto_now_add=True)),
                ("updated_at",          models.DateTimeField(auto_now=True)),
                ("paciente",            models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="mediciones_antropometricas", to="pacientes.paciente")),
                ("nota",                models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="mediciones_antropometricas", to="historia_clinica.notaclinica")),
                ("tomado_por",          models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="mediciones_tomadas", to=settings.AUTH_USER_MODEL)),
                ("fecha",               models.DateTimeField(default=django.utils.timezone.now)),
                ("peso_kg",             models.DecimalField(decimal_places=2, max_digits=5)),
                ("talla_cm",            models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("imc",                 models.DecimalField(blank=True, decimal_places=2, max_digits=4, null=True)),
                ("cintura_cm",          models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("cadera_cm",           models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("icc",                 models.DecimalField(blank=True, decimal_places=3, max_digits=4, null=True)),
                ("brazo_cm",            models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("muslo_cm",            models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("grasa_corporal_pct",  models.DecimalField(blank=True, decimal_places=1, max_digits=4, null=True)),
                ("masa_muscular_kg",    models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("grasa_visceral",      models.DecimalField(blank=True, decimal_places=1, max_digits=4, null=True)),
                ("presion_sistolica",   models.PositiveIntegerField(blank=True, null=True)),
                ("presion_diastolica",  models.PositiveIntegerField(blank=True, null=True)),
            ],
            options={"db_table": "obesidad_mediciones", "ordering": ["-fecha"]},
        ),
        migrations.CreateModel(
            name="ResultadoLaboratorio",
            fields=[
                ("id",             models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("activo",         models.BooleanField(default=True)),
                ("created_at",     models.DateTimeField(auto_now_add=True)),
                ("updated_at",     models.DateTimeField(auto_now=True)),
                ("paciente",       models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="resultados_laboratorio", to="pacientes.paciente")),
                ("registrado_por", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="laboratorios_registrados", to=settings.AUTH_USER_MODEL)),
                ("fecha",          models.DateField()),
                ("tipo",           models.CharField(max_length=20, choices=[("glucosa","Glucosa / Insulina"),("hba1c","HbA1c"),("lipidos","Perfil lipídico"),("hepatico","Función hepática"),("tiroideo","Perfil tiroideo"),("hemograma","Hemograma"),("otro","Otro")])),
                ("archivo",        models.FileField(blank=True, null=True, upload_to="laboratorios/")),
                ("valores",        models.JSONField(blank=True, default=dict)),
                ("observaciones",  models.TextField(blank=True)),
            ],
            options={"db_table": "obesidad_laboratorios", "ordering": ["-fecha"]},
        ),
        migrations.CreateModel(
            name="TratamientoFarmacologico",
            fields=[
                ("id",                 models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("activo",             models.BooleanField(default=True)),
                ("created_at",         models.DateTimeField(auto_now_add=True)),
                ("updated_at",         models.DateTimeField(auto_now=True)),
                ("paciente",           models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="tratamientos_farmacologicos", to="pacientes.paciente")),
                ("nota",               models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="prescripciones_farmacologicas", to="historia_clinica.notaclinica")),
                ("indicado_por",       models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="prescripciones_indicadas", to=settings.AUTH_USER_MODEL)),
                ("medicamento",        models.CharField(max_length=200)),
                ("principio_activo",   models.CharField(blank=True, max_length=200)),
                ("dosis",              models.CharField(max_length=200)),
                ("via",                models.CharField(default="oral", max_length=20, choices=[("oral","Oral"),("subcutanea","Subcutánea"),("intramuscular","Intramuscular")])),
                ("frecuencia",         models.CharField(max_length=200)),
                ("fecha_inicio",       models.DateField()),
                ("fecha_fin",          models.DateField(blank=True, null=True)),
                ("motivo_suspension",  models.TextField(blank=True)),
            ],
            options={"db_table": "obesidad_farmacologico", "ordering": ["-fecha_inicio"]},
        ),
    ]
