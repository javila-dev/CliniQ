import unicodedata

from django.db import migrations, models


def marcar_clinica_como_recomendado(apps, schema_editor):
    """Conserva lo que ya mostraba el landing: el plan público "Clínica" queda como recomendado."""
    Plan = apps.get_model("clinicas", "Plan")
    if Plan.objects.filter(recomendado=True).exists():
        return

    def normalizar(texto):
        sin_tildes = unicodedata.normalize("NFD", texto)
        return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").strip().lower()

    for plan in Plan.objects.filter(activo=True, mostrar_publico=True):
        if normalizar(plan.nombre) == "clinica":
            Plan.objects.filter(pk=plan.pk).update(recomendado=True)
            return


class Migration(migrations.Migration):
    # Va después de 0051. La rama feature/quitar-obesidad también parte de 0051
    # (0052_quitar_modulo_obesidad): al unir las dos hace falta un merge de migraciones.
    dependencies = [
        ("clinicas", "0051_nit_opcional"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="recomendado",
            field=models.BooleanField(
                db_default=False,
                default=False,
                help_text="Plan destacado como «Más elegido» en la landing. Solo uno puede estarlo y tiene que ser activo y público.",
            ),
        ),
        migrations.AddConstraint(
            model_name="plan",
            constraint=models.UniqueConstraint(
                condition=models.Q(("recomendado", True)),
                fields=("recomendado",),
                name="planes_un_solo_recomendado",
            ),
        ),
        migrations.RunPython(marcar_clinica_como_recomendado, migrations.RunPython.noop),
    ]
