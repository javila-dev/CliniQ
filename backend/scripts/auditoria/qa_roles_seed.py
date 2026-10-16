"""Crea (o reutiliza) los usuarios QA de la simulación por perfiles.

    docker exec cliniq_backend python scripts/auditoria/qa_roles_seed.py

Usa el flujo real de la app con el admin de la clínica: crea el rol
personalizado desde capacidades, el colaborador con su sede y el check
"atiende pacientes", y activa la cuenta con el token de invitación.
Las credenciales (de prueba, generadas aquí) quedan en salida/qa_usuarios.json,
que está fuera de git.

    --desactivar   deja inactivos a los usuarios QA al terminar la prueba.
"""

import json
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from unittest import mock  # noqa: E402

from rest_framework.test import APIClient  # noqa: E402

from apps.clinicas.models import Clinica, Sede  # noqa: E402
from apps.users.models import PasswordResetToken, Rol, User  # noqa: E402
from apps.users.permissions_catalog import CAPABILITY_PERMISSIONS  # noqa: E402

SALIDA = Path(__file__).resolve().parent / "salida" / "qa_usuarios.json"
CLINICA = "Beauty Clinic"
SEDE_A, SEDE_B = "Principal", "Principal H4"

# Roles personalizados armados con las capacidades de la pantalla de roles.
ROLES = {
    "QA Recepción básica": [
        "agenda.gestionar_citas", "pacientes.gestionar", "cobros.cobrar", "servicios.ver",
    ],
    "QA Asesora comercial": [
        "agenda.ver", "pacientes.ver", "cotizaciones.gestionar", "seguimiento.gestionar",
        "comercial.ver_sede", "servicios.ver",
    ],
    "QA Cajera": [
        "cobros.cobrar", "cartera.registrar_pago", "caja.realizar_cierres", "caja.registrar_gastos",
    ],
    "QA Esteticista": [
        "agenda.ver", "pacientes.ver",
    ],
    "QA Médica con ventas": [
        "agenda.gestionar_citas", "pacientes.gestionar", "pacientes.historia",
        "cotizaciones.gestionar", "cobros.ver", "servicios.ver",
    ],
    "QA Solo agenda": [
        "agenda.ver",
    ],
    "QA Gerencia": [
        "reportes.operativos", "reportes.financieros", "cobros.ver", "cartera.ver", "cotizaciones.ver",
        "caja.ver_gastos", "caja.ver_cierres", "pacientes.ver", "agenda.ver",
    ],
}

# clave: (nombre, rol de sistema o personalizado, atiende, sede principal, sedes extra)
PERSONAS = {
    "admin": ("Ana Admin QA", "admin", False, SEDE_A, [SEDE_B]),
    "profesional": ("Pablo Profesional QA", "profesional", True, SEDE_A, []),
    "recepcion": ("Rita Recepción QA", "recepcion", False, SEDE_A, []),
    "recepcion_atiende": ("Rocío Recepción que atiende QA", "recepcion", True, SEDE_B, []),
    "rec_basica": ("Berta Recepción básica QA", "QA Recepción básica", False, SEDE_A, []),
    "asesora": ("Carla Asesora QA", "QA Asesora comercial", False, SEDE_B, []),
    "cajera": ("Diana Cajera QA", "QA Cajera", False, SEDE_A, []),
    "esteticista": ("Elena Esteticista QA", "QA Esteticista", True, SEDE_A, []),
    "medica_ventas": ("Fabiola Médica QA", "QA Médica con ventas", True, SEDE_B, []),
    "solo_agenda": ("Gina Solo agenda QA", "QA Solo agenda", False, SEDE_A, []),
    "gerencia": ("Hugo Gerente QA", "QA Gerencia", False, SEDE_A, [SEDE_B]),
}


def _invitacion_sin_correo(user):
    from datetime import timedelta

    from django.utils import timezone

    PasswordResetToken.objects.create(
        user=user, token=secrets.token_urlsafe(32), purpose=PasswordResetToken.Purpose.INVITE,
        expires_at=timezone.now() + timedelta(days=3),
    )


def falla(resp, que):
    raise SystemExit(f"{que}: HTTP {resp.status_code} {getattr(resp, 'data', resp.content)!r}")


def main():
    clinica = Clinica.objects.get(nombre=CLINICA)
    sedes = {s.nombre: s for s in Sede.objects.filter(clinica=clinica)}
    admin = User.objects.get(email="admin@demo.com")
    api = APIClient(SERVER_NAME="localhost")
    api.force_authenticate(admin)

    if "--desactivar" in sys.argv:
        n = User.objects.filter(email__startswith="qa.", email__endswith="@cliniq.test").update(is_active=False, activo=False)
        print(f"{n} usuarios QA desactivados")
        return

    roles = {r.nombre: r for r in Rol.objects.filter(clinica=clinica)}
    for nombre, capacidades in ROLES.items():
        if nombre not in roles:
            r = api.post("/api/v1/usuarios/roles/", {"nombre": nombre, "descripcion": "Rol de la simulación QA"}, format="json")
            if r.status_code != 201:
                falla(r, f"crear rol {nombre}")
            roles[nombre] = Rol.objects.get(id=r.data["id"])
        claves = sorted(set().union(*(CAPABILITY_PERMISSIONS[c] for c in capacidades)))
        r = api.put(f"/api/v1/usuarios/roles/{roles[nombre].id}/permisos/", {"permission_keys": claves}, format="json")
        if r.status_code != 200:
            falla(r, f"permisos de {nombre}")
    sistema = {r.slug: r for r in Rol.objects.filter(clinica=clinica, es_sistema=True)}

    credenciales = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else {}
    for clave, (nombre, rol, atiende, sede, extra) in PERSONAS.items():
        email = f"qa.{clave.replace('_', '.')}@cliniq.test"
        role = sistema.get(rol) or roles[rol]
        user = User.objects.filter(email=email).first()
        if user is None:
            first, last = nombre.split(" ", 1)
            datos = {
                "email": email, "first_name": first, "last_name": last, "role_id": str(role.id),
                "es_profesional": atiende, "sede_principal": str(sedes[sede].id),
                "sedes_ids": [str(sedes[s].id) for s in [sede, *extra]],
                "tipo_contrato": "empleado", "fecha_ingreso": "2026-01-15",
                "numero_documento": str(10_000_000 + secrets.randbelow(89_999_999)),
            }
            # Sin SMTP local la invitación falla y tumba la creación: se simula el
            # envío (el token de invitación sí se crea, como en producción).
            with mock.patch("apps.colaboradores.serializers.send_invitation_email", _invitacion_sin_correo):
                r = api.post("/api/v1/colaboradores/", datos, format="json")
            if r.status_code != 201:
                falla(r, f"crear colaborador {email}")
            user = User.objects.get(email=email)
        esperadas = {str(sedes[s].id) for s in [sede, *extra]}
        if {str(i) for i in user.colaborador.sedes.values_list("id", flat=True)} != esperadas:
            r = api.patch(f"/api/v1/colaboradores/{user.colaborador.id}/", {"sedes_ids": sorted(esperadas)}, format="json")
            if r.status_code != 200:
                falla(r, f"sedes de {email}")
        if not user.is_active or clave not in credenciales:
            token = PasswordResetToken.objects.filter(user=user, used_at__isnull=True).order_by("-created_at").first()
            password = "Qa-" + secrets.token_urlsafe(12) + "9a"
            if token:
                r = APIClient(SERVER_NAME="localhost").post("/api/v1/auth/restablecer-password/", {
                    "token": token.token, "nueva_password": password, "confirmar_password": password,
                }, format="json")
                if r.status_code not in (200, 204):
                    falla(r, f"activar {email}")
            else:
                user.set_password(password)
                user.is_active = user.activo = True
                user.save()
            credenciales[clave] = {"email": email, "password": password}
        user.refresh_from_db()
        print(f"{clave:18} {email:34} rol={user.rol_dinamico.nombre:22} atiende={user.es_profesional} activo={user.is_active}")

    SALIDA.parent.mkdir(exist_ok=True)
    SALIDA.write_text(json.dumps(credenciales, indent=1), encoding="utf-8")
    (SALIDA.parent / "qa_ids.json").write_text(json.dumps(ids_para_rutas(clinica, sedes), indent=1), encoding="utf-8")


def ids_para_rutas(clinica, sedes):
    """Un registro real por ruta dinámica; de la sede B cuando importa el alcance."""
    from apps.agenda.models import Cita
    from apps.cartera.models import Cartera
    from apps.clinicas.models import Servicio
    from apps.consentimientos.models import PlantillaConsentimiento
    from apps.cotizaciones.models import Cotizacion
    from apps.inventario.models import Insumo
    from apps.pacientes.models import Paciente
    from apps.proveedores.models import OrdenCompra

    def primero(qs):
        o = qs.first()
        return str(o.id) if o else None

    a, b = sedes[SEDE_A], sedes[SEDE_B]
    cotiz = Cotizacion.objects.filter(clinica=clinica).order_by("-created_at")
    return {
        "paciente": primero(Paciente.objects.filter(clinica=clinica).order_by("-created_at")),
        "cita_a": primero(Cita.objects.filter(sede=a).exclude(estado="cancelada").order_by("-fecha_inicio")),
        "cita_b": primero(Cita.objects.filter(sede=b).exclude(estado="cancelada").order_by("-fecha_inicio")),
        "cotizacion_a": primero(cotiz.filter(sede=a, estado="borrador")) or primero(cotiz.filter(sede=a)),
        "cotizacion_b": primero(cotiz.filter(sede=b, estado="borrador")) or primero(cotiz.filter(sede=b)),
        "venta_a": primero(cotiz.filter(sede=a, estado="aceptada")),
        "venta_b": primero(cotiz.filter(sede=b, estado="aceptada")),
        "cartera": primero(Cartera.objects.filter(paciente__clinica=clinica)),
        "orden": primero(OrdenCompra.objects.filter(sede__clinica=clinica)),
        "insumo": primero(Insumo.objects.filter(clinica=clinica)),
        "procedimiento": primero(Servicio.objects.filter(clinica=clinica).order_by("nombre")),
        "plantilla": primero(PlantillaConsentimiento.objects.filter(clinica=clinica)),
    }


if __name__ == "__main__":
    main()
