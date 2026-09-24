from django.db import OperationalError, ProgrammingError, transaction

FORMAS_PAGO_DEFAULT = [
    # (nombre, tipo_base, orden)
    ("Efectivo", "efectivo", 1),
    ("Transferencia", "transferencia", 2),
    ("Tarjeta débito", "tarjeta_debito", 3),
    ("Tarjeta crédito", "tarjeta_credito", 4),
    ("Crédito", "credito", 5),
    ("Cuotas", "cuotas", 6),
    ("Financiamiento", "financiamiento", 7),
    ("Otro", "otro", 8),
]


def ensure_default_formas_pago_for_clinica(clinica):
    """Siembra el catálogo base de formas de pago de una clínica.

    Idempotente (``update_or_create`` por nombre): sirve tanto para la
    creación de una clínica nueva como para backfill de una existente.
    """
    from apps.clinicas.models import FormaDePago

    try:
        with transaction.atomic():
            for nombre, tipo_base, orden in FORMAS_PAGO_DEFAULT:
                FormaDePago.objects.update_or_create(
                    clinica=clinica,
                    nombre=nombre,
                    defaults={
                        "tipo_base": tipo_base,
                        "es_sistema": True,
                        "activo": True,
                        "orden": orden,
                    },
                )
    except (OperationalError, ProgrammingError):
        return


def resolver_forma_pago_por_tipo_base(clinica, tipo_base):
    """Busca la forma de pago sembrada de ``clinica`` para ``tipo_base``.

    Usado por integraciones que solo conocen el tipo base (p. ej. el
    asistente de puesta en marcha, que recibe un string plano del frontend)
    en vez del id de la fila. Siempre debería existir porque el seed cubre
    todos los ``tipo_base`` — si no, cae a "Otro".
    """
    from apps.clinicas.models import FormaDePago

    return (
        FormaDePago.objects.filter(clinica=clinica, tipo_base=tipo_base, activo=True).first()
        or FormaDePago.objects.filter(clinica=clinica, tipo_base=FormaDePago.TipoBase.OTRO).first()
    )
