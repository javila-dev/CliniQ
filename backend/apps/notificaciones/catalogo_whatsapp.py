"""Catalogo de plantillas de WhatsApp que CliniQ replica en la WABA de cada
numero propio. Es la definicion canonica: no se lee de la WABA del numero
compartido (D4).

Reglas de Meta:
- nombre solo con [a-z0-9_]; para cambiar una plantilla aprobada se crea la
  version siguiente (sufijo _vN) en todas las clinicas, nunca se edita;
- las variables no pueden ir ni al principio ni al final del texto;
- toda variable necesita ejemplo.

`checkin_otp` no esta: el OTP siempre sale por el numero compartido (D8).
Un tipo nuevo entra con `vigente=False` hasta tener la plantilla aprobada en
todos los numeros existentes; mientras tanto sale por el compartido.
"""
import re
from dataclasses import dataclass

from apps.notificaciones.models import EnvioWhatsApp

Tipo = EnvioWhatsApp.Tipo
IDIOMA = "es_CO"
_VARIABLE = re.compile(r"\{\{(\d+)\}\}")
# Chatwoot borra < > " ' de cada parametro ("O'Brien" -> "OBrien"): las
# comillas se cambian por las tipograficas, que si pasan.
_COMILLAS = str.maketrans({"'": "’", '"': "”", "<": "", ">": ""})


def _limpiar(valor) -> str:
    """Meta rechaza parametros vacios, con saltos de linea, tabulaciones o mas
    de 4 espacios seguidos: se deja todo en una linea con espacios simples."""
    texto = " ".join(str(valor or "").translate(_COMILLAS).split())
    return texto or "-"


@dataclass(frozen=True)
class PlantillaCatalogo:
    tipo: str
    nombre: str
    categoria: str
    cuerpo: str
    # Clave del contexto de envio de cada variable, en orden: {{1}}, {{2}}...
    variables: tuple
    ejemplo: tuple
    encabezado_pdf: bool = False
    idioma: str = IDIOMA
    vigente: bool = True

    def valores(self, contexto: dict) -> list:
        """Valores de las variables en orden, ya limpios (ver _limpiar)."""
        return [_limpiar(contexto.get(clave)) for clave in self.variables]

    def renderizar(self, contexto: dict) -> str:
        """Texto final del mensaje: Lyvio lo necesita como `content`."""
        valores = self.valores(contexto)
        return _VARIABLE.sub(lambda m: valores[int(m.group(1)) - 1], self.cuerpo)

    def componentes(self, pdf_ejemplo_url: str = "") -> list:
        """`components` para crear la plantilla en Meta (via Lyvio)."""
        componentes = []
        if self.encabezado_pdf:
            componentes.append({"type": "HEADER", "format": "DOCUMENT", "example": {"header_url": pdf_ejemplo_url}})
        componentes.append({"type": "BODY", "text": self.cuerpo, "example": {"body_text": [list(self.ejemplo)]}})
        return componentes

    def payload_creacion(self, pdf_ejemplo_url: str = "") -> dict:
        return {
            "name": self.nombre,
            "language": self.idioma,
            "category": self.categoria,
            "components": self.componentes(pdf_ejemplo_url),
        }


CATALOGO = (
    PlantillaCatalogo(
        tipo=Tipo.RECORDATORIO_CITA,
        nombre="cliniq_recordatorio_cita_v1",
        categoria="UTILITY",
        # Formato de las plantillas del numero compartido, pero cerrando con
        # "responde a este mensaje": desde el numero propio la respuesta llega
        # al chat de la clinica (por eso no va el telefono de la sede).
        cuerpo=(
            "Hola *{{1}}* 👋\n\n"
            "Te recordamos tu cita en *{{2}}*, en nuestra sede {{3}}.\n\n"
            "🗓️ _Fecha y hora_: {{4}}\n"
            "💆 _Servicio_: {{5}}\n\n"
            "Si no puedes asistir o deseas reprogramar, responde a este mensaje.\n"
            "¡Te esperamos!"
        ),
        variables=("paciente_nombre", "clinica_nombre", "sede_nombre", "fecha_y_hora", "servicio_nombre"),
        ejemplo=("Ana", "Clínica Bella", "Norte", "lunes 5 de octubre a las 10:00 a. m.", "Limpieza facial"),
    ),
    PlantillaCatalogo(
        tipo=Tipo.FIRMA_DOCUMENTO,
        nombre="cliniq_firma_documento_v1",
        categoria="UTILITY",
        cuerpo=(
            "Hola *{{1}}* 👋\n\n"
            "Tienes pendiente de firma tu *{{2}}* de *{{3}}*.\n\n"
            "Firma aquí 👉 {{4}}\n\n"
            "Si tienes alguna duda, responde a este mensaje. ¡Gracias!"
        ),
        variables=("paciente_nombre", "documento_tipo", "clinica_nombre", "link"),
        ejemplo=("Ana", "consentimiento informado", "Clínica Bella", "https://firma.cliniq.co/d/abc123"),
    ),
    PlantillaCatalogo(
        tipo=Tipo.ENVIO_COTIZACION,
        nombre="cliniq_envio_cotizacion_v1",
        categoria="UTILITY",
        cuerpo=(
            "Hola *{{1}}* 👋\n\n"
            "Desde *{{2}}* te compartimos adjunta tu cotización para que la revises con calma.\n\n"
            "Si tienes alguna duda, responde a este mensaje 😊"
        ),
        variables=("paciente_nombre", "clinica_nombre"),
        ejemplo=("Ana", "Clínica Bella"),
        encabezado_pdf=True,
    ),
    PlantillaCatalogo(
        tipo=Tipo.ENVIO_FORMULA,
        nombre="cliniq_envio_orden_medica_v1",
        categoria="UTILITY",
        cuerpo=(
            "Hola *{{1}}* 👋\n\n"
            "Desde *{{2}}* te compartimos adjunta tu orden médica para que la revises con calma.\n\n"
            "Si tienes alguna duda, responde a este mensaje 😊"
        ),
        variables=("paciente_nombre", "clinica_nombre"),
        ejemplo=("Ana", "Clínica Bella"),
        encabezado_pdf=True,
    ),
)


def vigentes() -> tuple:
    return tuple(p for p in CATALOGO if p.vigente)


def plantilla_de(tipo: str):
    """Plantilla vigente del tipo, o None si ese tipo no sale por numero propio."""
    return next((p for p in vigentes() if p.tipo == tipo), None)
