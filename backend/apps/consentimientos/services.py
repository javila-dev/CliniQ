import hashlib
from datetime import timedelta

from botocore.exceptions import ClientError
from django.conf import settings
from django.core.files.base import ContentFile
from django.template import Context, Template
from django.utils import timezone
from weasyprint import HTML

from apps.core.storage import _s3_client
from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento


def renderizar_template_con_datos(cita, plantilla: PlantillaConsentimiento) -> str:
    template = Template(plantilla.contenido_html)
    context = Context(
        {
            "paciente": cita.paciente,
            "cita": cita,
            "servicio": cita.servicio,
            "profesional": cita.profesional,
            "clinica": cita.sede.clinica,
            "sede": cita.sede,
        }
    )
    return template.render(context)


def generar_pdf_consentimiento(consentimiento: Consentimiento) -> bytes:
    pie = (
        f"<hr><small>Paciente: {consentimiento.paciente.nombre_completo} | "
        f"Documento: {consentimiento.paciente.tipo_documento} {consentimiento.paciente.numero_documento} | "
        f"Fecha firma: {consentimiento.firmado_en or ''} | IP: {consentimiento.firma_ip or ''} | "
        f"Hash: {consentimiento.hash_contenido}</small>"
    )
    html = f"{consentimiento.contenido_snapshot}{pie}"
    return HTML(string=html).write_pdf()


def asegurar_bucket_consentimientos():
    if not settings.MINIO_PRIVATE_BUCKET or not settings.MINIO_ENDPOINT:
        return
    client = _s3_client()
    try:
        client.head_bucket(Bucket=settings.MINIO_PRIVATE_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.MINIO_PRIVATE_BUCKET)


def generar_consentimiento(cita, plantilla: PlantillaConsentimiento) -> Consentimiento:
    contenido_snapshot = renderizar_template_con_datos(cita, plantilla)
    hash_contenido = hashlib.sha256(contenido_snapshot.encode("utf-8")).hexdigest()
    return Consentimiento.objects.create(
        cita=cita,
        paciente=cita.paciente,
        plantilla=plantilla,
        contenido_snapshot=contenido_snapshot,
        hash_contenido=hash_contenido,
        token_expira=timezone.now() + timedelta(hours=48),
    )


def firmar_consentimiento(token, ip, user_agent) -> Consentimiento:
    consentimiento = Consentimiento.objects.select_related("paciente", "cita", "plantilla").get(token=token)
    if consentimiento.estado != Consentimiento.Estado.PENDIENTE:
        raise ValueError("El consentimiento ya no está pendiente de firma.")
    if not consentimiento.token_vigente:
        raise ValueError("El token de firma ya expiró.")

    consentimiento.estado = Consentimiento.Estado.FIRMADO
    consentimiento.firmado_en = timezone.now()
    consentimiento.firma_ip = ip
    consentimiento.firma_user_agent = user_agent or ""
    pdf_bytes = generar_pdf_consentimiento(consentimiento)
    asegurar_bucket_consentimientos()
    filename = f"consentimiento-{consentimiento.id}.pdf"
    consentimiento.pdf_archivo.save(filename, ContentFile(pdf_bytes), save=False)
    consentimiento.save()
    return consentimiento
