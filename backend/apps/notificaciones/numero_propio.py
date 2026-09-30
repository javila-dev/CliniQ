"""Addon de WhatsApp con numero propio (Coexistence via Lyvio).

Reglas de CliniQ encima del cliente de Lyvio (lyvio.py): la clinica conecta
hasta N numeros (segun su plan) por Embedded Signup, uno queda como numero por
defecto y cada sede elige desde cual envia. Plan: docs/plan-whatsapp-numero-propio.md.
"""
import logging
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


def _serializar_numero(numero, por_defecto_id):
    return {
        "id": str(numero.id),
        "numero_visible": numero.numero_visible,
        "estado": numero.estado,
        "estado_display": numero.get_estado_display(),
        "ultimo_error": numero.ultimo_error,
        "es_por_defecto": numero.id == por_defecto_id,
    }


def estado(clinica) -> dict:
    """Todo lo que necesita la pantalla de configuracion de la clinica."""
    conexion = ConexionWhatsappPropio.objects.filter(clinica=clinica).first()
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
    incluidos = clinica.whatsapp_numeros_incluidos
    if conexion.numeros.count() >= incluidos:
        raise NumeroPropioError(
            f"Tu plan incluye {incluidos} {'número' if incluidos == 1 else 'números'} de WhatsApp y ya "
            "están conectados. Escríbenos para agregar otro.",
            code="LIMITE_NUMEROS",
        )

    try:
        inbox = lyvio.autorizar_whatsapp(
            code=code, waba_id=waba_id, phone_number_id=phone_number_id, business_id=business_id,
        )
    except lyvio.LyvioError as exc:
        raise NumeroPropioError(exc.mensaje, code="LYVIO_ERROR") from exc
    except requests.RequestException as exc:
        logger.exception("Lyvio no respondió al conectar el número de la clínica %s", clinica.id)
        raise NumeroPropioError(
            "No pudimos comunicarnos con el servicio de WhatsApp. Intenta de nuevo en unos minutos.",
            code="LYVIO_NO_RESPONDE",
        ) from exc

    inbox_id = str((inbox or {}).get("id") or "")
    if not inbox_id:
        logger.error("Lyvio autorizó sin devolver inbox id (clínica %s): %s", clinica.id, inbox)
        raise NumeroPropioError("El servicio de WhatsApp no devolvió el número conectado.", code="LYVIO_SIN_INBOX")

    try:
        with transaction.atomic():
            conexion = ConexionWhatsappPropio.objects.select_for_update().get(pk=conexion.pk)
            numero = NumeroWhatsapp.objects.create(
                conexion=conexion,
                lyvio_inbox_id=inbox_id,
                waba_id=waba_id,
                phone_number_id=phone_number_id or str(inbox.get("phone_number_id") or ""),
                business_id=business_id,
                numero_visible=str(inbox.get("phone_number") or ""),
            )
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


def _recalcular_estado(numero: NumeroWhatsapp) -> None:
    """D5: activo solo con todas las plantillas vigentes aprobadas. Una
    rechazada, pausada o deshabilitada deja el numero en error."""
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
    _recalcular_estado(numero)


def revisar_salud(numero: NumeroWhatsapp) -> dict:
    """Si Meta no reporta el numero conectado y en la app de WhatsApp Business
    (Coexistence), pasa a error y sus envios vuelven al compartido. Si esta
    sano, el estado lo deciden las plantillas."""
    try:
        data = lyvio.salud(numero.lyvio_inbox_id)
    except (lyvio.LyvioError, requests.RequestException) as exc:
        raise _error_lyvio(exc) from exc

    numero.ultimo_chequeo_en = timezone.now()
    estado_meta = str(data.get("status") or "").upper()
    if estado_meta == "CONNECTED" and data.get("is_on_biz_app") is True:
        numero.save(update_fields=["ultimo_chequeo_en", "updated_at"])
        _recalcular_estado(numero)
        return data

    numero.estado = NumeroWhatsapp.Estado.ERROR
    if estado_meta == "CONNECTED":
        numero.ultimo_error = (
            "El número dejó de estar en WhatsApp Business. Abre WhatsApp Business en el teléfono "
            "de la clínica y vuelve a conectarlo."
        )
    else:
        numero.ultimo_error = f"Meta reporta el número como {estado_meta or 'desconocido'}."
    numero.save(update_fields=["estado", "ultimo_error", "ultimo_chequeo_en", "updated_at"])
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
    conexion = ConexionWhatsappPropio.objects.filter(clinica=clinica).select_related("numero_por_defecto").first()
    if conexion is None or not conexion.numeros.exists():
        return None, "sin_numero"

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
    # Solo pasa a `enviado` si el webhook no lo marco `fallido` mientras tanto.
    EnvioWhatsApp.objects.filter(pk=envio.pk, estado=EnvioWhatsApp.Estado.INCIERTO).update(
        estado=EnvioWhatsApp.Estado.ENVIADO, updated_at=timezone.now(),
    )
    EnvioWhatsApp.objects.filter(pk=envio.pk).update(lyvio_message_id=message_id)
    envio.refresh_from_db(fields=["estado", "lyvio_message_id"])
    return {"envio_id": str(envio.id), "estado": envio.estado}


def _registrar_sin_respaldo(envio, error, exc):
    """El envio fallo por el numero de la clinica y tampoco salio por el
    compartido: queda en "Envios que no salieron" para que la clinica lo vea."""
    from apps.notificaciones.models import NotificacionFallida

    logger.warning("No se pudo reenviar por el compartido el envío %s: %s", envio.id, exc)
    NotificacionFallida.objects.create(
        clinica=envio.clinica,
        paciente=envio.paciente,
        tipo_notificacion=envio.tipo,
        telefono=getattr(envio.paciente, "telefono", "") or "",
        motivo=f"Falló por el número de la clínica ({error}) y no se pudo reenviar: {exc}"[:2000],
    )


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
# Ventana para asociar un fallo que llego antes que el message_id (ver
# _envio_del_webhook).
VENTANA_FALLO_TEMPRANO = timedelta(minutes=5)


def _error_externo(payload: dict) -> str:
    atributos = payload.get("content_attributes") or {}
    if isinstance(atributos, dict) and atributos.get("external_error"):
        return str(atributos["external_error"])
    return str(payload.get("external_error") or "")


def procesar_webhook(payload: dict) -> str:
    """Procesa un evento del webhook de cuenta de Lyvio y devuelve que se hizo
    (para el log y los tests). Nunca levanta por datos desconocidos: Lyvio no
    debe reintentar por un evento que a CliniQ no le importa."""
    evento = payload.get("event")
    if evento == "message_updated" and str(payload.get("status") or "") == "failed":
        return _mensaje_fallido(payload)
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

        if error.split(":", 1)[0].strip() == ERROR_SIN_PAGO and envio.numero_id:
            # Sin esto cada mensaje fallaria y saldria dos veces.
            NumeroWhatsapp.objects.filter(pk=envio.numero_id).update(
                estado=NumeroWhatsapp.Estado.ERROR, ultimo_error=MENSAJE_SIN_PAGO, updated_at=timezone.now(),
            )

    try:
        reenviar_por_compartido(envio)
    except (WhatsAppNoDisponibleError, ValueError, requests.RequestException) as exc:
        _registrar_sin_respaldo(envio, error, exc)
        return "respaldo_fallido"
    return "respaldo_enviado"
