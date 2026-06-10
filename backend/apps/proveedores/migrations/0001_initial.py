# Generated manually for proveedores app.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("clinicas", "0002_servicio_sede"),
        ("inventario", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Proveedor",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("nombre", models.CharField(max_length=200)),
                ("nit", models.CharField(max_length=20)),
                ("contacto", models.CharField(blank=True, max_length=100)),
                ("telefono", models.CharField(max_length=20)),
                ("email", models.EmailField(blank=True, max_length=254)),
                (
                    "categoria",
                    models.CharField(
                        choices=[
                            ("insumos_medicos", "Insumos medicos"),
                            ("productos_belleza", "Productos de belleza"),
                            ("equipos", "Equipos"),
                            ("papeleria", "Papeleria"),
                            ("otro", "Otro"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "clinica",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="proveedores",
                        to="clinicas.clinica",
                    ),
                ),
            ],
            options={"db_table": "proveedores", "ordering": ["nombre"]},
        ),
        migrations.CreateModel(
            name="OrdenCompra",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("numero", models.CharField(blank=True, max_length=20, unique=True)),
                ("fecha", models.DateField()),
                ("fecha_entrega_esperada", models.DateField(blank=True, null=True)),
                (
                    "estado",
                    models.CharField(
                        choices=[
                            ("borrador", "Borrador"),
                            ("enviada", "Enviada"),
                            ("recibida_parcial", "Recibida parcial"),
                            ("recibida_total", "Recibida total"),
                            ("cancelada", "Cancelada"),
                        ],
                        default="borrador",
                        max_length=20,
                    ),
                ),
                ("notas", models.TextField(blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ordenes_compra_creadas",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "proveedor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ordenes_compra",
                        to="proveedores.proveedor",
                    ),
                ),
                (
                    "sede",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ordenes_compra",
                        to="clinicas.sede",
                    ),
                ),
            ],
            options={"db_table": "ordenes_compra", "ordering": ["-fecha", "-created_at"]},
        ),
        migrations.CreateModel(
            name="ItemOrdenCompra",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("activo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cantidad", models.DecimalField(decimal_places=3, max_digits=10)),
                ("precio_unitario", models.DecimalField(decimal_places=2, max_digits=12)),
                ("cantidad_recibida", models.DecimalField(decimal_places=3, default=0, max_digits=10)),
                (
                    "insumo",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="items_orden_compra",
                        to="inventario.insumo",
                    ),
                ),
                (
                    "orden",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="proveedores.ordencompra",
                    ),
                ),
            ],
            options={"db_table": "items_orden_compra", "ordering": ["created_at"]},
        ),
    ]
