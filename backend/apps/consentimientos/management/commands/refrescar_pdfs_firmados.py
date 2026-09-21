from django.core.management.base import BaseCommand

from apps.agenda.models import Cita
from apps.consentimientos.models import Consentimiento
from apps.consentimientos.services import recuperar_pdf_asistencia, recuperar_pdf_compromiso_pago
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.services import refrescar_pdf_consentimiento_informado

TIPOS = ("compromiso", "asistencia", "informado")


class Command(BaseCommand):
    help = (
        "Vuelve a descargar de Documenso el PDF firmado y sellado y reemplaza el guardado cuando difiere. "
        "Repara PDFs que quedaron sin firma por descargarse antes de que Documenso sellara el documento. "
        "Cubre: aceptacion/compromiso de pago y actas (compromiso), registro de asistencia (asistencia) "
        "y consentimientos informados (informado)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--tipo", choices=(*TIPOS, "todos"), default="todos")
        parser.add_argument("--id", help="Solo este registro (UUID del consentimiento o de la cita).")
        parser.add_argument("--dry-run", action="store_true", help="Solo cuenta lo que se revisaria.")

    def _linea(self, tipo, pk, resultado):
        self.stdout.write(f"[{tipo}] {pk}: {resultado}")

    def handle(self, *args, **options):
        tipos = TIPOS if options["tipo"] == "todos" else (options["tipo"],)
        pk = options["id"]
        dry = options["dry_run"]
        totales = {"actualizado": 0, "sin_cambios": 0, "no_disponible": 0}

        def procesar(tipo, objetos, refrescar):
            for objeto in objetos:
                if dry:
                    self._linea(tipo, objeto.pk, "se revisaria")
                    continue
                try:
                    resultado = refrescar(objeto)
                except Exception as exc:
                    self.stderr.write(f"[{tipo}] {objeto.pk}: error {exc}")
                    resultado = "no_disponible"
                totales[resultado] += 1
                self._linea(tipo, objeto.pk, resultado)

        def como_estado(funcion):
            # Estas funciones devuelven bool y no distinguen "sin cambios" de "actualizado".
            return lambda obj: "actualizado" if funcion(obj, reemplazar=True) else "no_disponible"

        if "compromiso" in tipos:
            qs = Consentimiento.objects.filter(
                estado=Consentimiento.Estado.FIRMADO, plantilla__isnull=True,
            ).exclude(documenso_documento_id="")
            procesar("compromiso", qs.filter(id=pk) if pk else qs, como_estado(recuperar_pdf_compromiso_pago))
        if "asistencia" in tipos:
            qs = Cita.objects.filter(firma_asistencia_estado="firmada").exclude(firma_asistencia_documento_id="")
            procesar("asistencia", qs.filter(id=pk) if pk else qs, como_estado(recuperar_pdf_asistencia))
        if "informado" in tipos:
            qs = ConsentimientoInformado.objects.filter(firmado=True).exclude(documenso_document_id__isnull=True).exclude(
                documenso_document_id="",
            )
            procesar("informado", qs.filter(id=pk) if pk else qs, refrescar_pdf_consentimiento_informado)

        self.stdout.write(self.style.SUCCESS(
            "Listo. " + ("Modo simulacion." if dry else
                         f"Actualizados/vigentes: {totales['actualizado']}. Sin cambios: {totales['sin_cambios']}. "
                         f"No disponibles: {totales['no_disponible']}.")
        ))
