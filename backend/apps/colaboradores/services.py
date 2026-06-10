from datetime import date

from django.db import transaction


def ensure_admin_colaborador(user, *, force=False):
    from apps.clinicas.models import Sede
    from apps.colaboradores.models import Colaborador

    if not user or not user.clinica_id:
        return None
    if getattr(user, "rol", None) == "superadmin":
        return None

    role = getattr(user, "rol_dinamico", None)
    is_admin = (role and role.slug == "admin") or getattr(user, "rol", None) == "admin"
    if not is_admin:
        return None

    if hasattr(user, "colaborador"):
        colaborador = user.colaborador
        if colaborador.sede_principal_id is None:
            sede = Sede.objects.filter(clinica=user.clinica).order_by("created_at").first()
            if sede:
                colaborador.sede_principal = sede
                colaborador.save(update_fields=["sede_principal", "updated_at"])
                colaborador.sedes.add(sede)
        return colaborador

    other_admins = (
        user.__class__.objects.filter(clinica=user.clinica, rol_dinamico__slug="admin")
        .exclude(id=user.id)
        .count()
    )
    if other_admins > 0 and not force:
        return None

    sede = Sede.objects.filter(clinica=user.clinica).order_by("created_at").first()
    with transaction.atomic():
        colaborador = Colaborador.objects.create(
            user=user,
            sede_principal=sede,
            tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=date.today(),
            numero_documento="PENDIENTE",
            activo=True,
        )
        if sede:
            colaborador.sedes.add(sede)
    return colaborador
