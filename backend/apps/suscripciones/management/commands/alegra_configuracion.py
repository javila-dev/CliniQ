from django.core.management.base import BaseCommand

from apps.suscripciones import alegra


class Command(BaseCommand):
    help = (
        "Lista de la cuenta de Alegra lo que se configura en el .env: numeraciones "
        "(ALEGRA_NUMBER_TEMPLATE_ID), impuestos (ALEGRA_TAX_ID), cuentas bancarias "
        "(ALEGRA_BANK_ACCOUNT_ID) e ítems (ALEGRA_ITEM_ID). Solo lee."
    )

    def handle(self, *args, **options):
        secciones = [
            ("Numeraciones (ALEGRA_NUMBER_TEMPLATE_ID)", "/number-templates", ("id", "name", "prefix", "documentType", "isElectronic", "status")),
            ("Impuestos (ALEGRA_TAX_ID)", "/taxes", ("id", "name", "percentage", "type", "status")),
            ("Cuentas bancarias (ALEGRA_BANK_ACCOUNT_ID)", "/bank-accounts", ("id", "name", "type", "status")),
            ("Ítems (ALEGRA_ITEM_ID)", "/items", ("id", "name", "price", "status")),
        ]
        for titulo, ruta, campos in secciones:
            self.stdout.write(self.style.MIGRATE_HEADING(titulo))
            try:
                for fila in alegra.listar(ruta):
                    self.stdout.write("  " + " | ".join(f"{c}={fila.get(c)}" for c in campos if c in fila))
            except alegra.AlegraError as exc:
                self.stdout.write(self.style.ERROR(f"  {exc}"))
