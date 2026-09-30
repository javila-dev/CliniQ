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
        """Valores de las variables en orden. Meta rechaza parametros vacios."""
        return [str(contexto.get(clave) or "-").strip() or "-" for clave in self.variables]

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
        cuerpo=(
            "Hola {{1}}, te recordamos tu cita de {{2}} en {{3}}, sede {{4}}, el {{5}}. "
            "Si necesitas reprogramarla, responde a este mensaje o llama al {{6}}. Te esperamos."
        ),
        variables=(
            "paciente_nombre", "servicio_nombre", "clinica_nombre",
            "sede_nombre", "fecha_y_hora", "sede_telefono",
        ),
        ejemplo=("Ana", "Limpieza facial", "Clínica Bella", "Norte", "lunes 5 de octubre a las 10:00 a. m.", "3001234567"),
    ),
    PlantillaCatalogo(
        tipo=Tipo.FIRMA_DOCUMENTO,
        nombre="cliniq_firma_documento_v1",
        categoria="UTILITY",
        cuerpo=(
            "Hola {{1}}, {{2}} te envía el documento {{3}} para que lo revises y lo firmes "
            "en este enlace: {{4}} Si tienes dudas, responde a este mensaje."
        ),
        variables=("paciente_nombre", "clinica_nombre", "documento_tipo", "link"),
        ejemplo=("Ana", "Clínica Bella", "consentimiento informado", "https://firma.cliniq.co/d/abc123"),
    ),
    PlantillaCatalogo(
        tipo=Tipo.ENVIO_COTIZACION,
        nombre="cliniq_envio_cotizacion_v1",
        categoria="UTILITY",
        cuerpo=(
            "Hola {{1}}, te compartimos en el documento adjunto la cotización que preparamos "
            "para ti en {{2}}. Si tienes preguntas, responde a este mensaje."
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
            "Hola {{1}}, te compartimos en el documento adjunto tu orden médica de {{2}}. "
            "Si tienes dudas, responde a este mensaje."
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
