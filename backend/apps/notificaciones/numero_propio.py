"""Addon de WhatsApp con numero propio (Coexistence via Lyvio).

Reglas de CliniQ encima del cliente de Lyvio (lyvio.py): la clinica conecta
hasta N numeros (segun su plan) por Embedded Signup, uno queda como numero por
defecto y cada sede elige desde cual envia. Plan: docs/plan-whatsapp-numero-propio.md.
"""
import logging
import re
from datetime import timedelta
from urllib.parse import quote

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.notificaciones import catalogo_whatsapp, lyvio
from apps.notificaciones.models import (
    AsignacionWhatsappSede, ConexionWhatsappPropio, NumeroWhatsapp, PlantillaWhatsappNumero,
)


logger = logging.getLogger(__name__)

# Unico evento aceptado: el MVP solo conecta numeros en Coexistence. "FINISH"
# es el flujo API-only, que sacaria el numero de la app de WhatsApp Business.
EVENTO_COEXISTENCE = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"

# Motivos de bloqueo del numero (NumeroWhatsapp.bloqueo) que ve la clinica.
MENSAJE_REAUTORIZAR = (
    "Meta no terminó de conectar el número con CliniQ. Pulsa \"Reconectar\"; mientras tanto, los "
    "mensajes salen por el número de CliniQ."
)
MENSAJE_FUERA_DE_LA_APP = (
    "El número dejó de estar en WhatsApp Business. Abre WhatsApp Business en el teléfono de la clínica y "
    "pulsa \"Reconectar\"."
)

# Meta: un portfolio sin verificar puede tener a lo sumo 2 numeros y escribirle
# a 250 pacientes nuevos al dia (limite compartido entre sus numeros).
MAX_NUMEROS_SIN_VERIFICAR = 2
LIMITE_SIN_VERIFICAR = 250
# Cuanto queda pausado un numero que choco con el limite diario de Meta (la
# ventana de Meta es de 24 h moviles).
PAUSA_POR_LIMITE = timedelta(hours=24)


class NumeroPropioError(Exception):
    def __init__(self, mensaje, *, code):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.code = code


def _exigir_addon(clinica):
    if not clinica.whatsapp_numero_propio_habilitado:
        raise NumeroPropioError(
            "El número propio de WhatsApp no está habilitado para esta clínica.",
            code="NUMERO_PROPIO_NO_HABILITADO",
        )


def limite_diario(tier: str):
    """'TIER_250' -> 250, 'TIER_2K' -> 2000, 'TIER_100K' -> 100000. None si es
    ilimitado o no se conoce."""
    match = re.fullmatch(r"TIER_(\d+)(K?)", (tier or "").upper())
    if not match:
        return None
    return int(match.group(1)) * (1000 if match.group(2) else 1)


def _limite_ampliado(tier: str) -> bool:
    """El portfolio ya supero el limite de un negocio sin verificar."""
    if (tier or "").upper() == "TIER_UNLIMITED":
        return True
    limite = limite_diario(tier)
    return limite is not None and limite > LIMITE_SIN_VERIFICAR


def _serializar_numero(numero, por_defecto_id):
    return {
        "id": str(numero.id),
        "numero_visible": numero.numero_visible,
        "estado": numero.estado,
        "estado_display": numero.get_estado_display(),
        "bloqueo": numero.bloqueo,
        "bloqueado_hasta": numero.bloqueado_hasta.isoformat() if numero.bloqueado_hasta else None,
        "ultimo_error": numero.ultimo_error,
        "es_por_defecto": numero.id == por_defecto_id,
        "limite_mensajes": numero.limite_mensajes,
        "limite_diario": limite_diario(numero.limite_mensajes),
    }


def _numeros_permitidos_por_meta(conexion):
    """Tope de numeros que Meta deja conectar: 2 si ningun numero muestra un
    limite de negocio verificado; None si no hay tope conocido. Si no se conoce
    el limite de ningun numero, se cuenta como sin verificar."""
    if any(_limite_ampliado(n.limite_mensajes) for n in conexion.numeros.all()):
        return None
    return MAX_NUMEROS_SIN_VERIFICAR


def estado(clinica) -> dict:
    """Todo lo que necesita la pantalla de configuracion de la clinica."""
    conexion = ConexionWhatsappPropio.objects.filter(clinica=clinica).first()
    if conexion:
        _levantar_pausas_vencidas(conexion)
    por_defecto_id = conexion.numero_por_defecto_id if conexion else None
    numeros = [_serializar_numero(n, por_defecto_id) for n in conexion.numeros.all()] if conexion else []
    asignadas = {a.sede_id: a for a in conexion.asignaciones.all()} if conexion else {}
    sedes = []
    for sede in clinica.sedes.filter(activo=True).order_by("nombre"):
        asignacion = asignadas.get(sede.id)
        sedes.append({
            "id": str(sede.id),
            "nombre": sede.nombre,
            "tipo": asignacion.tipo if asignacion else AsignacionWhatsappSede.Tipo.POR_DEFECTO,
            "numero_id": str(asignacion.numero_id) if asignacion and asignacion.numero_id else None,
        })

    ventas = "".join(c for c in settings.CLINIQ_VENTAS_WHATSAPP if c.isdigit())
    return {
        "habilitado": clinica.whatsapp_numero_propio_habilitado,
        "whatsapp_habilitado": clinica.whatsapp_habilitado,
        "numeros_incluidos": clinica.whatsapp_numeros_incluidos,
        "numero_cliniq": settings.WHATSAPP_NUMERO_CLINIQ,
        "contacto_ventas_url": (
            f"https://wa.me/{ventas}?text="
            + quote(f"Hola, quiero enviar los WhatsApp de {clinica.nombre} desde nuestro propio número.")
            if ventas else ""
        ),
        "meta_app_id": settings.LYVIO_WHATSAPP_APP_ID,
        "meta_config_id": settings.LYVIO_WHATSAPP_CONFIG_ID,
        "pago_meta_configurado": bool(conexion and conexion.pago_meta_configurado),
        "numero_por_defecto_id": str(por_defecto_id) if por_defecto_id else None,
        "numeros_permitidos_meta": _numeros_permitidos_por_meta(conexion) if conexion else MAX_NUMEROS_SIN_VERIFICAR,
        "numeros": numeros,
        "sedes": sedes,
    }


def _conexion(clinica, *, bloquear=False) -> ConexionWhatsappPropio:
    """La conexion se crea sola la primera vez que la clinica la necesita."""
    qs = ConexionWhatsappPropio.objects.select_for_update() if bloquear else ConexionWhatsappPropio.objects
    conexion = qs.filter(clinica=clinica).first()
    if conexion is None:
        conexion, _ = ConexionWhatsappPropio.objects.get_or_create(clinica=clinica)
    return conexion


@transaction.atomic
def configurar(clinica, *, pago_meta_configurado=None, numero_por_defecto_id=None, asignaciones=None):
    """Pago en Meta, numero por defecto y desde que numero envia cada sede."""
    _exigir_addon(clinica)
    conexion = _conexion(clinica, bloquear=True)

    if pago_meta_configurado is not None:
        conexion.pago_meta_configurado = pago_meta_configurado

    if numero_por_defecto_id is not None:
        numero = conexion.numeros.filter(id=numero_por_defecto_id).first()
        if numero is None:
            raise NumeroPropioError("Ese número no pertenece a esta clínica.", code="NUMERO_INVALIDO")
        conexion.numero_por_defecto = numero
    conexion.save()

    if pago_meta_configurado:
        # La clinica dice que ya corrigio el pago: sus numeros vuelven a
        # intentarlo. Si Meta sigue sin pago, el proximo envio los bloquea otra vez.
        for numero in conexion.numeros.filter(bloqueo=NumeroWhatsapp.Bloqueo.PAGO):
            _desbloquear(numero, NumeroWhatsapp.Bloqueo.PAGO)

    Tipo = AsignacionWhatsappSede.Tipo
    for item in asignaciones or []:
        sede = clinica.sedes.filter(id=item["sede_id"]).first()
        if sede is None:
            raise NumeroPropioError("Esa sede no pertenece a esta clínica.", code="SEDE_INVALIDA")
        numero = None
        if item["tipo"] == Tipo.NUMERO:
            numero = conexion.numeros.filter(id=item.get("numero_id")).first()
            if numero is None:
                raise NumeroPropioError("Ese número no pertenece a esta clínica.", code="NUMERO_INVALIDO")
        AsignacionWhatsappSede.objects.update_or_create(
            sede=sede, defaults={"conexion": conexion, "tipo": item["tipo"], "numero": numero},
        )
    return conexion


def conectar_numero(
    clinica,
    *,
    evento: str,
    code: str,
    waba_id: str,
    phone_number_id: str = "",
    business_id: str = "",
) -> NumeroWhatsapp:
    """Canjea el `code` del Embedded Signup en Lyvio y registra el numero. Todo
    se valida antes de llamar a Lyvio: un inbox creado alla no se debe borrar.
    El primer numero queda como numero por defecto (todas las sedes lo usan)."""
    _exigir_addon(clinica)
    if evento != EVENTO_COEXISTENCE:
        raise NumeroPropioError(
            "Meta no habilitó la coexistencia para este número. Tu WhatsApp actual no ha sido modificado.",
            code="SIN_COEXISTENCE",
        )
    if not code or not waba_id:
        raise NumeroPropioError("Meta no devolvió los datos de la conexión. Intenta de nuevo.", code="DATOS_INCOMPLETOS")

    conexion = _conexion(clinica)
    _verificar_limite(clinica, conexion)

    try:
        inbox = lyvio.autorizar_whatsapp(
            code=code, waba_id=waba_id, phone_number_id=phone_number_id, business_id=business_id,
        )
    except lyvio.LyvioError as exc:
        logger.warning("Lyvio no conectó el número de la clínica %s (waba %s): %s", clinica.id, waba_id, exc.mensaje)
        raise NumeroPropioError(_mensaje_conexion_fallida(exc), code="LYVIO_ERROR") from exc
    except requests.ReadTimeout as exc:
        # El pedido llego a Lyvio: el inbox pudo quedar creado alla. Un reintento
        # fallaria con "Channel already exists"; soporte lo registra desde la
        # consola (registrar_inbox_existente).
        logger.error(
            "Timeout conectando el número de la clínica %s (waba %s): revisar si Lyvio creó el inbox",
            clinica.id, waba_id,
        )
        raise NumeroPropioError(
            "La conexión tardó más de lo normal y no sabemos si terminó. No la intentes de nuevo: "
            "escríbenos y la confirmamos.",
            code="LYVIO_TIMEOUT",
        ) from exc
    except requests.RequestException as exc:
        logger.exception("Lyvio no respondió al conectar el número de la clínica %s", clinica.id)
        raise NumeroPropioError(
            "No pudimos comunicarnos con el servicio de WhatsApp. Intenta de nuevo en unos minutos.",
            code="LYVIO_NO_RESPONDE",
        ) from exc

    inbox_id = str((inbox or {}).get("id") or "")
    if not inbox_id:
        logger.error("Lyvio autorizó sin devolver inbox id (clínica %s, waba %s)", clinica.id, waba_id)
        raise NumeroPropioError("El servicio de WhatsApp no devolvió el número conectado.", code="LYVIO_SIN_INBOX")

    try:
        datos = lyvio.datos_inbox(inbox_id)
    except (lyvio.LyvioError, requests.RequestException):
        # El inbox existe: se registra igual y la revision de salud completa el numero.
        logger.warning("No se pudo leer el inbox %s recién creado en Lyvio", inbox_id)
        datos = {}
    return _registrar_numero(
        clinica, conexion, inbox_id,
        waba_id=waba_id, phone_number_id=phone_number_id, business_id=business_id, datos=datos,
    )


def _verificar_limite(clinica, conexion):
    incluidos = clinica.whatsapp_numeros_incluidos
    conectados = conexion.numeros.count()
    if conectados >= incluidos:
        raise NumeroPropioError(
            f"Tu plan incluye {incluidos} {'número' if incluidos == 1 else 'números'} de WhatsApp y ya "
            "están conectados. Escríbenos para agregar otro.",
            code="LIMITE_NUMEROS",
        )
    if conectados >= MAX_NUMEROS_SIN_VERIFICAR:
        # El limite guardado puede estar viejo (p. ej. la clinica verifico su
        # negocio despues de conectar): se relee antes de frenarla.
        for numero in conexion.numeros.all():
            _refrescar_limite(numero)
        if _numeros_permitidos_por_meta(conexion) is not None:
            raise NumeroPropioError(
                f"Meta permite {MAX_NUMEROS_SIN_VERIFICAR} números a los negocios sin verificar. Verifica tu "
                "negocio en Meta Business Suite para conectar más.",
                code="LIMITE_META_SIN_VERIFICAR",
            )


def _mensaje_conexion_fallida(exc) -> str:
    """Chatwoot responde 422 con el texto del error en ingles (textos fijos del
    codigo de 4.18, no traducidos): se traducen los conocidos y el resto va
    generico. El texto original queda en el log."""
    texto = exc.mensaje.lower()
    if "already exists" in texto:
        return (
            "Este número ya está conectado a CliniQ o a otra plataforma de WhatsApp. "
            "Escríbenos para ayudarte a conectarlo."
        )
    if "multiple phone numbers" in texto or "no matching phone number" in texto:
        return (
            "Meta no indicó cuál de los números de tu cuenta de WhatsApp Business conectar. "
            "Escríbenos para ayudarte."
        )
    return "Meta no pudo completar la conexión. Intenta de nuevo en unos minutos; si se repite, escríbenos."


def _registrar_numero(clinica, conexion, inbox_id, *, waba_id, phone_number_id="", business_id="", datos=None):
    """Crea el NumeroWhatsapp de un inbox que ya existe en Lyvio. El primer
    numero queda por defecto. Si Chatwoot marco el inbox para reautorizar
    (token o webhooks fallidos al conectar), el numero nace bloqueado."""
    datos = datos or {}
    try:
        with transaction.atomic():
            conexion = ConexionWhatsappPropio.objects.select_for_update().get(pk=conexion.pk)
            numero = NumeroWhatsapp.objects.create(
                conexion=conexion,
                lyvio_inbox_id=inbox_id,
                waba_id=waba_id,
                phone_number_id=phone_number_id or datos.get("phone_number_id", ""),
                business_id=business_id,
                numero_visible=datos.get("phone_number", ""),
            )
            if datos.get("reauthorization_required"):
                numero.bloqueo = NumeroWhatsapp.Bloqueo.CONEXION
                numero.estado = NumeroWhatsapp.Estado.ERROR
                numero.ultimo_error = MENSAJE_REAUTORIZAR
                numero.save(update_fields=["bloqueo", "estado", "ultimo_error", "updated_at"])
            if conexion.numero_por_defecto_id is None:
                conexion.numero_por_defecto = numero
                conexion.save(update_fields=["numero_por_defecto", "updated_at"])
    except IntegrityError as exc:
        # El inbox ya existe en Lyvio: no se borra (desconectaria el numero en Meta).
        logger.error(
            "Inbox %s de Lyvio creado para la clínica %s pero no se pudo registrar: %s", inbox_id, clinica.id, exc,
        )
        raise NumeroPropioError(
            "El número se conectó pero no pudimos registrarlo. Contacta a soporte.", code="REGISTRO_FALLIDO",
        ) from exc
    return numero


def reconectar_numero(
    clinica,
    numero_id,
    *,
    evento: str,
    code: str,
    waba_id: str,
    phone_number_id: str = "",
    business_id: str = "",
) -> NumeroWhatsapp:
    """Reconecta un numero que Meta desconecto (14 dias sin abrir la app, cambio
    de telefono) o que Chatwoot marco para reautorizar: Embedded Signup nuevo
    sobre el mismo inbox de Lyvio. Un signup sin inbox_id fallaria con
    "Channel already exists"."""
    _exigir_addon(clinica)
    numero = NumeroWhatsapp.objects.filter(pk=numero_id, conexion__clinica=clinica).first()
    if numero is None:
        raise NumeroPropioError("Ese número no pertenece a esta clínica.", code="NUMERO_INVALIDO")
    if evento != EVENTO_COEXISTENCE:
        raise NumeroPropioError(
            "Meta no habilitó la coexistencia para este número. Tu WhatsApp actual no ha sido modificado.",
            code="SIN_COEXISTENCE",
        )
    if not code or not waba_id:
        raise NumeroPropioError("Meta no devolvió los datos de la conexión. Intenta de nuevo.", code="DATOS_INCOMPLETOS")
    if phone_number_id and numero.phone_number_id and phone_number_id != numero.phone_number_id:
        raise NumeroPropioError(
            "Elegiste un número distinto al que quieres reconectar. Vuelve a intentarlo con "
            f"{numero.numero_visible or 'el mismo número'}.",
            code="OTRO_NUMERO",
        )

    try:
        lyvio.autorizar_whatsapp(
            code=code, waba_id=waba_id, phone_number_id=phone_number_id, business_id=business_id,
            inbox_id=numero.lyvio_inbox_id,
        )
    except lyvio.LyvioError as exc:
        logger.warning("Lyvio no reconectó el inbox %s (clínica %s): %s", numero.lyvio_inbox_id, clinica.id, exc.mensaje)
        texto = exc.mensaje.lower()
        mensaje = (
            "Meta conectó un número distinto al de este registro. Vuelve a intentarlo eligiendo el mismo número."
            if "phone number" in texto or "mismatch" in texto
            else "Meta no pudo completar la reconexión. Intenta de nuevo en unos minutos; si se repite, escríbenos."
        )
        raise NumeroPropioError(mensaje, code="LYVIO_ERROR") from exc
    except requests.RequestException as exc:
        logger.exception("Lyvio no respondió al reconectar el inbox %s", numero.lyvio_inbox_id)
        raise NumeroPropioError(
            "No pudimos comunicarnos con el servicio de WhatsApp. Intenta de nuevo en unos minutos.",
            code="LYVIO_NO_RESPONDE",
        ) from exc

    numero.waba_id = waba_id
    numero.phone_number_id = phone_number_id or numero.phone_number_id
    numero.business_id = business_id or numero.business_id
    numero.save(update_fields=["waba_id", "phone_number_id", "business_id", "updated_at"])
    # Sin revisar la salud: justo despues de un signup en Coexistence Meta puede
    # reportar datos viejos por unos minutos (Chatwoot tampoco la revisa). Si el
    # problema sigue, el proximo envio o chequeo lo vuelve a bloquear.
    _desbloquear(numero, NumeroWhatsapp.Bloqueo.CONEXION)
    numero.refresh_from_db()
    return numero


MENSAJE_SIGUE_CONECTADO = (
    "El número sigue conectado a CliniQ en Meta. Primero desconéctalo desde WhatsApp Business en el teléfono "
    "de la clínica (Configuración → Cuenta → Plataforma empresarial / Business Platform → Desconectar) y "
    "vuelve a intentarlo en unos minutos."
)


def _sigue_conectado(numero: NumeroWhatsapp) -> bool:
    """Meta todavia reporta el numero conectado a la API y en la app (Coexistence).
    Si Lyvio responde error, Meta ya no lo reconoce: cuenta como desconectado.
    Sin respuesta de Lyvio no se sabe: se corta para no arriesgar el telefono."""
    try:
        data = lyvio.salud(numero.lyvio_inbox_id)
    except lyvio.LyvioError:
        return False
    except requests.RequestException as exc:
        raise _error_lyvio(exc) from exc
    return str(data.get("status") or "").upper() == "CONNECTED" and data.get("is_on_biz_app") is True


def dar_de_baja(clinica, numero_id, *, forzar=False) -> dict:
    """Saca un numero de CliniQ: borra su inbox en Lyvio y su registro (con sus
    plantillas y contactos; los envios quedan en el historial sin numero).

    Orden seguro: la clinica primero lo desconecta desde la app de WhatsApp
    Business. Borrar el inbox hace que Chatwoot llame `/deregister` en Meta, y
    con el numero aun conectado no sabemos que le pasa a la app del telefono:
    por eso, si Meta lo sigue viendo conectado, se frena salvo `forzar`
    (solo soporte). No exige el addon: una clinica sin el addon tambien puede
    irse. Las sedes que enviaban desde el numero vuelven al numero por defecto."""
    numero = NumeroWhatsapp.objects.filter(pk=numero_id, conexion__clinica=clinica).first()
    if numero is None:
        raise NumeroPropioError("Ese número no pertenece a esta clínica.", code="NUMERO_INVALIDO")
    if not forzar and _sigue_conectado(numero):
        raise NumeroPropioError(MENSAJE_SIGUE_CONECTADO, code="NUMERO_SIGUE_CONECTADO")

    try:
        lyvio.borrar_inbox(numero.lyvio_inbox_id)
    except lyvio.LyvioError as exc:
        if exc.status != 404:  # 404: ya no existe en Lyvio, se sigue con CliniQ
            raise _error_lyvio(exc) from exc
    except requests.RequestException as exc:
        raise _error_lyvio(exc) from exc

    datos = {"numero": numero.numero_visible, "lyvio_inbox_id": numero.lyvio_inbox_id, "forzado": forzar}
    Tipo = AsignacionWhatsappSede.Tipo
    with transaction.atomic():
        conexion = ConexionWhatsappPropio.objects.select_for_update().get(pk=numero.conexion_id)
        AsignacionWhatsappSede.objects.filter(conexion=conexion, numero=numero).update(
            tipo=Tipo.POR_DEFECTO, numero=None,
        )
        if conexion.numero_por_defecto_id == numero.pk:
            otros = conexion.numeros.exclude(pk=numero.pk)
            conexion.numero_por_defecto = (
                otros.filter(estado=NumeroWhatsapp.Estado.ACTIVO).first() or otros.first()
            )
            conexion.save(update_fields=["numero_por_defecto", "updated_at"])
        numero.delete()
    return datos


def registrar_inbox_existente(clinica, inbox_id) -> NumeroWhatsapp:
    """Soporte: registra para la clinica un inbox que ya existe en la cuenta de
    Lyvio de CliniQ, p. ej. si la conexion termino en Lyvio pero CliniQ no
    alcanzo a guardarla (timeout). No llama a Meta. El token de Lyvio solo ve
    su propia cuenta, asi que no se puede tomar un inbox de otra cuenta."""
    _exigir_addon(clinica)
    inbox_id = str(inbox_id or "").strip()
    if not inbox_id.isdigit():
        raise NumeroPropioError("Indica el número del inbox de Lyvio.", code="INBOX_INVALIDO")
    if NumeroWhatsapp.objects.filter(lyvio_inbox_id=inbox_id).exists():
        raise NumeroPropioError("Ese inbox ya está registrado en CliniQ.", code="INBOX_YA_REGISTRADO")
    conexion = _conexion(clinica)
    _verificar_limite(clinica, conexion)

    try:
        datos = lyvio.datos_inbox(inbox_id)
    except lyvio.LyvioError as exc:
        if exc.status == 404:
            raise NumeroPropioError(
                "Ese inbox no existe en la cuenta de CliniQ en Lyvio.", code="INBOX_NO_EXISTE",
            ) from exc
        raise _error_lyvio(exc) from exc
    except requests.RequestException as exc:
        raise _error_lyvio(exc) from exc
    if datos["channel_type"] != "Channel::Whatsapp" or not datos["waba_id"]:
        raise NumeroPropioError("Ese inbox no es un número de WhatsApp Cloud.", code="INBOX_NO_WHATSAPP")
    return _registrar_numero(clinica, conexion, inbox_id, waba_id=datos["waba_id"], datos=datos)


# ---------------------------------------------------------------------------
# Plantillas y salud (por ahora, operacion manual del superadmin en la consola)
# ---------------------------------------------------------------------------

# Meta: "Content in This Language Already Exists" -> la plantilla ya existia.
_META_DUPLICADA = (100, 2388024)
_ESTADOS_MALOS = {
    PlantillaWhatsappNumero.Estado.REJECTED,
    PlantillaWhatsappNumero.Estado.PAUSED,
    PlantillaWhatsappNumero.Estado.DISABLED,
}

_PDF_EJEMPLO_PATH = "whatsapp_plantillas/ejemplo-cliniq.pdf"
_PDF_EJEMPLO = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R"
    b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
    b"4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 72 770 Td (Documento CliniQ) Tj ET\nendstream endobj\n"
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)


def _pdf_ejemplo_url() -> str:
    """PDF de ejemplo en URL publica para los encabezados de documento (Lyvio lo
    descarga y lo sube a Meta)."""
    if settings.LYVIO_PLANTILLA_PDF_EJEMPLO_URL:
        return settings.LYVIO_PLANTILLA_PDF_EJEMPLO_URL
    from apps.core.storage import get_public_url, upload_public_file

    upload_public_file(_PDF_EJEMPLO, _PDF_EJEMPLO_PATH, content_type="application/pdf")
    return get_public_url(_PDF_EJEMPLO_PATH)


def _bloquear(numero_id, bloqueo, mensaje, *, hasta=None) -> None:
    NumeroWhatsapp.objects.filter(pk=numero_id).update(
        bloqueo=bloqueo, bloqueado_hasta=hasta, estado=NumeroWhatsapp.Estado.ERROR, ultimo_error=mensaje,
        updated_at=timezone.now(),
    )


def _desbloquear(numero: NumeroWhatsapp, bloqueo) -> None:
    """Quita el bloqueo solo si es de ese tipo (la salud no levanta un bloqueo
    de pago) y deja que las plantillas decidan el estado."""
    NumeroWhatsapp.objects.filter(pk=numero.pk, bloqueo=bloqueo).update(
        bloqueo=NumeroWhatsapp.Bloqueo.NINGUNO, bloqueado_hasta=None, updated_at=timezone.now(),
    )
    _recalcular_estado(numero)


def _levantar_pausas_vencidas(conexion) -> bool:
    """El bloqueo por limite diario de Meta se levanta solo cuando vence. Se
    revisa al leer (estado y eleccion de numero), sin tareas periodicas.
    Devuelve si levanto alguno."""
    vencidos = list(conexion.numeros.filter(
        bloqueo=NumeroWhatsapp.Bloqueo.LIMITE, bloqueado_hasta__lte=timezone.now(),
    ))
    for numero in vencidos:
        _desbloquear(numero, NumeroWhatsapp.Bloqueo.LIMITE)
    return bool(vencidos)


def _guardar_limite(numero: NumeroWhatsapp, salud: dict) -> None:
    tier = str((salud or {}).get("messaging_limit_tier") or "").upper()[:30]
    if tier and tier != numero.limite_mensajes:
        numero.limite_mensajes = tier
        numero.save(update_fields=["limite_mensajes", "updated_at"])


def _refrescar_limite(numero: NumeroWhatsapp) -> None:
    """Lee solo el limite diario de Meta, sin tocar el bloqueo. Es informativo:
    si Lyvio falla se queda el valor anterior."""
    try:
        _guardar_limite(numero, lyvio.salud(numero.lyvio_inbox_id))
    except Exception:  # noqa: BLE001 - lectura informativa, nunca debe cortar el flujo
        logger.warning("No se pudo leer el límite de mensajes del inbox %s", numero.lyvio_inbox_id)


def _recalcular_estado(numero: NumeroWhatsapp) -> None:
    """D5: activo solo con todas las plantillas vigentes aprobadas. Una
    rechazada, pausada o deshabilitada deja el numero en error. Un bloqueo
    (pago o conexion) manda sobre las plantillas: solo lo quita _desbloquear."""
    numero.refresh_from_db(fields=["bloqueo", "ultimo_error"])
    if numero.bloqueo:
        numero.estado = NumeroWhatsapp.Estado.ERROR
        numero.save(update_fields=["estado", "updated_at"])
        return

    registros = {(p.nombre, p.idioma): p for p in numero.plantillas.all()}
    estados = {}
    for definicion in catalogo_whatsapp.vigentes():
        registro = registros.get((definicion.nombre, definicion.idioma))
        estados[definicion.nombre] = registro.estado if registro else None

    malas = [f"{nombre} ({e.lower()})" for nombre, e in estados.items() if e in _ESTADOS_MALOS]
    if malas:
        numero.estado = NumeroWhatsapp.Estado.ERROR
        numero.ultimo_error = "Plantillas no disponibles en Meta: " + ", ".join(malas)
    elif all(e == PlantillaWhatsappNumero.Estado.APPROVED for e in estados.values()):
        numero.estado = NumeroWhatsapp.Estado.ACTIVO
        numero.ultimo_error = ""
    elif registros:
        numero.estado = NumeroWhatsapp.Estado.PLANTILLAS_PENDIENTES
        numero.ultimo_error = ""
    else:
        numero.estado = NumeroWhatsapp.Estado.CONECTADO
        numero.ultimo_error = ""
    numero.save(update_fields=["estado", "ultimo_error", "updated_at"])


def _error_lyvio(exc):
    if isinstance(exc, lyvio.LyvioError):
        return NumeroPropioError(exc.mensaje, code="LYVIO_ERROR")
    return NumeroPropioError("El servicio de WhatsApp no respondió. Reintenta.", code="LYVIO_NO_RESPONDE")


def crear_plantillas(numero: NumeroWhatsapp) -> list:
    """Crea en la WABA del numero las plantillas vigentes que falten. Los errores
    son por plantilla: una que falla no revierte las demas. Devuelve el
    resultado de cada una para mostrarlo en la consola."""
    resultados = []
    pdf_url = None
    for definicion in catalogo_whatsapp.vigentes():
        registro = numero.plantillas.filter(nombre=definicion.nombre, idioma=definicion.idioma).first()
        if registro and registro.estado in (PlantillaWhatsappNumero.Estado.PENDING, PlantillaWhatsappNumero.Estado.APPROVED):
            resultados.append({"nombre": definicion.nombre, "resultado": "ya_creada", "estado": registro.estado, "error": ""})
            continue
        if registro and registro.estado in _ESTADOS_MALOS:
            # Meta no deja volver a enviar el mismo nombre: responderia "ya existe"
            # y la plantilla pareceria pendiente. Hace falta una version nueva
            # en el catalogo (p. ej. _v2).
            resultados.append({
                "nombre": definicion.nombre, "resultado": "requiere_version", "estado": registro.estado,
                "error": "Meta no permite reenviar esta plantilla: crea una versión nueva en el catálogo (_v2).",
            })
            continue
        if definicion.encabezado_pdf and pdf_url is None:
            pdf_url = _pdf_ejemplo_url()

        registro = registro or PlantillaWhatsappNumero(
            numero=numero, tipo=definicion.tipo, nombre=definicion.nombre, idioma=definicion.idioma,
        )
        try:
            creada = lyvio.crear_plantilla(numero.lyvio_inbox_id, definicion.payload_creacion(pdf_url or "")) or {}
        except lyvio.LyvioError as exc:
            if (exc.meta.get("code"), exc.meta.get("subcode")) == _META_DUPLICADA:
                registro.estado = PlantillaWhatsappNumero.Estado.PENDING
                registro.ultimo_error = ""
                resultado = "ya_existia"
            else:
                registro.estado = PlantillaWhatsappNumero.Estado.ERROR
                registro.ultimo_error = exc.mensaje
                resultado = "reintentar" if exc.status == 502 else "error"
        except requests.RequestException:
            logger.exception("Lyvio no respondió al crear %s en el inbox %s", definicion.nombre, numero.lyvio_inbox_id)
            registro.estado = PlantillaWhatsappNumero.Estado.ERROR
            registro.ultimo_error = "El servicio de WhatsApp no respondió. Reintenta."
            resultado = "reintentar"
        else:
            estado_meta = str(creada.get("status") or "").upper()
            registro.estado = (
                estado_meta if estado_meta in PlantillaWhatsappNumero.Estado.values
                else PlantillaWhatsappNumero.Estado.PENDING
            )
            registro.categoria = str(creada.get("category") or "")
            registro.ultimo_error = ""
            resultado = "creada"
        registro.save()
        resultados.append({
            "nombre": definicion.nombre, "resultado": resultado, "estado": registro.estado, "error": registro.ultimo_error,
        })

    _recalcular_estado(numero)
    return resultados


def actualizar_plantillas(numero: NumeroWhatsapp) -> None:
    """Lee el cache de plantillas de Lyvio (lo dejo al dia la sincronizacion
    anterior; crear una plantilla ya encola una) y pide una sincronizacion
    nueva para la proxima vez. Asi no se espera al job de Lyvio dentro del
    request. Como el estado sale del cache de Lyvio, una plantilla APPROVED ya
    se puede enviar."""
    try:
        en_meta = lyvio.listar_plantillas(numero.lyvio_inbox_id)
    except (lyvio.LyvioError, requests.RequestException) as exc:
        raise _error_lyvio(exc) from exc
    try:
        lyvio.sincronizar_plantillas(numero.lyvio_inbox_id)
    except (lyvio.LyvioError, requests.RequestException):
        logger.warning("No se pudo pedir la sincronización de plantillas del inbox %s", numero.lyvio_inbox_id)

    por_clave = {(t.get("name"), t.get("language")): t for t in en_meta if isinstance(t, dict)}
    for definicion in catalogo_whatsapp.vigentes():
        remota = por_clave.get((definicion.nombre, definicion.idioma))
        if remota is None:
            continue
        estado_meta = str(remota.get("status") or "").upper()
        PlantillaWhatsappNumero.objects.update_or_create(
            numero=numero, nombre=definicion.nombre, idioma=definicion.idioma,
            defaults={
                "tipo": definicion.tipo,
                "estado": estado_meta if estado_meta in PlantillaWhatsappNumero.Estado.values
                else PlantillaWhatsappNumero.Estado.PENDING,
                "categoria": str(remota.get("category") or ""),
                "ultimo_error": str(remota.get("rejected_reason") or "")
                if estado_meta == PlantillaWhatsappNumero.Estado.REJECTED else "",
            },
        )
    numero.ultimo_chequeo_en = timezone.now()
    numero.save(update_fields=["ultimo_chequeo_en", "updated_at"])
    _refrescar_limite(numero)
    _recalcular_estado(numero)


def revisar_salud(numero: NumeroWhatsapp) -> dict:
    """Si Meta no reporta el numero conectado y en la app de WhatsApp Business
    (Coexistence), o Chatwoot pide reautorizarlo, queda bloqueado y sus envios
    vuelven al compartido. Si esta sano se levanta el bloqueo de conexion (no
    el de pago: la salud no lo muestra) y el estado lo deciden las plantillas.
    De paso completa el numero visible si faltaba."""
    try:
        data = lyvio.salud(numero.lyvio_inbox_id)
    except (lyvio.LyvioError, requests.RequestException) as exc:
        raise _error_lyvio(exc) from exc
    try:
        inbox = lyvio.datos_inbox(numero.lyvio_inbox_id)
    except (lyvio.LyvioError, requests.RequestException):
        logger.warning("No se pudo leer el inbox %s de Lyvio al revisar la salud", numero.lyvio_inbox_id)
        inbox = {}

    numero.ultimo_chequeo_en = timezone.now()
    numero.numero_visible = (
        numero.numero_visible or inbox.get("phone_number") or str(data.get("display_phone_number") or "")
    )
    numero.save(update_fields=["ultimo_chequeo_en", "numero_visible", "updated_at"])
    _guardar_limite(numero, data)

    estado_meta = str(data.get("status") or "").upper()
    if inbox.get("reauthorization_required"):
        problema = MENSAJE_REAUTORIZAR
    elif estado_meta != "CONNECTED":
        problema = f"Meta reporta el número como {estado_meta or 'desconocido'}."
    elif data.get("is_on_biz_app") is not True:
        problema = MENSAJE_FUERA_DE_LA_APP
    else:
        _desbloquear(numero, NumeroWhatsapp.Bloqueo.CONEXION)
        return data
    _bloquear(numero.pk, NumeroWhatsapp.Bloqueo.CONEXION, problema)
    return data


def detalle_admin(clinica) -> dict:
    """Estado para /console/clinicas/[id]: lo de la clinica mas los datos
    tecnicos y las plantillas de cada numero."""
    data = estado(clinica)
    numeros = {
        str(n.id): n
        for n in NumeroWhatsapp.objects.filter(conexion__clinica=clinica).prefetch_related("plantillas")
    }
    for item in data["numeros"]:
        numero = numeros[item["id"]]
        item["lyvio_inbox_id"] = numero.lyvio_inbox_id
        item["waba_id"] = numero.waba_id
        item["ultimo_chequeo_en"] = numero.ultimo_chequeo_en.isoformat() if numero.ultimo_chequeo_en else None
        item["plantillas"] = [
            {
                "tipo": p.tipo, "nombre": p.nombre, "idioma": p.idioma, "estado": p.estado,
                "estado_display": p.get_estado_display(), "categoria": p.categoria, "ultimo_error": p.ultimo_error,
            }
            for p in numero.plantillas.all()
        ]
    data["catalogo"] = [
        {"tipo": p.tipo, "nombre": p.nombre, "categoria": p.categoria} for p in catalogo_whatsapp.vigentes()
    ]
    return data


# ---------------------------------------------------------------------------
# Envio
# ---------------------------------------------------------------------------

Tipo = catalogo_whatsapp.Tipo


def _sede_del_envio(clinica, *, sede=None, cita=None, paciente=None):
    """D11: sede del objeto -> sede de la cita ligada -> sede de la ultima cita
    del paciente en la clinica."""
    if sede is not None:
        return sede
    if cita is not None and cita.sede_id:
        return cita.sede
    if paciente is not None:
        from apps.agenda.models import Cita

        ultima = (
            Cita.objects.filter(paciente=paciente, sede__clinica=clinica)
            .select_related("sede")
            .order_by("-fecha_inicio")
            .first()
        )
        if ultima is not None:
            return ultima.sede
    return None


def elegir_numero(clinica, *, tipo=None, sede=None, cita=None, paciente=None):
    """Numero propio por el que sale el envio, o (None, motivo) si sale por el
    compartido. Orden: la asignacion de la sede del envio -> numero por defecto
    -> numero de CliniQ. Solo usa numeros `activo` con la plantilla del tipo
    aprobada y nunca un numero de otra clinica."""
    if tipo is None:
        return None, ""
    if tipo == Tipo.CHECKIN_OTP:
        return None, "otp_siempre_compartido"
    plantilla = catalogo_whatsapp.plantilla_de(tipo)
    if plantilla is None:
        return None, "tipo_sin_plantilla"
    if not clinica.whatsapp_numero_propio_habilitado:
        return None, "sin_addon"
    if paciente is not None and not lyvio.telefono_valido(lyvio.telefono_e164(paciente.telefono)):
        # Sin un E.164 valido Chatwoot no crea el contacto: no se deja basura en
        # Lyvio y el compartido responde como siempre ante un telefono malo.
        return None, "telefono_invalido"
    conexion =ConexionWhatsappPropio.objects.filter(clinica=clinica).select_related("numero_por_defecto").first()
    if conexion is None or not conexion.numeros.exists():
        return None, "sin_numero"
    if _levantar_pausas_vencidas(conexion):
        conexion.refresh_from_db()

    Asignacion = AsignacionWhatsappSede
    sede_envio = _sede_del_envio(clinica, sede=sede, cita=cita, paciente=paciente)
    asignacion = (
        Asignacion.objects.filter(sede=sede_envio).select_related("numero").first() if sede_envio else None
    )
    if asignacion is not None and asignacion.tipo == Asignacion.Tipo.CLINIQ:
        return None, "sede_usa_cliniq"

    activo = NumeroWhatsapp.Estado.ACTIVO
    numero = None
    if asignacion is not None and asignacion.tipo == Asignacion.Tipo.NUMERO and asignacion.numero:
        numero = asignacion.numero if asignacion.numero.estado == activo else None
    if numero is None:
        por_defecto = conexion.numero_por_defecto
        numero = por_defecto if por_defecto is not None and por_defecto.estado == activo else None
    if numero is None:
        return None, "numero_no_activo"

    aprobada = numero.plantillas.filter(
        nombre=plantilla.nombre, idioma=plantilla.idioma, estado=PlantillaWhatsappNumero.Estado.APPROVED,
    ).exists()
    if not aprobada:
        return None, "plantilla_no_aprobada"
    return numero, "ok"


_DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def fecha_legible(valor) -> str:
    """'lunes 5 de octubre a las 10:00 a. m.' en la zona horaria local."""
    from django.utils.dateparse import parse_datetime

    fecha = parse_datetime(valor) if isinstance(valor, str) else valor
    if fecha is None:
        return str(valor or "")
    if timezone.is_aware(fecha):
        fecha = timezone.localtime(fecha)
    hora = fecha.hour % 12 or 12
    sufijo = "a. m." if fecha.hour < 12 else "p. m."
    return f"{_DIAS[fecha.weekday()]} {fecha.day} de {_MESES[fecha.month - 1]} a las {hora}:{fecha.minute:02d} {sufijo}"


def _contexto(tipo, paciente, clinica, datos) -> dict:
    """Variables de la plantilla a partir de los datos que ya reciben los sitios
    de envio para la ruta compartida."""
    contexto = {"paciente_nombre": (paciente.nombres or "").strip(), "clinica_nombre": clinica.nombre}
    if tipo == Tipo.RECORDATORIO_CITA:
        payload = datos.get("payload") or {}
        contexto.update({
            "servicio_nombre": payload.get("servicio_nombre"),
            "sede_nombre": payload.get("sede_nombre"),
            "sede_telefono": payload.get("sede_telefono"),
            "fecha_y_hora": fecha_legible(payload.get("fecha_inicio")),
        })
    elif tipo == Tipo.FIRMA_DOCUMENTO:
        contexto.update({"documento_tipo": datos.get("documento_tipo"), "link": datos.get("link")})
    return contexto


def _datos_para_respaldo(tipo, datos) -> dict:
    """Lo que hace falta guardar para reenviar por el compartido (JSON)."""
    import json

    from django.core.serializers.json import DjangoJSONEncoder

    guardar = {k: v for k, v in datos.items() if k != "pdf_bytes"}
    return json.loads(json.dumps(guardar, cls=DjangoJSONEncoder))


def _conversacion(numero, paciente, telefono, *, refrescar=False) -> str:
    """Contacto y conversacion del paciente en el inbox del numero, cacheados en
    ContactoLyvio. La conversacion siempre se busca dentro de ese inbox. Si el
    telefono del paciente cambio, el cache no sirve: la conversacion vieja es
    del numero anterior."""
    from apps.notificaciones.models import ContactoLyvio

    cache = ContactoLyvio.objects.filter(numero=numero, paciente=paciente).first()
    vigente = cache is not None and cache.telefono == telefono and not refrescar
    if vigente and cache.conversation_id:
        return cache.conversation_id

    contact_id = cache.contact_id if vigente else ""
    if not contact_id:
        try:
            contact_id = lyvio.crear_contacto(numero.lyvio_inbox_id, paciente.nombre_completo, telefono)
        except lyvio.LyvioError as exc:
            if exc.status != 422:
                raise
            contact_id = lyvio.buscar_contacto(telefono)
            if not contact_id:
                raise
    conversation_id = lyvio.conversacion_en_inbox(contact_id, numero.lyvio_inbox_id)
    if not conversation_id:
        conversation_id = lyvio.crear_conversacion(numero.lyvio_inbox_id, contact_id)
    if not contact_id or not conversation_id:
        raise lyvio.LyvioError("Lyvio no devolvió el contacto o la conversación.")

    ContactoLyvio.objects.update_or_create(
        numero=numero, paciente=paciente,
        defaults={"telefono": telefono, "contact_id": contact_id, "conversation_id": conversation_id},
    )
    return conversation_id


def enviar_por_numero_propio(ruta, *, tipo, paciente, datos):
    """Envio por el inbox del numero propio. La fila de EnvioWhatsApp se crea
    antes de llamar a Lyvio (estado `incierto`):

    - error de Lyvio o sin conexion antes del mensaje -> `fallido` y respaldo por
      el compartido en el mismo request (descuenta cupo, D10);
    - timeout al crear el mensaje -> queda `incierto`: no se reintenta ni se
      reenvia, podria duplicarse;
    - OK -> `enviado` con el message_id; el fallo real de Meta llega por webhook.
    """
    from apps.notificaciones.models import EnvioWhatsApp

    plantilla = catalogo_whatsapp.plantilla_de(tipo)
    numero = ruta.numero
    clinica = ruta.clinica
    if plantilla.encabezado_pdf and not datos.get("pdf_url"):
        from apps.notificaciones.services import subir_pdf_whatsapp

        datos = {**datos, "pdf_url": subir_pdf_whatsapp(datos["pdf_bytes"], datos["nombre_archivo_pdf"])}

    contexto = _contexto(tipo, paciente, clinica, datos)
    processed = {"body": {str(i): v for i, v in enumerate(plantilla.valores(contexto), start=1)}}
    if plantilla.encabezado_pdf:
        processed["header"] = {
            "media_url": datos["pdf_url"], "media_type": "document", "media_name": datos.get("nombre_archivo_pdf", ""),
        }
    template_params = {
        "name": plantilla.nombre, "language": plantilla.idioma, "category": plantilla.categoria,
        "processed_params": processed,
    }

    envio = EnvioWhatsApp.objects.create(
        clinica=clinica, paciente=paciente, tipo=tipo, ruta=EnvioWhatsApp.Ruta.PROPIO, numero=numero,
        motivo_ruta=ruta.motivo or "ok", estado=EnvioWhatsApp.Estado.INCIERTO,
        datos=_datos_para_respaldo(tipo, datos),
    )

    telefono = lyvio.telefono_e164(paciente.telefono)
    try:
        conversation_id = _conversacion(numero, paciente, telefono)
    except (lyvio.LyvioError, requests.RequestException) as exc:
        return _fallo_y_respaldo(envio, exc)

    contenido = plantilla.renderizar(contexto)
    for intento in range(2):
        # La conversacion queda guardada ANTES del POST: si Meta rechaza muy
        # rapido, el webhook puede llegar antes que el message_id y encuentra el
        # envio por conversacion (ver _envio_del_webhook).
        envio.lyvio_conversation_id = conversation_id
        envio.save(update_fields=["lyvio_conversation_id", "updated_at"])
        try:
            mensaje = lyvio.enviar_mensaje(conversation_id, contenido, template_params)
            break
        except lyvio.LyvioError as exc:
            if exc.status == 404 and intento == 0:
                # la conversacion cacheada ya no existe en Lyvio
                try:
                    conversation_id = _conversacion(numero, paciente, telefono, refrescar=True)
                except (lyvio.LyvioError, requests.RequestException) as exc_conv:
                    return _fallo_y_respaldo(envio, exc_conv)
                continue
            return _fallo_y_respaldo(envio, exc)
        except requests.ConnectionError as exc:
            # incluye ConnectTimeout: el pedido no llego a Lyvio
            return _fallo_y_respaldo(envio, exc)
        except requests.Timeout:
            logger.warning("Timeout enviando por número propio: envío %s queda incierto", envio.id)
            EnvioWhatsApp.objects.filter(pk=envio.pk).update(
                error_externo="Lyvio no respondió a tiempo; no se sabe si el mensaje salió.",
                updated_at=timezone.now(),
            )
            return {"envio_id": str(envio.id), "estado": EnvioWhatsApp.Estado.INCIERTO}

    message_id = str(mensaje.get("id") or "")
    # Primero el message_id y despues el estado: si el aviso de fallo llega en
    # medio, encuentra el envio por message_id o, antes de eso, por
    # conversacion (sigue `incierto`). Al reves quedaria un instante `enviado`
    # sin message_id, y ese aviso se perderia.
    EnvioWhatsApp.objects.filter(pk=envio.pk, lyvio_message_id="").update(lyvio_message_id=message_id)
    # Solo pasa a `enviado` si el webhook no lo marco `fallido` mientras tanto.
    EnvioWhatsApp.objects.filter(pk=envio.pk, estado=EnvioWhatsApp.Estado.INCIERTO).update(
        estado=EnvioWhatsApp.Estado.ENVIADO, updated_at=timezone.now(),
    )
    envio.refresh_from_db(fields=["estado", "lyvio_message_id"])
    return {"envio_id": str(envio.id), "estado": envio.estado}


def _registrar_fallida(envio, motivo: str) -> None:
    """El envio no le llego al paciente: queda en "Envios que no salieron" para
    que la clinica lo vea."""
    from apps.notificaciones.models import NotificacionFallida

    NotificacionFallida.objects.create(
        clinica=envio.clinica,
        paciente=envio.paciente,
        tipo_notificacion=envio.tipo,
        telefono=getattr(envio.paciente, "telefono", "") or "",
        motivo=motivo[:2000],
    )


def _registrar_sin_respaldo(envio, error, exc):
    """El envio fallo por el numero de la clinica y tampoco salio por el compartido."""
    logger.warning("No se pudo reenviar por el compartido el envío %s: %s", envio.id, exc)
    _registrar_fallida(envio, f"Falló por el número de la clínica ({error}) y no se pudo reenviar: {exc}")


def _fallo_y_respaldo(envio, exc):
    """Fallo inmediato por el numero propio: se reenvia por el compartido en el
    mismo request. Si el respaldo tambien falla, se registra y se levanta el
    error del respaldo (WhatsAppNoDisponibleError, ValueError o
    requests.RequestException) para que la vista responda como con el
    compartido."""
    from apps.notificaciones.models import EnvioWhatsApp
    from apps.notificaciones.services import WhatsAppNoDisponibleError

    envio.estado = EnvioWhatsApp.Estado.FALLIDO
    envio.error_externo = getattr(exc, "mensaje", None) or str(exc)
    envio.save(update_fields=["estado", "error_externo", "updated_at"])
    logger.warning("Envío por número propio %s falló (%s); sale por el compartido", envio.id, envio.error_externo)
    try:
        return reenviar_por_compartido(envio)
    except (WhatsAppNoDisponibleError, ValueError, requests.RequestException) as exc_respaldo:
        _registrar_sin_respaldo(envio, envio.error_externo, exc_respaldo)
        raise


def reenviar_por_compartido(envio):
    """Respaldo de un envio propio fallido por el numero compartido, una sola vez
    (respaldo_de es unico). Descuenta cupo (D10); sin cupo levanta
    WhatsAppNoDisponibleError y el envio queda fallido."""
    from apps.notificaciones.models import EnvioWhatsApp
    from apps.notificaciones.services import enviar_por_compartido, verificar_disponibilidad_whatsapp

    if EnvioWhatsApp.objects.filter(respaldo_de=envio).exists():
        return {"envio_id": str(envio.id), "respaldo": "ya_enviado"}
    verificar_disponibilidad_whatsapp(envio.clinica)
    return enviar_por_compartido(
        envio.clinica, tipo=envio.tipo, paciente=envio.paciente, datos=dict(envio.datos),
        motivo="respaldo_por_fallo", respaldo_de=envio,
    )


# ---------------------------------------------------------------------------
# Webhook de Lyvio (cuenta de CliniQ): message_created / message_updated
# ---------------------------------------------------------------------------

# Meta: la WABA de la clinica no tiene metodo de pago valido.
ERROR_SIN_PAGO = "131042"
MENSAJE_SIN_PAGO = (
    "Falta método de pago en Meta. Revisa en Meta Business Suite que la cuenta de WhatsApp tenga un "
    "método de pago vinculado, límite de crédito disponible, zona horaria y moneda configuradas y los "
    "datos fiscales completos. Tras corregirlo, Meta puede tardar hasta 24 h en reactivar los envíos."
)
# Errores de Meta (Cloud API) segun de quien es el problema. Referencia:
# developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
# Un codigo que no esta aqui (o un error sin codigo) sale por el compartido.
#
# Del numero de la clinica: el numero queda bloqueado para que los envios
# siguientes no fallen uno por uno, y este sale por el compartido.
_ERRORES_DEL_NUMERO = {
    ERROR_SIN_PAGO: (NumeroWhatsapp.Bloqueo.PAGO, MENSAJE_SIN_PAGO),
    "131045": (
        NumeroWhatsapp.Bloqueo.CONEXION,
        "Meta reporta un problema con el registro del número (suele pasar cuando se desconecta de WhatsApp "
        "Business). Abre WhatsApp Business en el teléfono de la clínica y pulsa \"Reconectar\".",
    ),
    # Limite diario o de calidad: Meta frena los envios a pacientes nuevos. Se
    # pausa el numero un dia (PAUSA_POR_LIMITE) y vuelve solo.
    "131048": (
        NumeroWhatsapp.Bloqueo.LIMITE,
        "Meta frenó los envíos desde tu número por hoy: llegaste al límite diario de pacientes o varios "
        "pacientes bloquearon o reportaron mensajes recientes. Se reanudan solos en 24 horas; mientras tanto "
        "salen por el número de CliniQ y descuentan del cupo de tu plan.",
    ),
    "131031": (
        NumeroWhatsapp.Bloqueo.CONEXION,
        "Meta bloqueó la cuenta de WhatsApp Business de la clínica. Revisa Meta Business Suite o escríbenos.",
    ),
    "368": (
        NumeroWhatsapp.Bloqueo.CONEXION,
        "Meta restringió temporalmente la cuenta de WhatsApp Business de la clínica por sus políticas. "
        "Revisa Meta Business Suite.",
    ),
}
# De la plantilla de la clinica en Meta: se marca la plantilla (el numero deja
# de estar activo hasta revisarla en la consola) y este envio sale por el
# compartido, que usa sus propias plantillas.
_ERRORES_DE_PLANTILLA = {
    "132001": PlantillaWhatsappNumero.Estado.ERROR,  # no existe o no esta aprobada en ese idioma
    "132015": PlantillaWhatsappNumero.Estado.PAUSED,
    "132016": PlantillaWhatsappNumero.Estado.DISABLED,
}
# Del paciente: el numero de CliniQ tampoco lo entregaria, o pasaria por encima
# de una decision del paciente. Sin respaldo; queda en "Envios que no salieron".
_ERRORES_DEL_PACIENTE = {
    "131026": "El paciente no tiene WhatsApp activo en ese número o no puede recibir mensajes.",
    "131049": "Meta no entregó el mensaje para no saturar al paciente con mensajes de marketing.",
    "130472": "Meta no entregó el mensaje: el paciente participa en una prueba de Meta sobre marketing.",
    "131050": "El paciente pidió no recibir mensajes de marketing de la clínica.",
}

# Ventana para asociar un fallo que llego antes que el message_id (ver
# _envio_del_webhook).
VENTANA_FALLO_TEMPRANO = timedelta(minutes=5)
# Un fallo que Meta reporta tarde (p. ej. el telefono del paciente estuvo
# apagado) ya no se reenvia: el mensaje podria no tener sentido, como el
# recordatorio de una cita que ya paso.
VENTANA_RESPALDO = timedelta(hours=1)


def _error_externo(payload: dict) -> str:
    atributos = payload.get("content_attributes") or {}
    if isinstance(atributos, dict) and atributos.get("external_error"):
        return str(atributos["external_error"])
    return str(payload.get("external_error") or "")


def _estado_del_mensaje(payload: dict) -> str:
    """Chatwoot 4.18 no manda `status` en la raiz del webhook del mensaje
    (Message#webhook_data). Solo aparece en conversation.messages, y solo si
    ese mensaje es el ultimo de la conversacion."""
    if payload.get("status"):
        return str(payload["status"])
    for mensaje in (payload.get("conversation") or {}).get("messages") or []:
        if isinstance(mensaje, dict) and str(mensaje.get("id")) == str(payload.get("id")):
            return str(mensaje.get("status") or "")
    return ""


def _fallo_en_meta(payload: dict) -> bool:
    """Chatwoot llena content_attributes.external_error cuando el mensaje falla
    y lo borra en cualquier otro estado (Messages::StatusUpdateService)."""
    return bool(_error_externo(payload)) or _estado_del_mensaje(payload) == "failed"


def procesar_webhook(payload: dict) -> str:
    """Procesa un evento del webhook de cuenta de Lyvio y devuelve que se hizo
    (para el log y los tests). Nunca levanta por datos desconocidos: Lyvio no
    debe reintentar por un evento que a CliniQ no le importa."""
    evento = payload.get("event")
    if evento == "message_updated":
        return _mensaje_fallido(payload) if _fallo_en_meta(payload) else "ignorado"
    if evento == "message_created" and payload.get("message_type") in ("incoming", 0):
        # Respuesta del paciente: la clinica ya la ve en su telefono. Solo se
        # registra; se usara si hay botones (p. ej. "Confirmar cita").
        inbox = (payload.get("inbox") or {}).get("id") or (payload.get("conversation") or {}).get("inbox_id")
        logger.info("Respuesta de paciente en el inbox %s (mensaje %s)", inbox, payload.get("id"))
        return "respuesta_registrada"
    return "ignorado"


def _envio_del_webhook(message_id: str, payload: dict):
    """Envio propio al que se refiere el aviso. Normalmente por message_id; si
    Meta rechazo tan rapido que el aviso llego antes de que CliniQ guardara el
    message_id, se busca el envio `incierto` sin message_id mas reciente de esa
    conversacion (se guarda antes del POST)."""
    from apps.notificaciones.models import EnvioWhatsApp

    base = EnvioWhatsApp.objects.select_for_update(of=("self",)).filter(ruta=EnvioWhatsApp.Ruta.PROPIO)
    envio = base.filter(lyvio_message_id=message_id).first()
    if envio is not None:
        return envio
    conversation_id = str((payload.get("conversation") or {}).get("id") or payload.get("conversation_id") or "")
    if not conversation_id:
        return None
    envio = (
        base.filter(
            lyvio_conversation_id=conversation_id,
            lyvio_message_id="",
            estado=EnvioWhatsApp.Estado.INCIERTO,
            created_at__gte=timezone.now() - VENTANA_FALLO_TEMPRANO,
        )
        .order_by("-created_at")
        .first()
    )
    if envio is not None:
        envio.lyvio_message_id = message_id
        envio.save(update_fields=["lyvio_message_id", "updated_at"])
    return envio


def _mensaje_fallido(payload: dict) -> str:
    from apps.notificaciones.models import EnvioWhatsApp
    from apps.notificaciones.services import WhatsAppNoDisponibleError

    message_id = str(payload.get("id") or "")
    if not message_id:
        return "ignorado"
    error = _error_externo(payload) or "Meta rechazó el mensaje."
    # "131042: titulo" si vino del webhook de estados de Meta; sin codigo si
    # Meta lo rechazo en el momento del envio.
    codigo = error.split(":", 1)[0].strip()

    # Primero se marca el fallo con la fila bloqueada, y el reenvio (una llamada
    # HTTP a n8n) se hace despues del commit para no retener el bloqueo. Un
    # aviso repetido encuentra el envio ya `fallido` y no reenvia.
    with transaction.atomic():
        envio = _envio_del_webhook(message_id, payload)
        if envio is None:
            logger.info("Webhook de Lyvio: mensaje fallido %s sin envío de CliniQ", message_id)
            return "desconocido"
        if envio.estado == EnvioWhatsApp.Estado.FALLIDO:
            return "ya_procesado"

        envio.estado = EnvioWhatsApp.Estado.FALLIDO
        envio.error_externo = error
        envio.save(update_fields=["estado", "error_externo", "updated_at"])
        if envio.numero_id:
            _marcar_problema_del_numero(envio, codigo, error)

    if codigo in _ERRORES_DEL_PACIENTE:
        _registrar_fallida(envio, f"{_ERRORES_DEL_PACIENTE[codigo]} ({error})")
        return "sin_respaldo_paciente"
    if timezone.now() - envio.created_at > VENTANA_RESPALDO:
        _registrar_fallida(
            envio, f"Meta avisó tarde que el mensaje no se entregó ({error}); ya no se reenvió por el número de CliniQ.",
        )
        return "fallo_tardio"
    try:
        reenviar_por_compartido(envio)
    except (WhatsAppNoDisponibleError, ValueError, requests.RequestException) as exc:
        _registrar_sin_respaldo(envio, error, exc)
        return "respaldo_fallido"
    return "respaldo_enviado"


def _marcar_problema_del_numero(envio, codigo: str, error: str) -> None:
    """Un error de Meta que es del numero o de su plantilla deja de usar el
    numero: si no, cada envio siguiente fallaria y saldria dos veces."""
    if codigo in _ERRORES_DEL_NUMERO:
        bloqueo, mensaje = _ERRORES_DEL_NUMERO[codigo]
        if bloqueo == NumeroWhatsapp.Bloqueo.LIMITE:
            # La pausa vence sola: no debe tapar un bloqueo de pago o conexion,
            # que al vencer quedaria levantado sin que nadie lo corrigiera.
            sin_otro_bloqueo = NumeroWhatsapp.objects.filter(
                pk=envio.numero_id, bloqueo__in=(NumeroWhatsapp.Bloqueo.NINGUNO, NumeroWhatsapp.Bloqueo.LIMITE),
            ).exists()
            if sin_otro_bloqueo:
                _bloquear(envio.numero_id, bloqueo, mensaje, hasta=timezone.now() + PAUSA_POR_LIMITE)
            return
        _bloquear(envio.numero_id, bloqueo, mensaje)
        if bloqueo == NumeroWhatsapp.Bloqueo.PAGO:
            # La clinica vuelve a ver el paso del pago; al confirmarlo se levanta el bloqueo.
            ConexionWhatsappPropio.objects.filter(numeros__pk=envio.numero_id).update(
                pago_meta_configurado=False, updated_at=timezone.now(),
            )
    elif codigo in _ERRORES_DE_PLANTILLA:
        plantilla = catalogo_whatsapp.plantilla_de(envio.tipo)
        if plantilla is None:
            return
        PlantillaWhatsappNumero.objects.filter(
            numero_id=envio.numero_id, nombre=plantilla.nombre, idioma=plantilla.idioma,
        ).update(estado=_ERRORES_DE_PLANTILLA[codigo], ultimo_error=f"Meta la rechazó al enviar: {error}")
        _recalcular_estado(NumeroWhatsapp.objects.get(pk=envio.numero_id))
