"""Escenarios de escritura por perfil: lo que cada usuario QA puede (y no) hacer.

    docker exec cliniq_backend python scripts/auditoria/qa_escenarios.py

Cada acción se compara con lo que dicen sus permisos: si el permiso está y la
acción falla (o al revés), es un hallazgo. Todo corre en una transacción que se
deshace al final; la base de desarrollo no cambia.
Salida: salida/qa_escenarios.json
"""

import json
import os
import sys
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.agenda.models import Cita  # noqa: E402
from apps.caja.models import Caja, CategoriaGasto, SesionCaja  # noqa: E402
from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio  # noqa: E402
from apps.clinicas.precios import precio_lista  # noqa: E402
from apps.cotizaciones.models import Cotizacion  # noqa: E402
from apps.pacientes.models import Paciente  # noqa: E402
from apps.users.authorization import (  # noqa: E402
    atiende_solo_lo_propio,
    get_user_permission_keys,
    user_is_tenant_admin,
    user_sede_ids_acotadas,
    ve_solo_su_actividad_comercial,
)
from apps.users.models import User  # noqa: E402

AQUI = Path(__file__).resolve().parent / "salida"


class Rollback(Exception):
    pass


def proximo_lunes(hora, minuto=0):
    hoy = timezone.localdate()
    dias = (7 - hoy.weekday()) % 7 or 7
    fecha = hoy + timedelta(days=dias)
    return timezone.make_aware(timezone.datetime(fecha.year, fecha.month, fecha.day, hora, minuto))


def main():
    credenciales = json.loads((AQUI / "qa_usuarios.json").read_text(encoding="utf-8"))
    ids = json.loads((AQUI / "qa_ids.json").read_text(encoding="utf-8"))
    clinica = Clinica.objects.get(nombre="Beauty Clinic")
    sedes = {s.nombre: s for s in Sede.objects.filter(clinica=clinica)}
    sede_a, sede_b = sedes["Principal"], sedes["Principal H4"]
    admin = User.objects.get(email="qa.admin@cliniq.test")
    pro_ambas = User.objects.get(email="pro1@demo.com")  # atiende en las dos sedes
    # Con historia clínica: el de qa_ids.json (el más reciente) puede no tenerla.
    paciente = Paciente.objects.filter(clinica=clinica, historia_clinica__isnull=False).order_by("-created_at").first()
    servicio = Servicio.objects.filter(clinica=clinica, activo=True, precio_base__gt=0).order_by("nombre").first()
    efectivo = FormaDePago.objects.filter(clinica=clinica, activo=True).first()
    resultados = []

    def api_de(user):
        c = APIClient(SERVER_NAME="localhost")
        c.force_authenticate(user)
        return c

    with transaction.atomic():
        # Datos que la clínica de desarrollo no tiene y que los flujos necesitan.
        categoria = CategoriaGasto.objects.create(clinica=clinica, nombre="QA Papelería")
        cajas = {}
        for s in (sede_a, sede_b):
            cajas[s.id], _ = Caja.objects.get_or_create(sede=s, defaults={"saldo_inicial": Decimal("0")})
        # Un tope de descuento para que la regla de precio aplique (en desarrollo
        # el único servicio con precio tiene 100 %: precio libre).
        if servicio:
            servicio.descuento_maximo_pct = Decimal("10")
            servicio.save(update_fields=["descuento_maximo_pct"])

        for n, (clave, cred) in enumerate(credenciales.items()):
            user = User.objects.select_related("colaborador").get(email=cred["email"])
            perms = get_user_permission_keys(user)
            api = api_de(user)
            tiene_alguno = lambda *claves: any(c in perms for c in claves)  # noqa: E731
            sede_propia = user.colaborador.sede_principal if hasattr(user, "colaborador") else sede_a
            sede_ajena = sede_b if sede_propia == sede_a else sede_a
            acotadas = user_sede_ids_acotadas(user)
            ve_todas = acotadas is None or sede_ajena.id in acotadas

            def correr(accion, esperado, fn, nota=""):
                """esperado: True (debe poder), False (no debe), None (solo se registra)."""
                try:
                    with transaction.atomic():
                        r = fn()
                        status = r.status_code
                        cuerpo = getattr(r, "data", None)
                        raise Rollback()
                except Rollback:
                    pass
                except Exception as e:  # noqa: BLE001
                    status, cuerpo = "excepcion", repr(e)
                ok = isinstance(status, int) and status < 300
                hallazgo = esperado is not None and ok != esperado
                resultados.append({
                    "perfil": clave, "accion": accion, "esperado": esperado, "status": status, "ok": ok,
                    "hallazgo": hallazgo or status == "excepcion" or (isinstance(status, int) and status >= 500),
                    "nota": nota, "respuesta": str(cuerpo)[:300],
                })

            # ── Pacientes ────────────────────────────────────────────────
            correr("crear paciente", "pacientes.crear" in perms, lambda: api.post("/api/v1/pacientes/", {
                "tipo_documento": "CC", "numero_documento": f"88{n:02d}776655", "nombres": "QA", "apellidos": f"Paciente {clave}",
                "fecha_nacimiento": "1990-05-10", "sexo": "F", "direccion": "Calle QA", "telefono": f"30012{n:05d}",
                "canal_confirmacion": "whatsapp", "autoriza_datos": True,
            }, format="json"))

            def detalle_paciente():
                r = api.get(f"/api/v1/pacientes/{paciente.id}/")
                if r.status_code == 200:
                    doc = str(r.data.get("numero_documento", ""))
                    enmascarado = "*" in doc or "•" in doc
                    debe = "pacientes.datos_sensibles.ver" not in perms
                    if enmascarado != debe:
                        r.status_code = 299  # marca: el enmascarado no coincide con el permiso
                        r.data = {"documento": doc, "debe_enmascarar": debe}
                return r
            correr("ver paciente (enmascarado según permiso)", "pacientes.ver" in perms, detalle_paciente,
                   "status 299 = el enmascarado del documento no coincide con pacientes.datos_sensibles.ver")

            # ── Agenda ───────────────────────────────────────────────────
            correr("crear cita en su sede", "agenda.citas.crear" in perms, lambda: api.post("/api/v1/agenda/citas/", {
                "paciente": str(paciente.id), "sede": str(sede_propia.id), "profesional": str(pro_ambas.id),
                "fecha_inicio": proximo_lunes(14 if sede_propia == sede_a else 10).isoformat(), "canal_origen": "presencial",
                **({"servicio": str(servicio.id)} if servicio else {}),
            }, format="json"))
            correr("crear cita en otra sede", ("agenda.citas.crear" in perms) and ve_todas, lambda: api.post("/api/v1/agenda/citas/", {
                "paciente": str(paciente.id), "sede": str(sede_ajena.id), "profesional": str(pro_ambas.id),
                "fecha_inicio": proximo_lunes(14 if sede_ajena == sede_a else 10).isoformat(), "canal_origen": "presencial",
                **({"servicio": str(servicio.id)} if servicio else {}),
            }, format="json"))

            def confirmar(sede):
                inicio = proximo_lunes(19, 0) + timedelta(days=n)
                cita = Cita.objects.create(
                    paciente=paciente, sede=sede, profesional=pro_ambas, servicio=servicio,
                    servicio_nombre=servicio.nombre if servicio else "QA", fecha_inicio=inicio,
                    fecha_fin=inicio + timedelta(minutes=30), duracion_min=30, estado=Cita.Estado.PENDIENTE,
                    canal_confirmacion=paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
                )
                return api.post(f"/api/v1/agenda/citas/{cita.id}/cambiar_estado/", {"estado": "confirmada"}, format="json")
            correr("confirmar cita de su sede", "agenda.citas.cambiar_estado" in perms, lambda: confirmar(sede_propia))
            correr("confirmar cita de otra sede", ("agenda.citas.cambiar_estado" in perms) and ve_todas, lambda: confirmar(sede_ajena))

            # ── Atención clínica ────────────────────────────────────────
            def nota(profesional):
                inicio = timezone.now() - timedelta(minutes=10)
                cita = Cita.objects.create(
                    paciente=paciente, sede=sede_propia, profesional=profesional, servicio=servicio,
                    servicio_nombre=servicio.nombre if servicio else "QA", fecha_inicio=inicio,
                    fecha_fin=inicio + timedelta(minutes=30), duracion_min=30, estado=Cita.Estado.EN_CURSO,
                    canal_confirmacion=paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
                )
                return api.post("/api/v1/historia-clinica/notas/", {
                    "historia": str(paciente.historia_clinica.id), "cita": str(cita.id),
                }, format="json")
            puede_notas = "historia.notas.crear" in perms
            if user.es_profesional or user.rol == "profesional":
                correr("nota clínica en su propia cita", puede_notas, lambda: nota(user))
            correr("nota clínica en cita de otro profesional", puede_notas and not atiende_solo_lo_propio(user),
                   lambda: nota(pro_ambas))

            # Flujo "Llegó" de su propia cita (asistente de llegada): cada paso
            # por separado, desde una cita pendiente de hoy.
            if user.es_profesional:
                def paso_llegada(pasos):
                    inicio = timezone.now() + timedelta(minutes=30)
                    cita = Cita.objects.create(
                        paciente=paciente, sede=sede_propia, profesional=user, servicio=servicio,
                        servicio_nombre=servicio.nombre if servicio else "QA", fecha_inicio=inicio,
                        fecha_fin=inicio + timedelta(minutes=30), duracion_min=30, estado=Cita.Estado.PENDIENTE,
                        canal_confirmacion=paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
                    )
                    r = None
                    for url, datos in pasos:
                        r = api.post(f"/api/v1/agenda/citas/{cita.id}/{url}/", datos, format="json")
                        if r.status_code >= 300:
                            break
                    return r
                llego = ("cambiar_estado", {"estado": "confirmada", "medio": "presencial"})
                correr("llegada de su cita: marcar llegó", True, lambda: paso_llegada([llego]))
                # 400/502 sin webhook o Documenso en local: lo que importa es que no sea 403 (QA-02).
                correr("llegada de su cita: iniciar check-in", None,
                       lambda: paso_llegada([llego, ("iniciar_checkin", {})]), "no debe ser 403")
                correr("llegada de su cita: registro de asistencia", None,
                       lambda: paso_llegada([llego, ("iniciar_registro_asistencia", {})]), "no debe ser 403")
                correr("llegada de su cita: pasar a en espera", True,
                       lambda: paso_llegada([llego, ("cambiar_estado", {"estado": "en_espera"})]))

            # ── Cotizaciones ────────────────────────────────────────────
            def cotizar(precio=None, solicitar=None):
                item = {"descripcion": "QA servicio", "num_citas": 1, "valor_unitario": "350000.00", "descuento_porcentaje": "0.00"}
                if precio is not None and servicio:
                    item = {"tipo": "procedimiento", "procedimiento": str(servicio.id), "descripcion": servicio.nombre,
                            "num_citas": 1, "valor_unitario": str(precio), "descuento_porcentaje": "0.00"}
                datos = {
                    "paciente": str(paciente.id), "validez_dias": 30, "sede": str(sede_propia.id), "items": [item],
                    "formas_pago": [{"tipo": str(efectivo.id), "descripcion": "Contado", "valor": item["valor_unitario"]}],
                }
                if solicitar:
                    datos["solicitar_autorizacion"] = solicitar
                return api.post("/api/v1/cotizaciones/", datos, format="json")
            gestiona = "cotizaciones.gestionar" in perms
            correr("crear cotización", gestiona, cotizar)
            if servicio:
                lista = precio_lista(servicio, sede_propia.id)
                rebajado = (Decimal(lista) * Decimal("0.5")).quantize(Decimal("1"))
                correr("cotizar por debajo del precio sin motivo", gestiona and "cotizaciones.cambiar_precio" in perms,
                       lambda: cotizar(rebajado), "sin cambiar_precio debe responder PRECIO_REQUIERE_AUTORIZACION")
                correr("cotizar por debajo del precio pidiendo autorización", gestiona,
                       lambda: cotizar(rebajado, "Paciente frecuente"))

            otra = Cotizacion.objects.get(id=ids["cotizacion_b"] if sede_propia == sede_a else ids["cotizacion_a"])
            correr(f"editar cotización de otra sede ({otra.sede.nombre}, de {otra.profesional or 'nadie'})",
                   gestiona and ve_todas and not ve_solo_su_actividad_comercial(user),
                   lambda: api.patch(f"/api/v1/cotizaciones/{otra.id}/", {"notas": "QA edición ajena"}, format="json"),
                   "quien no ve esa sede o solo ve lo propio no debería poder editarla")
            propia_sede = Cotizacion.objects.filter(clinica=clinica, sede=sede_propia, estado="borrador", activo=True).exclude(profesional=user).first()
            if propia_sede:
                correr("editar cotización de su sede hecha por otra persona",
                       gestiona and not ve_solo_su_actividad_comercial(user),
                       lambda: api.patch(f"/api/v1/cotizaciones/{propia_sede.id}/", {"notas": "QA edición"}, format="json"),
                       "quien solo ve lo propio no la ve en el listado")

            # ── Cobros y caja ───────────────────────────────────────────
            if servicio and efectivo:
                correr("cobro libre con pago", "cobros.crear" in perms, lambda: api.post("/api/v1/cobros/cobros/", {
                    "origen": "libre", "paciente": str(paciente.id), "sede": str(sede_propia.id),
                    "items": [{"tipo": "servicio", "servicio": str(servicio.id), "precio_unitario": str(precio_lista(servicio, sede_propia.id)), "cantidad": "1"}],
                    "pagos": [{"medio_pago": str(efectivo.id), "valor": str(precio_lista(servicio, sede_propia.id))}],
                }, format="json"))
            def abrir_caja():
                SesionCaja.objects.filter(caja=cajas[sede_propia.id], estado=SesionCaja.Estado.ABIERTA).delete()
                return api.post("/api/v1/caja/sesiones/abrir/", {"caja": str(cajas[sede_propia.id].id), "monto_apertura": "0"}, format="json")
            # Quien registra gastos también abre la caja (QA-04).
            correr("abrir la caja de su sede", tiene_alguno("caja.cierre.realizar", "caja.gastos.registrar"), abrir_caja)
            for caja in cajas.values():
                if caja.sesion_abierta is None:
                    SesionCaja.objects.create(caja=caja, monto_apertura=0, abierta_por=admin)
            correr("registrar gasto", "caja.gastos.registrar" in perms, lambda: api.post("/api/v1/caja/gastos/", {
                "sede": str(sede_propia.id), "categoria": str(categoria.id), "descripcion": "QA papel", "valor": "12000",
            }, format="json"))
            correr("registrar gasto en otra sede", ("caja.gastos.registrar" in perms) and ve_todas, lambda: api.post("/api/v1/caja/gastos/", {
                "sede": str(sede_ajena.id), "categoria": str(categoria.id), "descripcion": "QA papel", "valor": "12000",
            }, format="json"))

            # ── Seguimiento ─────────────────────────────────────────────
            correr("registrar interesado", "seguimiento.oportunidades.gestionar" in perms, lambda: api.post(
                "/api/v1/seguimiento/oportunidades/",
                {"nombre": f"Interesada {clave}", "telefono": f"301 555 {n:04d}", "interes": "Depilación", "origen": "instagram"},
                format="json"))

            print(clave, sum(1 for r in resultados if r["perfil"] == clave and r["hallazgo"]), "hallazgos")
        transaction.set_rollback(True)

    (AQUI / "qa_escenarios.json").write_text(json.dumps(resultados, indent=1, ensure_ascii=False, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
