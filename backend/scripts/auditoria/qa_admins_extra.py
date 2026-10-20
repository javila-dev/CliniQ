"""Admins de QA adicionales para revisar pantallas en paralelo (17/10/2026).

La sesión es única por usuario: si varias revisiones en navegador entran con el
mismo admin, cada login cierra la sesión de las demás. Este script crea copias
del admin de QA (misma clínica y rol) con contraseñas al azar, y las agrega a
salida/qa_usuarios.json (ignorado por git) como admin2, admin3…

    docker exec cliniq_backend python scripts/auditoria/qa_admins_extra.py crear 5
    docker exec cliniq_backend python scripts/auditoria/qa_admins_extra.py borrar
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

from apps.users.models import User  # noqa: E402

ARCHIVO = Path(__file__).resolve().parent / "salida" / "qa_usuarios.json"
cred = json.loads(ARCHIVO.read_text(encoding="utf-8"))

if sys.argv[1] == "crear":
    base = User.objects.get(email=cred["admin"]["email"])
    for n in range(2, int(sys.argv[2]) + 2):
        email = f"qa.admin{n}@cliniq.test"
        password = "Qa-" + secrets.token_urlsafe(12) + "9a"
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={"first_name": "Admin", "last_name": f"QA {n}", "rol": base.rol, "clinica": base.clinica},
        )
        user.rol = base.rol
        user.clinica = base.clinica
        user.is_active = True
        user.activo = True
        user.set_password(password)
        user.save()
        if hasattr(base, "roles"):
            user.roles.set(base.roles.all())
        if hasattr(base, "sedes"):
            user.sedes.set(base.sedes.all())
        cred[f"admin{n}"] = {"email": email, "password": password}
    ARCHIVO.write_text(json.dumps(cred, ensure_ascii=False, indent=1), encoding="utf-8")
    print("admins listos:", ", ".join(k for k in cred if k.startswith("admin")))
elif sys.argv[1] == "borrar":
    for clave in [k for k in cred if k.startswith("admin") and k != "admin"]:
        User.objects.filter(email=cred[clave]["email"]).delete()
        del cred[clave]
    ARCHIVO.write_text(json.dumps(cred, ensure_ascii=False, indent=1), encoding="utf-8")
    print("admins extra borrados")
