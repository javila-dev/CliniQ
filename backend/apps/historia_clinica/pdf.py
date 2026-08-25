"""Genera el PDF de la historia clínica completa de un paciente."""
from __future__ import annotations

import base64
import io
import logging
from datetime import date

from dateutil.relativedelta import relativedelta
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from apps.core.storage import get_signed_url, read_public_file
from apps.historia_clinica.models import (
    AnotacionZona,
    ConsentimientoInformado,
    FotoClinica,
    HistoriaClinica,
    NotaClinica,
    OrdenMedica,
    ResultadoExamen,
    SignosVitales,
)

logger = logging.getLogger(__name__)

# Debe reflejar CAMPOS_POR_TIPO en frontend/src/components/historia/TabZonas.tsx
_CAMPO_LABELS = {
    "equipo_nombre": "Equipo",
    "potencia": "Potencia",
    "tiempo": "Tiempo",
    "pulsos": "Pulsos",
    "producto": "Producto",
    "volumen_ml": "Volumen (ml)",
    "dilucion": "Dilución",
    "tecnica": "Técnica",
    "cantidad": "Cantidad",
    "longitud_onda": "Longitud de onda",
    "fluencia": "Fluencia (J/cm²)",
    "spot_size": "Spot size",
}


def _formato_parametros(parametros: dict) -> str:
    partes = []
    for key, value in (parametros or {}).items():
        if not value:
            continue
        label = _CAMPO_LABELS.get(key, key.replace("_", " ").capitalize())
        partes.append(f"{label}: {value}")
    return " · ".join(partes)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _b64_public(path: str | None) -> str | None:
    if not path:
        return None
    data = read_public_file(path)
    if not data:
        return None
    ext = (path.rsplit(".", 1)[-1].lower()) if "." in path else "png"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/png")
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _b64_private(path: str | None) -> str | None:
    """Lee un archivo privado de MinIO y lo convierte a data-URI para embeberlo en el PDF."""
    if not path:
        return None
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError
        from django.conf import settings

        client = boto3.client(
            "s3",
            endpoint_url=getattr(settings, "MINIO_ENDPOINT", "") or None,
            aws_access_key_id=getattr(settings, "MINIO_ACCESS_KEY", ""),
            aws_secret_access_key=getattr(settings, "MINIO_SECRET_KEY", ""),
            region_name=getattr(settings, "MINIO_REGION", "us-east-1"),
        )
        bucket = settings.MINIO_PRIVATE_BUCKET
        response = client.get_object(Bucket=bucket, Key=path)
        data = response["Body"].read()
        ext = (path.rsplit(".", 1)[-1].lower()) if "." in path else "jpg"
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")
        return f"data:{mime};base64,{base64.b64encode(data).decode()}"
    except Exception:
        logger.warning("pdf.py: no se pudo leer imagen privada %s", path)
        return None


def _b64_diagrama_con_circulos(imagen_name: str | None, anotaciones: list[dict]) -> str | None:
    """Lee la imagen del diagrama, pinta círculos numerados con Pillow y devuelve data-URI."""
    data = read_public_file(imagen_name) if imagen_name else None
    if not data:
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        w, h = img.size
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        stroke = max(2, int(w * 0.012))

        try:
            font_size = max(10, int(w * 0.05))
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

        for i, az in enumerate(anotaciones, start=1):
            cx = az["x_raw"] * w
            cy = az["y_raw"] * h
            r = az["r_raw"] * w
            # Círculo semitransparente
            bbox = [cx - r, cy - r, cx + r, cy + r]
            draw.ellipse(bbox, fill=(59, 130, 246, 55), outline=(37, 99, 235, 230), width=stroke)
            # Badge con número — esquina superior-derecha, más pequeño
            label = str(i)
            badge_r = max(8, int(w * 0.032))
            bx, by = cx + r * 0.65, cy - r * 0.65
            draw.ellipse([bx - badge_r, by - badge_r, bx + badge_r, by + badge_r],
                         fill=(37, 99, 235, 240))
            bb = draw.textbbox((0, 0), label, font=font)
            # Centrar correctamente restando el offset del bbox
            tx = bx - (bb[0] + (bb[2] - bb[0]) / 2)
            ty = by - (bb[1] + (bb[3] - bb[1]) / 2)
            draw.text((tx, ty), label, font=font, fill=(255, 255, 255, 255))

        composite = Image.alpha_composite(img, overlay).convert("RGB")
        buf = io.BytesIO()
        composite.save(buf, format="PNG")
        return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception:
        logger.warning("pdf.py: no se pudo componer diagrama %s", imagen_name)
        return _b64_public(imagen_name)


def _fmt_date(d) -> str:
    if not d:
        return "—"
    if hasattr(d, "date"):
        d = timezone.localtime(d).date()
    meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{d.day} {meses[d.month - 1]} {d.year}"


def _fmt_datetime(dt) -> str:
    if not dt:
        return "—"
    local = timezone.localtime(dt)
    meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{local.day} {meses[local.month - 1]} {local.year}, {local.strftime('%H:%M')}"


def _edad(fecha_nac: date) -> str:
    delta = relativedelta(date.today(), fecha_nac)
    return f"{delta.years} años"


def _display(choices_cls, value: str) -> str:
    mapping = dict(choices_cls.choices)
    return mapping.get(value, value) if value else "—"


def _toxicos(ant) -> list[str]:
    items = []
    if ant.toxicologicos_tabaquismo:
        items.append("Tabaquismo")
    if ant.toxicologicos_alcohol:
        items.append("Alcohol")
    if ant.toxicologicos_drogas:
        items.append("Drogas")
    if ant.toxicologicos_otros:
        items.append(ant.toxicologicos_otros.strip())
    return items


# ── Context builders ─────────────────────────────────────────────────────────

def _build_antecedentes(paciente) -> dict | None:
    ant = getattr(paciente, "antecedentes", None)
    if not ant:
        return None

    from apps.pacientes.models import AntecedentePaciente
    tipo_piel_display = _display(AntecedentePaciente.TipoPiel, ant.tipo_piel) if ant.tipo_piel else None

    gineco = None
    if paciente.sexo == "F":
        gineco = {
            "gestaciones": ant.gestaciones,
            "partos": ant.partos,
            "abortos": ant.abortos,
            "cesareas": ant.cesareas,
            "fum": _fmt_date(ant.fum),
            "planificacion": ant.planificacion_familiar or None,
            "metodo": ant.metodo_anticonceptivo or None,
        }

    return {
        "alergias": ant.alergias or None,
        "contraindicaciones": ant.contraindicaciones or None,
        "medicamentos": ant.medicamentos_actuales or None,
        "patologicos": ant.patologicos or None,
        "quirurgicos": ant.quirurgicos or None,
        "traumaticos": ant.ant_traumaticos or None,
        "esteticos": ant.antecedentes_esteticos or None,
        "tipo_piel": tipo_piel_display,
        "toxicos": _toxicos(ant) or None,
        "familiares": ant.familiares or None,
        "gineco": gineco,
    }


def _build_signos(historia_id: int, cita_id) -> dict | None:
    qs = SignosVitales.objects.filter(historia_id=historia_id)
    if cita_id:
        sv = qs.filter(cita_id=cita_id).order_by("-created_at").first()
    else:
        sv = None
    if not sv:
        return None

    campos = []
    def add(label, value, unit=""):
        if value is not None:
            campos.append({"label": label, "value": f"{value}{' ' + unit if unit else ''}"})

    add("Peso", sv.peso_kg, "kg")
    add("Talla", sv.altura_cm, "cm")
    add("IMC", sv.imc)
    if sv.tension_sistolica and sv.tension_diastolica:
        campos.append({"label": "Tensión arterial", "value": f"{sv.tension_sistolica}/{sv.tension_diastolica} mmHg"})
    add("Frec. cardíaca", sv.frecuencia_cardiaca, "lpm")
    add("Frec. respiratoria", sv.frecuencia_respiratoria, "rpm")
    add("Temperatura", sv.temperatura_c, "°C")
    add("Sat. O₂", sv.saturacion_oxigeno, "%")

    for extra in (sv.campos_adicionales or []):
        nombre = extra.get("nombre") or extra.get("label") or extra.get("name")
        valor = extra.get("valor") or extra.get("value")
        unidad = extra.get("unidad") or extra.get("unit") or ""
        if nombre and valor is not None:
            campos.append({"label": nombre, "value": f"{valor}{' ' + unidad if unidad else ''}"})

    return {"campos": campos, "registrado_por": sv.registrado_por.nombre_completo if sv.registrado_por_id else None}


def _build_notas(historia: HistoriaClinica, include_fotos: bool) -> list[dict]:
    notas_qs = (
        NotaClinica.objects
        .filter(historia=historia, estado=NotaClinica.EstadoNota.COMPLETADA)
        .select_related("cita", "cita__profesional", "cita__servicio", "firmada_por")
        .prefetch_related("fotos", "examenes", "ordenes", "ordenes__plantilla_origen", "anotaciones_zona", "anotaciones_zona__diagrama")
        .order_by("-created_at")
    )

    result = []
    for i, nota in enumerate(notas_qs):
        profesional = None
        servicio = None
        sede = None
        if nota.cita_id:
            cita = nota.cita
            if cita.profesional_id:
                profesional = cita.profesional.nombre_completo
            if cita.servicio_id:
                servicio = cita.servicio.nombre
            if hasattr(cita, "sede") and cita.sede_id:
                sede = cita.sede.nombre

        # Signos vitales de esa cita
        signos = _build_signos(historia.id, nota.cita_id)

        # Fotos agrupadas por tipo
        fotos_payload = {}
        if include_fotos:
            tipos_label = {
                FotoClinica.TipoFoto.ANTES: "Antes",
                FotoClinica.TipoFoto.DURANTE: "Durante",
                FotoClinica.TipoFoto.DESPUES: "Después",
            }
            for tipo_key, tipo_label in tipos_label.items():
                fotos_tipo = [f for f in nota.fotos.all() if f.tipo == tipo_key]
                if fotos_tipo:
                    fotos_payload[tipo_label] = [
                        {
                            "b64": _b64_private(f.archivo.name if f.archivo else None),
                            "descripcion": f.descripcion or "",
                            "zona": f.zona or "",
                        }
                        for f in fotos_tipo
                    ]

        # Órdenes médicas
        ordenes = []
        for orden in nota.ordenes.all():
            ordenes.append({
                "nombre": orden.plantilla_origen.nombre if orden.plantilla_origen_id else "Orden médica",
                "contenido": orden.contenido,
                "profesional": orden.profesional.nombre_completo if orden.profesional_id else None,
            })

        # Exámenes
        examenes = []
        for ex in nota.examenes.all():
            examenes.append({
                "titulo": ex.titulo,
                "descripcion": ex.descripcion or "",
                "fecha": _fmt_date(ex.fecha),
            })

        # Zonas anotadas (diagramas corporales)
        zonas_por_diagrama: dict[str, dict] = {}
        for az in nota.anotaciones_zona.all():
            nombre = az.diagrama.nombre
            if nombre not in zonas_por_diagrama:
                zonas_por_diagrama[nombre] = {
                    "diagrama": nombre,
                    "_imagen_name": az.diagrama.imagen.name if az.diagrama.imagen else None,
                    "anotaciones": [],
                    "_raws": [],
                }
            zonas_por_diagrama[nombre]["anotaciones"].append({
                "texto": az.texto or "",
                "tipo_aplicacion": az.tipo_aplicacion or "",
                "parametros": az.parametros or {},
            })
            zonas_por_diagrama[nombre]["_raws"].append({
                "x_raw": az.x,
                "y_raw": az.y,
                "r_raw": az.radio,
            })

        zonas = []
        for grupo in zonas_por_diagrama.values():
            textos_numerados = []
            for i, ann in enumerate(grupo["anotaciones"]):
                tipo_label = _display(AnotacionZona.TipoAplicacion, ann["tipo_aplicacion"]) if ann["tipo_aplicacion"] else None
                detalle = _formato_parametros(ann["parametros"])
                texto = ann["texto"]
                if not (tipo_label or detalle or texto):
                    continue
                textos_numerados.append({
                    "num": i + 1,
                    "tipo": tipo_label,
                    "detalle": detalle or None,
                    "texto": texto or None,
                })
            zonas.append({
                "diagrama": grupo["diagrama"],
                "imagen_b64": _b64_diagrama_con_circulos(grupo["_imagen_name"], grupo["_raws"]),
                "anotaciones": textos_numerados,
            })

        result.append({
            "numero": len(notas_qs) - i,
            "fecha": _fmt_datetime(nota.created_at),
            "profesional": profesional,
            "servicio": servicio,
            "sede": sede,
            "motivo_consulta": (nota.motivo_consulta or "").strip() or None,
            "plan_manejo": (nota.plan_manejo or "").strip() or None,
            "signos": signos,
            "fotos": fotos_payload,
            "ordenes": ordenes,
            "examenes": examenes,
            "zonas": zonas,
        })

    return result


def _build_consentimientos(historia: HistoriaClinica) -> list[dict]:
    qs = ConsentimientoInformado.objects.filter(
        paciente=historia.paciente
    ).order_by("-created_at")

    result = []
    for c in qs:
        result.append({
            "tipo": c.get_tipo_display() if hasattr(c, "get_tipo_display") else c.tipo,
            "plantilla": c.documenso_template_nombre or c.plantilla.nombre if c.plantilla_id else None,
            "firmado": c.firmado,
            "fecha_firma": _fmt_date(c.fecha_firma),
            "fecha_vencimiento": _fmt_date(c.fecha_vencimiento),
            "vigente": bool(c.fecha_vencimiento and c.fecha_vencimiento >= date.today()),
        })
    return result


def build_historia_pdf_context(historia: HistoriaClinica, *, include_fotos: bool = True, usuario=None) -> dict:
    paciente = historia.paciente
    clinica = historia.clinica

    from apps.pacientes.models import Paciente

    logo_b64 = _b64_public(clinica.logo.name if clinica.logo else None)

    sede_principal = clinica.sedes.filter(activo=True).order_by("created_at").first()

    return {
        "historia_numero": historia.numero,
        "fecha_apertura": _fmt_date(historia.created_at),
        "fecha_impresion": _fmt_date(date.today()),
        "usuario_impresion": usuario.nombre_completo if usuario and hasattr(usuario, "nombre_completo") else (str(usuario) if usuario else None),

        # Clínica
        "clinica_nombre": clinica.nombre,
        "clinica_nit": getattr(clinica, "nit", "") or "",
        "clinica_telefono": getattr(clinica, "telefono", "") or "",
        "clinica_email": getattr(clinica, "email", "") or "",
        "clinica_direccion": sede_principal.direccion if sede_principal else "",
        "clinica_ciudad": sede_principal.ciudad if sede_principal else "",
        "logo_b64": logo_b64,

        # Paciente
        "paciente_nombre": paciente.nombre_completo,
        "paciente_tipo_doc": _display(Paciente.TipoDocumento, paciente.tipo_documento),
        "paciente_numero_doc": paciente.numero_documento,
        "paciente_fecha_nac": _fmt_date(paciente.fecha_nacimiento),
        "paciente_edad": _edad(paciente.fecha_nacimiento),
        "paciente_sexo": _display(Paciente.Sexo, paciente.sexo),
        "paciente_telefono": paciente.telefono or "—",
        "paciente_email": paciente.email or "—",
        "paciente_direccion": paciente.direccion or "",
        "paciente_ciudad": paciente.ciudad or "",
        "paciente_grupo_sanguineo": paciente.grupo_sanguineo or None,
        "paciente_eps": paciente.eps or None,
        "paciente_tipo_afiliado": _display(Paciente.TipoAfiliado, paciente.tipo_afiliado) if paciente.tipo_afiliado else None,
        "paciente_estado_civil": _display(Paciente.EstadoCivil, paciente.estado_civil) if paciente.estado_civil else None,
        "paciente_ocupacion": paciente.ocupacion or None,
        "paciente_escolaridad": _display(Paciente.Escolaridad, paciente.escolaridad) if paciente.escolaridad else None,

        # Responsable
        "responsable_nombre": paciente.nombre_responsable or None,
        "responsable_parentesco": paciente.parentesco_responsable or None,
        "responsable_telefono": paciente.telefono_responsable or None,

        # Contenido clínico
        "antecedentes": _build_antecedentes(paciente),
        "notas": _build_notas(historia, include_fotos=include_fotos),
        "consentimientos": _build_consentimientos(historia),
    }


def render_historia_pdf(historia: HistoriaClinica, *, include_fotos: bool = True, usuario=None) -> bytes:
    context = build_historia_pdf_context(historia, include_fotos=include_fotos, usuario=usuario)
    html = render_to_string("historia_clinica/pdf_historia.html", context)
    return HTML(string=html, base_url="/").write_pdf()
