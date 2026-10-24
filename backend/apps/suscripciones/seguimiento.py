"""Vista "Pruebas" de la consola: una fila por clínica con su avance y el embudo
de activación por semana de registro (ver §6 del plan)."""

import statistics
from datetime import timedelta

from django.utils import timezone

from apps.notificaciones.models import NumeroWhatsapp

from .activacion import (
    ATENCIONES_PARA_ACTIVAR,
    DIAS_ACTIVOS_PARA_ACTIVAR,
    HITOS,
    actualizar_hitos,
    atenciones_completadas,
    evaluar,
    resumen_actividad,
)
from .models import NotaSeguimientoClinica, Suscripcion
from .serializers import SuscripcionAdminSerializer
from .services import actualizar_estado, dias_restantes_prueba

E = Suscripcion.Estado

FILTROS = ("pruebas", "por_vencer", "en_riesgo", "activadas", "vencidas", "manuales_sin_fecha", "todas")


def _nunca_pago(s: Suscripcion) -> bool:
    return s.periodo_inicio is None


def _url_whatsapp(telefono: str) -> str:
    digitos = "".join(c for c in telefono or "" if c.isdigit())
    if len(digitos) == 10 and digitos.startswith("3"):
        digitos = "57" + digitos  # celular colombiano sin indicativo
    return f"https://wa.me/{digitos}" if len(digitos) >= 10 else ""


def _contacto(clinica) -> dict:
    from apps.users.models import User
    from apps.users.services import ES_ADMIN_Q

    admin = User.objects.filter(clinica=clinica).filter(ES_ADMIN_Q).order_by("date_joined").first()
    telefono = (getattr(admin, "telefono", "") or "") or (clinica.telefono or "")
    return {
        "nombre": admin.nombre_completo if admin else "",
        "email": admin.email if admin else (clinica.email or ""),
        "telefono": telefono,
        "whatsapp_url": _url_whatsapp(telefono),
    }


def fila(s: Suscripcion) -> dict:
    clinica = s.clinica
    hitos = actualizar_hitos(clinica)
    actividad = resumen_actividad(clinica)
    atenciones = atenciones_completadas(clinica)
    nota = NotaSeguimientoClinica.objects.filter(clinica=clinica).select_related("autor").first()
    proximo = (
        NotaSeguimientoClinica.objects.filter(clinica=clinica, proximo_contacto__isnull=False)
        .order_by("-created_at").values_list("proximo_contacto", flat=True).first()
    )
    return {
        "clinica_id": str(clinica.id),
        "clinica_nombre": clinica.nombre,
        "registrada_el": clinica.created_at,
        "contacto": _contacto(clinica),
        "suscripcion": SuscripcionAdminSerializer(s).data,
        "hitos": [{"clave": clave, "etiqueta": etiqueta, "alcanzado_el": hitos.get(clave)} for clave, etiqueta, _ in HITOS],
        "atenciones_completadas": atenciones,
        # Señal de venta: conectó (o intentó conectar) su propio número de WhatsApp.
        "numero_propio_conectado": NumeroWhatsapp.objects.filter(conexion__clinica=clinica).exists(),
        **actividad,
        **evaluar(clinica, s, hitos, actividad, atenciones),
        "ultima_nota": (
            {"texto": nota.texto, "canal": nota.canal, "created_at": nota.created_at,
             "autor_nombre": nota.autor.nombre_completo if nota.autor else None}
            if nota else None
        ),
        "proximo_contacto": proximo,
    }


def filas(filtro: str = "pruebas") -> list[dict]:
    qs = Suscripcion.objects.select_related("clinica__plan").filter(clinica__activo=True)
    suscripciones = [actualizar_estado(s) for s in qs]

    if filtro == "manuales_sin_fecha":
        base = [s for s in suscripciones if s.modo_cobro == Suscripcion.ModoCobro.MANUAL and s.estado == E.ACTIVA and not s.periodo_fin]
    elif filtro == "todas":
        base = suscripciones
    elif filtro == "vencidas":
        base = [s for s in suscripciones if _nunca_pago(s) and s.estado in (E.SOLO_LECTURA, E.SUSPENDIDA)]
    elif filtro == "por_vencer":
        base = [s for s in suscripciones if s.estado == E.PRUEBA and (dias_restantes_prueba(s) or 0) <= 3]
    else:
        # Pruebas: en curso, o vencidas sin haber pagado nunca (las que todavía se pueden convertir).
        base = [s for s in suscripciones if s.estado == E.PRUEBA or (_nunca_pago(s) and s.estado != E.ACTIVA)]

    resultado = [fila(s) for s in base]
    if filtro == "en_riesgo":
        resultado = [f for f in resultado if f["semaforo"] in ("en_riesgo", "dormida")]
    elif filtro == "activadas":
        resultado = [f for f in resultado if f["activada"]]

    # Lo más urgente arriba: las pruebas que terminan antes; luego lo más reciente.
    def orden(f):
        s = f["suscripcion"]
        return (s["estado"] != E.PRUEBA, s["prueba_termina_el"] or "", -f["registrada_el"].timestamp())

    return sorted(resultado, key=orden)


def embudo(semanas: int = 12) -> dict:
    """Por semana de registro: cuántas clínicas llegaron a cada hito, en cuántos
    días (mediana), cuántas se activaron y cuántas pagaron. Solo cuentan las que
    empezaron en prueba."""
    desde = timezone.now() - timedelta(weeks=semanas)
    qs = (
        Suscripcion.objects.select_related("clinica")
        .filter(prueba_termina_el__isnull=False, clinica__created_at__gte=desde)
        .order_by("clinica__created_at")
    )
    cohortes: dict = {}
    for s in qs:
        clinica = s.clinica
        lunes = timezone.localdate(clinica.created_at)
        lunes -= timedelta(days=lunes.weekday())
        c = cohortes.setdefault(lunes, {"semana": lunes, "clinicas": 0, "dias": {h: [] for h, _, _ in HITOS}, "activadas": 0, "pagaron": 0})
        c["clinicas"] += 1
        hitos = actualizar_hitos(clinica)
        for clave, fecha in hitos.items():
            if clave in c["dias"]:
                c["dias"][clave].append((fecha - clinica.created_at).total_seconds() / 86400)
        if (
            atenciones_completadas(clinica) >= ATENCIONES_PARA_ACTIVAR
            and resumen_actividad(clinica)["dias_activos"] >= DIAS_ACTIVOS_PARA_ACTIVAR
        ):
            c["activadas"] += 1
        if s.periodo_inicio is not None:
            c["pagaron"] += 1

    def resumir(c):
        return {
            "semana": c["semana"],
            "clinicas": c["clinicas"],
            "activadas": c["activadas"],
            "pagaron": c["pagaron"],
            "hitos": [
                {
                    "clave": clave,
                    "etiqueta": etiqueta,
                    "alcanzaron": len(c["dias"][clave]),
                    "mediana_dias": round(statistics.median(c["dias"][clave]), 1) if c["dias"][clave] else None,
                }
                for clave, etiqueta, _ in HITOS
            ],
        }

    total = {"semana": None, "clinicas": 0, "dias": {h: [] for h, _, _ in HITOS}, "activadas": 0, "pagaron": 0}
    for c in cohortes.values():
        total["clinicas"] += c["clinicas"]
        total["activadas"] += c["activadas"]
        total["pagaron"] += c["pagaron"]
        for clave, dias in c["dias"].items():
            total["dias"][clave].extend(dias)
    return {"total": resumir(total), "cohortes": [resumir(c) for c in reversed(list(cohortes.values()))]}
