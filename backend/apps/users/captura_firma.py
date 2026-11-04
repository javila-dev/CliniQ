"""Captura de la firma del profesional: dibujada en el navegador o desde el celular por QR.

La firma queda en ``User.firma_digital`` (bucket público, como la foto de perfil) y se
usa en órdenes médicas y en la firma diferida de consentimientos.
"""
import io
import os
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.storage import delete_public_file, upload_public_file
from apps.users.models import CapturaFirmaToken

TAMANO_MAXIMO_FIRMA = 2 * 1024 * 1024


class FirmaInvalidaError(Exception):
    pass


def puede_tener_firma(user) -> bool:
    """Mismo criterio que el perfil: quien atiende pacientes o un admin."""
    return bool(getattr(user, "es_profesional", False) or getattr(user, "es_admin", False))


def validar_png_firma(datos: bytes) -> bytes:
    """Valida que sea una imagen PNG razonable y la devuelve normalizada."""
    from PIL import Image

    if not datos:
        raise FirmaInvalidaError("La firma está vacía.")
    if len(datos) > TAMANO_MAXIMO_FIRMA:
        raise FirmaInvalidaError("La firma es demasiado grande.")
    try:
        imagen = Image.open(io.BytesIO(datos))
        imagen.load()
    except Exception as exc:
        raise FirmaInvalidaError("La firma no es una imagen válida.") from exc
    if imagen.format != "PNG":
        raise FirmaInvalidaError("La firma debe ser una imagen PNG.")
    if imagen.width < 20 or imagen.height < 10 or imagen.width > 4000 or imagen.height > 4000:
        raise FirmaInvalidaError("La firma tiene un tamaño no válido.")
    return datos


def ruta_unica_imagen(user, field_name: str, nombre_original: str) -> str:
    """Ruta propia del usuario y distinta en cada subida.

    Con el nombre del archivo tal cual, la firma dibujada en el navegador (siempre
    ``firma.png``) caía en la misma ruta para todos los profesionales: cada uno
    sobrescribía la de los demás y la URL no cambiaba, así que el navegador seguía
    mostrando la firma anterior en caché.
    """
    from apps.users.models import User

    extension = os.path.splitext(nombre_original or "")[1].lower() or ".png"
    field = User._meta.get_field(field_name)
    return field.generate_filename(user, f"{field_name}-{user.id}-{secrets.token_hex(4)}{extension}")


def borrar_imagen_anterior(user, field_name: str, ruta: str) -> None:
    """Borra el archivo anterior salvo que otro usuario apunte a la misma ruta."""
    from apps.users.models import User

    if not ruta:
        return
    if User.objects.filter(**{field_name: ruta}).exclude(pk=user.pk).exists():
        return
    delete_public_file(ruta)


def guardar_firma_digital(user, datos_png: bytes) -> None:
    anterior = user.firma_digital.name if user.firma_digital else ""
    # Nombre nuevo en cada captura: la URL pública cambia y el navegador no muestra la anterior en caché.
    path = ruta_unica_imagen(user, "firma_digital", "firma.png")
    upload_public_file(datos_png, path, "image/png")
    user.firma_digital = path
    user.save(update_fields=["firma_digital", "updated_at"])
    if anterior != path:
        borrar_imagen_anterior(user, "firma_digital", anterior)


@transaction.atomic
def crear_captura_firma(user) -> CapturaFirmaToken:
    """Nuevo enlace de captura; invalida los anteriores que no se usaron."""
    ahora = timezone.now()
    CapturaFirmaToken.objects.filter(user=user, usado_en__isnull=True, expira_en__gt=ahora).update(
        expira_en=ahora, updated_at=ahora,
    )
    return CapturaFirmaToken.objects.create(
        user=user,
        token=secrets.token_urlsafe(32),
        expira_en=ahora + timedelta(minutes=CapturaFirmaToken.VIGENCIA_MINUTOS),
    )


def estado_captura(captura: CapturaFirmaToken) -> str:
    if captura.usado:
        return "completado"
    if captura.vencido:
        return "vencido"
    return "pendiente"


@transaction.atomic
def completar_captura_firma(token: str, datos_png: bytes, *, ip: str | None, user_agent: str) -> CapturaFirmaToken:
    captura = (
        CapturaFirmaToken.objects.select_for_update().select_related("user").filter(token=token).first()
    )
    if captura is None or not captura.vigente:
        raise CapturaFirmaToken.DoesNotExist
    guardar_firma_digital(captura.user, validar_png_firma(datos_png))
    captura.usado_en = timezone.now()
    captura.ip_captura = ip
    captura.user_agent_captura = (user_agent or "")[:500]
    captura.save(update_fields=["usado_en", "ip_captura", "user_agent_captura", "updated_at"])
    return captura
