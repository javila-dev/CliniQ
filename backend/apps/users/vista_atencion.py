"""Con qué pantalla atiende cada persona: la de su usuario, si no la de su rol,
si no la de la clínica (plan en docs/plan-atencion-sencilla.md)."""
from apps.users.models import VistaAtencion


def vista_de_clinica(clinica_id) -> str:
    from apps.configuracion.models import ConfiguracionHistoria

    if not clinica_id:
        return VistaAtencion.COMPLETA
    vista = ConfiguracionHistoria.objects.filter(clinica_id=clinica_id).values_list("vista_atencion", flat=True).first()
    return vista or VistaAtencion.COMPLETA


def vista_atencion_de(user, *, vista_clinica=None) -> dict:
    """{"vista": "completa" | "sencilla", "origen": "usuario" | "rol" | "clinica"}.

    `vista_clinica` evita leer la configuración una vez por usuario en los listados.
    """
    if user.vista_atencion:
        return {"vista": user.vista_atencion, "origen": "usuario"}
    rol = user.rol_dinamico
    if rol is not None and rol.vista_atencion:
        return {"vista": rol.vista_atencion, "origen": "rol"}
    return {"vista": vista_clinica or vista_de_clinica(user.clinica_id), "origen": "clinica"}
