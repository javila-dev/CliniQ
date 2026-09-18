from django.core.management.base import BaseCommand

from apps.consentimientos.models import Consentimiento
from apps.consentimientos.services import recuperar_pdf_compromiso_pago


class Command(BaseCommand):
    help = (
        "Vuelve a descargar de Documenso el PDF firmado de los consentimientos firmados por Documenso "
        "(aceptacion/compromiso de pago, actas) y reemplaza el guardado. Repara PDFs que quedaron "
        "sin firma por descargarse antes de que Documenso sellara el documento."
    )

    def add_arguments(self, parser):
        parser.add_argument("--id", help="Solo este consentimiento (UUID).")

    def handle(self, *args, **options):
        consentimientos = Consentimiento.objects.filter(
            estado=Consentimiento.Estado.FIRMADO, plantilla__isnull=True,
        ).exclude(documenso_documento_id="")
        if options["id"]:
            consentimientos = consentimientos.filter(id=options["id"])

        reemplazados = omitidos = 0
        for consentimiento in consentimientos:
            try:
                ok = recuperar_pdf_compromiso_pago(consentimiento, reemplazar=True)
            except Exception as exc:
                ok = False
                self.stderr.write(f"{consentimiento.id}: error {exc}")
            if ok:
                reemplazados += 1
                self.stdout.write(f"{consentimiento.id}: PDF firmado actualizado")
            else:
                omitidos += 1
                self.stdout.write(f"{consentimiento.id}: omitido (documento aun sin sellar o no disponible)")
        self.stdout.write(self.style.SUCCESS(f"Listo. Actualizados: {reemplazados}. Omitidos: {omitidos}."))
