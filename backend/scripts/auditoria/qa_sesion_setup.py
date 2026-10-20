"""Superadmin temporal para el QA en navegador de la sesión con cookie (16/10/2026).

    docker exec cliniq_backend python scripts/auditoria/qa_sesion_setup.py crear
    docker exec cliniq_backend python scripts/auditoria/qa_sesion_setup.py borrar

La contraseña se genera al azar y queda en salida/qa_superadmin.json (ignorado
por git). `borrar` elimina el usuario y sus suplantaciones de prueba.
"""
import json
import os
import secrets
import sys
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.users.models import SesionSuplantacion, User  # noqa: E402

SALIDA = Path(__file__).resolve().parent / "salida"
ARCHIVO = SALIDA / "qa_superadmin.json"
EMAIL = "qa-superadmin@qa.test"

if sys.argv[1] == "crear":
    password = "Qa-" + secrets.token_urlsafe(12) + "9a"
    user, _ = User.objects.get_or_create(
        email=EMAIL, defaults={"first_name": "Super", "last_name": "QA", "rol": User.Role.SUPERADMIN},
    )
    user.rol = User.Role.SUPERADMIN
    user.is_active = True
    user.activo = True
    user.set_password(password)
    user.save()
    ARCHIVO.write_text(json.dumps({"email": EMAIL, "password": password}), encoding="utf-8")
    print("superadmin listo")
elif sys.argv[1] == "borrar":
    from apps.core.models import LogAccion

    user = User.objects.filter(email=EMAIL).first()
    if user is not None:
        SesionSuplantacion.objects.filter(superadmin=user).delete()
        LogAccion.objects.filter(usuario=user).delete() if hasattr(LogAccion, "usuario") else None
        user.delete()
    ARCHIVO.unlink(missing_ok=True)
    print("superadmin borrado")
