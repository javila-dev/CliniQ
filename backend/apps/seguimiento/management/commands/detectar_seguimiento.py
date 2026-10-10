from django.core.management.base import BaseCommand

from apps.clinicas.models import Clinica
from apps.seguimiento.deteccion import detectar_paquetes


class Command(BaseCommand):
    help = "Detecta paquetes atrasados y los pone en 'Para hoy' (todas las clínicas activas o --clinica)."

    def add_arguments(self, parser):
        parser.add_argument("--clinica", help="id de una clínica")

    def handle(self, *args, **options):
        clinicas = Clinica.objects.filter(activo=True)
        if options.get("clinica"):
            clinicas = clinicas.filter(pk=options["clinica"])
        for clinica in clinicas:
            resultado = detectar_paquetes(clinica)
            self.stdout.write(f"{clinica.nombre}: {resultado}")
