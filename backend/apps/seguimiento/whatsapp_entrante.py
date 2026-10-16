"""Mensajes entrantes al número propio de WhatsApp → interesados en Seguimiento.

Cuando alguien escribe al número propio de la clínica (Chatwoot/Lyvio avisa con
``message_created`` entrante), se registra en Seguimiento para que la recepción
lo llame (decisiones del 16/10/2026):

- Solo clínicas con el número propio habilitado y el número conectado.
- Un teléfono que no es de ningún paciente queda como interesado sin ficha, con
  el primer mensaje como "interés" (200 caracteres).
- Si ese interesado ya estaba abierto no se duplica; si se había perdido, se
  reabre.
- Un paciente sin seguimiento abierto entra como Recompra (o se reabre su
  última oportunidad perdida).
- No entran los teléfonos marcados "No es cliente" ni los del equipo.

Nunca levanta: el webhook de Lyvio no se reintenta y no debe fallar por esto.
"""

import logging

from django.db import transaction

from apps.seguimiento.models import Oportunidad, TelefonoDescartado
from apps.seguimiento.services import (
    abiertas_de_venta,
    buscar_paciente_por_telefono,
    crear_interesado,
    digitos_telefono,
    reabrir,
)

logger = logging.getLogger(__name__)

LARGO_INTERES = 200


def _contacto(payload: dict) -> tuple[str, str]:
    """Teléfono y nombre de quien escribió: el remitente del mensaje o, si no
    viene, el contacto de la conversación."""
    remitente = payload.get("sender") or {}
    if str(remitente.get("type") or "contact").lower() != "contact":
        remitente = {}
    meta = ((payload.get("conversation") or {}).get("meta") or {}).get("sender") or {}
    telefono = str(remitente.get("phone_number") or meta.get("phone_number") or "")
    nombre = str(remitente.get("name") or meta.get("name") or "").strip()
    # Chatwoot usa el teléfono como nombre cuando el perfil no tiene uno.
    if digitos_telefono(nombre) and digitos_telefono(nombre) == digitos_telefono(telefono):
        nombre = ""
    return telefono, nombre


def _texto(payload: dict) -> str:
    texto = " ".join(str(payload.get("content") or "").split())
    if not texto and payload.get("attachments"):
        texto = "Envió un archivo"
    return texto[:LARGO_INTERES]


def _sede_del_numero(numero):
    """La sede que usa ese número, si es una sola; si lo comparten varias (o
    ninguna), sin sede: lo ve la recepción de todas."""
    from apps.clinicas.models import Sede
    from apps.notificaciones.models import AsignacionWhatsappSede

    conexion = numero.conexion
    asignaciones = {a.sede_id: a for a in AsignacionWhatsappSede.objects.filter(conexion=conexion)}
    es_por_defecto = conexion.numero_por_defecto_id == numero.id
    sedes = []
    for sede in Sede.objects.filter(clinica_id=conexion.clinica_id, activo=True):
        asignacion = asignaciones.get(sede.id)
        if asignacion is None or asignacion.tipo == AsignacionWhatsappSede.Tipo.POR_DEFECTO:
            usa_este = es_por_defecto
        elif asignacion.tipo == AsignacionWhatsappSede.Tipo.NUMERO:
            # Sin número (se borró) vuelve al por defecto.
            usa_este = asignacion.numero_id == numero.id if asignacion.numero_id else es_por_defecto
        else:
            usa_este = False
        if usa_este:
            sedes.append(sede)
    return sedes[0] if len(sedes) == 1 else None


def _es_del_equipo(clinica, clave: str) -> bool:
    from apps.users.models import User

    candidatos = User.objects.filter(clinica=clinica, telefono__contains=clave[-7:]).values_list("telefono", flat=True)
    return any(digitos_telefono(t) == clave for t in candidatos)


def _interesado_por_telefono(clinica, clave: str, estado: str):
    candidatos = Oportunidad.objects.filter(
        clinica=clinica, paciente__isnull=True, activo=True, tipo__in=Oportunidad.TIPOS_VENTA,
        estado=estado, contacto_telefono__contains=clave[-4:],
    ).order_by("-cerrada_en", "-created_at")
    return next((o for o in candidatos if digitos_telefono(o.contacto_telefono) == clave), None)


def _reabrir_por_whatsapp(oportunidad, texto: str):
    reabrir(oportunidad)
    oportunidad.motivo = Oportunidad.Motivo.WHATSAPP
    campos = ["motivo", "updated_at"]
    if texto:
        oportunidad.interes = texto
        campos.append("interes")
    oportunidad.save(update_fields=campos)


def registrar_mensaje_entrante(payload: dict) -> str:
    """Devuelve qué se hizo (para el log y las pruebas)."""
    try:
        with transaction.atomic():
            return _registrar(payload)
    except Exception:  # noqa: BLE001 — el webhook nunca debe fallar por el seguimiento
        logger.exception("[whatsapp_entrante] no se pudo registrar el mensaje %s", payload.get("id"))
        return "error"


def _registrar(payload: dict) -> str:
    from apps.notificaciones.models import NumeroWhatsapp

    inbox_id = str((payload.get("inbox") or {}).get("id") or (payload.get("conversation") or {}).get("inbox_id") or "")
    if not inbox_id:
        return "sin_inbox"
    # Bloquear el número ordena los mensajes que llegan a la vez: dos mensajes
    # seguidos de la misma persona creaban dos interesados.
    numero = (
        NumeroWhatsapp.objects.select_for_update(of=("self",))
        .select_related("conexion__clinica")
        .filter(lyvio_inbox_id=inbox_id)
        .first()
    )
    if numero is None:
        return "inbox_desconocido"
    clinica = numero.conexion.clinica
    if not clinica.whatsapp_numero_propio_habilitado:
        return "numero_propio_apagado"

    telefono, nombre = _contacto(payload)
    clave = digitos_telefono(telefono)
    if len(clave) < 7:
        return "sin_telefono"
    if TelefonoDescartado.objects.filter(clinica=clinica, telefono=clave).exists():
        return "descartado"
    if _es_del_equipo(clinica, clave):
        return "equipo"
    texto = _texto(payload)

    paciente = buscar_paciente_por_telefono(clinica, telefono)
    if paciente is not None:
        if abiertas_de_venta(paciente).exists():
            return "ya_en_seguimiento"
        perdida = (
            Oportunidad.objects.filter(
                paciente=paciente, activo=True, tipo__in=Oportunidad.TIPOS_VENTA, estado=Oportunidad.Estado.PERDIDA,
            ).order_by("-cerrada_en").first()
        )
        if perdida is not None:
            _reabrir_por_whatsapp(perdida, texto)
            return "reabierta"
        crear_interesado(
            clinica=clinica, usuario=None, nombre="", telefono=telefono, interes=texto,
            origen=Oportunidad.Origen.WHATSAPP, sede=_sede_del_numero(numero), paciente=paciente,
            motivo=Oportunidad.Motivo.WHATSAPP, tipo=Oportunidad.Tipo.RECOMPRA,
        )
        return "recompra"

    if _interesado_por_telefono(clinica, clave, Oportunidad.Estado.ABIERTA) is not None:
        return "ya_en_seguimiento"
    perdido = _interesado_por_telefono(clinica, clave, Oportunidad.Estado.PERDIDA)
    if perdido is not None:
        _reabrir_por_whatsapp(perdido, texto)
        return "reabierta"
    crear_interesado(
        clinica=clinica, usuario=None, nombre=nombre, telefono=telefono, interes=texto,
        origen=Oportunidad.Origen.WHATSAPP, sede=_sede_del_numero(numero),
        motivo=Oportunidad.Motivo.WHATSAPP,
    )
    return "interesado"


def marcar_no_es_cliente(oportunidad, *, usuario) -> Oportunidad:
    """"No es cliente": se cierra y su teléfono ya no vuelve a crear interesados."""
    from apps.seguimiento.services import perder

    clave = digitos_telefono(oportunidad.telefono)
    if len(clave) >= 7:
        TelefonoDescartado.objects.get_or_create(
            clinica_id=oportunidad.clinica_id, telefono=clave,
            defaults={"creado_por": usuario if getattr(usuario, "is_authenticated", False) else None},
        )
    if oportunidad.estado == Oportunidad.Estado.ABIERTA:
        perder(oportunidad, usuario=usuario, motivo=Oportunidad.MotivoPerdida.NO_CANDIDATO, nota="No es cliente.")
    return oportunidad
