"""Los procedimientos dejan de exigir plantillas de consentimiento ya borradas.

Borrar una plantilla solo la desactivaba; sus relaciones con los procedimientos
seguían activas y el consentimiento se seguía pidiendo al agendar y atender.
Desde ahora el borrado desactiva también las relaciones; esto limpia las que ya
quedaron colgando.
"""

from django.db import migrations
from django.utils import timezone


def desactivar(apps, schema_editor):
    ServicioConsentimiento = apps.get_model("clinicas", "ServicioConsentimiento")
    ServicioConsentimiento.objects.filter(activo=True, template__activo=False).update(
        activo=False, updated_at=timezone.now()
    )


class Migration(migrations.Migration):
    dependencies = [
        ("clinicas", "0047_precios_por_sede"),
        ("configuracion", "__first__"),
    ]

    operations = [migrations.RunPython(desactivar, migrations.RunPython.noop)]
