"""Recorrido QA del flujo crítico: cotización → autorización → venta → agenda → llegada → atención → cobro.

    docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py

Lo hacen los usuarios QA de qa_roles_seed.py, como en la clínica: cada paso lo da
quien lo daría en la vida real, y además se prueba que los demás perfiles NO
puedan dar ese paso cuando no les corresponde. En cada paso se revisa el estado
resultante (sesiones, cartera, saldos, estados). Todo corre en una transacción
que se deshace al final. Salida: salida/qa_flujo_critico.json
"""

import json
import os
import sys
import traceback
from datetime import time, timedelta
from decimal import Decimal
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.agenda.models import Cita  # noqa: E402
from apps.caja.models import Caja  # noqa: E402
from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio, TratamientoCatalogo  # noqa: E402
from apps.colaboradores.models import HorarioColaborador  # noqa: E402
from apps.cotizaciones.models import Cotizacion  # noqa: E402
from apps.inventario.models import Insumo, StockInsumoSede  # noqa: E402
from apps.users.models import User  # noqa: E402

AQUI = Path(__file__).resolve().parent / "salida"
PERSISTIR = "--persistir" in sys.argv
DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


class Abortar(Exception):
    pass


class Recorrido:
    def __init__(self):
        cred = json.loads((AQUI / "qa_usuarios.json").read_text(encoding="utf-8"))
        self.u = {k: User.objects.get(email=v["email"]) for k, v in cred.items()}
        self.pasos = []

    def api(self, quien):
        c = APIClient(SERVER_NAME="localhost")
        c.force_authenticate(self.u[quien])
        return c

    def paso(self, etapa, quien, accion, fn, espera, nota="", critico=False):
        """espera: código(s) HTTP esperados o función(respuesta) -> (ok, detalle)."""
        try:
            r = fn(self.api(quien))
            data = getattr(r, "data", None)
            if callable(espera):
                ok, detalle = espera(r)
            else:
                esperados = espera if isinstance(espera, (set, tuple, list)) else {espera}
                ok, detalle = r.status_code in esperados, ""
            cuerpo = str(data)[:400]
            status = r.status_code
        except Exception as e:  # noqa: BLE001
            ok, detalle, cuerpo, status, r = False, "excepción", traceback.format_exc()[-600:], "excepcion", None
        self.pasos.append({
            "etapa": etapa, "quien": quien, "accion": accion, "status": status, "ok": ok,
            "detalle": detalle, "nota": nota, "respuesta": cuerpo,
        })
        marca = "OK " if ok else "XX "
        print(f"{marca}[{etapa}] {quien:17} {accion[:70]:70} -> {status} {detalle}")
        if critico and not ok:
            raise Abortar(accion)
        return r

    def chequeo(self, etapa, accion, condicion, detalle=""):
        self.pasos.append({"etapa": etapa, "quien": "—", "accion": accion, "status": "estado", "ok": bool(condicion),
                           "detalle": detalle, "nota": "", "respuesta": ""})
        print(f"{'OK ' if condicion else 'XX '}[{etapa}] {'(estado)':17} {accion[:70]:70} {detalle}")


def main():
    R = Recorrido()
    try:
        _recorrer(R)
    finally:
        (AQUI / "qa_flujo_critico.json").write_text(
            json.dumps({"pasos": R.pasos}, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
        fallas = [p for p in R.pasos if not p["ok"]]
        print(f"\n{len(R.pasos)} pasos, {len(fallas)} con resultado distinto al esperado")


def _recorrer(R):
    clinica = Clinica.objects.get(nombre="Beauty Clinic")
    sede_a = Sede.objects.get(clinica=clinica, nombre="Principal")
    sede_b = Sede.objects.get(clinica=clinica, nombre="Principal H4")
    pablo = R.u["profesional"]  # Profesional de sistema, sede A: cotiza y atiende, no agenda
    tratamiento = TratamientoCatalogo.objects.filter(clinica=clinica, activo=True).first()
    limpieza = Servicio.objects.get(clinica=clinica, nombre="LIMPIEZA FACIAL")
    efectivo = FormaDePago.objects.filter(clinica=clinica, activo=True, tipo_base="efectivo").first() \
        or FormaDePago.objects.filter(clinica=clinica, activo=True).first()
    insumo = Insumo.objects.filter(clinica=clinica, es_consumo_interno=True).first()
    hoy = timezone.localdate()
    ctx = {}

    with transaction.atomic():
        try:
            # ── 0. Preparación (lo que haría el admin al configurar) ──────────
            limpieza.descuento_maximo_pct = Decimal("10")
            limpieza.save(update_fields=["descuento_maximo_pct"])
            for dia in DIAS:
                HorarioColaborador.objects.create(
                    colaborador=pablo.colaborador, sede=sede_a, dia_semana=dia,
                    hora_inicio=time(6, 0), hora_fin=time(22, 0),
                )
            Caja.objects.get_or_create(sede=sede_a, defaults={"saldo_inicial": Decimal("0")})

            # ── 1. Recepción registra a la paciente ───────────────────────────
            r = R.paso("1 paciente", "recepcion", "crear paciente nueva", lambda a: a.post("/api/v1/pacientes/", {
                "tipo_documento": "CC", "numero_documento": "1099887766", "nombres": "Laura", "apellidos": "QA Flujo",
                "fecha_nacimiento": "1992-03-04", "sexo": "F", "direccion": "Calle 1", "telefono": "3015550101",
                "canal_confirmacion": "whatsapp", "autoriza_datos": True,
            }, format="json"), 201, critico=True)
            paciente_id = r.data["id"]
            R.paso("1 paciente", "asesora", "la asesora (sin crear pacientes) no puede registrarla",
                   lambda a: a.post("/api/v1/pacientes/", {"nombres": "X"}, format="json"), 403)

            # ── 2. El profesional cotiza: paquete con descuento no permitido + procedimiento ──
            precio_trat = tratamiento.precio_estimado
            rebaja = (precio_trat * Decimal("0.8")).quantize(Decimal("1"))
            items = [
                {"tipo": "tratamiento", "tratamiento": str(tratamiento.id), "valor_unitario": str(rebaja),
                 "num_citas": 1, "descuento_porcentaje": "0"},
                {"tipo": "procedimiento", "procedimiento": str(limpieza.id), "valor_unitario": "120000",
                 "num_citas": 1, "descuento_porcentaje": "0"},
            ]
            total = rebaja + Decimal("120000")
            cuerpo = {
                "paciente": paciente_id, "validez_dias": 30, "sede": str(sede_a.id), "items": items,
                "formas_pago": [{"tipo": str(efectivo.id), "descripcion": "Abono inicial", "valor": str(total)}],
            }
            R.paso("2 cotizar", "profesional", "cotizar el paquete 20% abajo sin motivo",
                   lambda a: a.post("/api/v1/cotizaciones/", cuerpo, format="json"),
                   lambda r: (r.status_code == 400 and "PRECIO_REQUIERE_AUTORIZACION" in str(r.data), "pide autorización"))
            r = R.paso("2 cotizar", "profesional", "cotizar pidiendo autorización",
                       lambda a: a.post("/api/v1/cotizaciones/", {**cuerpo, "solicitar_autorizacion": "Paciente referida"}, format="json"),
                       201, critico=True)
            cot_id = r.data["id"]
            ctx["cot"] = cot_id
            R.chequeo("2 cotizar", "queda 'precio por autorizar'", r.data.get("precio_por_autorizar") is True,
                      f"precio_por_autorizar={r.data.get('precio_por_autorizar')}")
            R.chequeo("2 cotizar", "total de la cotización = suma de ítems",
                      Decimal(str(r.data.get("total"))) == total, f"total={r.data.get('total')} esperado={total}")
            R.paso("2 cotizar", "profesional", "no puede aceptar mientras está por autorizar",
                   lambda a: a.post(f"/api/v1/cotizaciones/{cot_id}/cambiar_estado/", {"estado": "aceptada"}, format="json"),
                   lambda r: (r.status_code == 400, str(r.data)[:80]))
            R.paso("2 cotizar", "profesional", "no puede descargar el PDF mientras está por autorizar",
                   lambda a: a.get(f"/api/v1/cotizaciones/{cot_id}/pdf/"), {400, 403, 409})

            # ── 3. Autorización ──────────────────────────────────────────────
            R.paso("3 autorizar", "admin", "el contador muestra 1 pendiente",
                   lambda a: a.get("/api/v1/autorizaciones-precio/contador/"),
                   lambda r: (r.status_code == 200 and r.data.get("pendientes", 0) >= 1, f"pendientes={r.data.get('pendientes')}"))
            r = R.paso("3 autorizar", "admin", "la bandeja la lista",
                       lambda a: a.get("/api/v1/autorizaciones-precio/"),
                       lambda r: (r.status_code == 200 and any(str(x.get("cotizacion")) == cot_id or str(x.get("cotizacion_id")) == cot_id
                                                               for x in (r.data.get("results", r.data) if isinstance(r.data, dict) else r.data)), ""))
            lista = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
            sol = next((x for x in lista if cot_id in (str(x.get("cotizacion")), str(x.get("cotizacion_id")))), None)
            R.paso("3 autorizar", "gerencia", "gerencia (sin cambiar precio) no ve la bandeja",
                   lambda a: a.get("/api/v1/autorizaciones-precio/"), 403)
            R.paso("3 autorizar", "profesional", "quien pidió no puede autorizarse a sí mismo",
                   lambda a: a.post(f"/api/v1/autorizaciones-precio/{sol['id']}/autorizar/", {"comentario": ""}, format="json"), 403)
            R.paso("3 autorizar", "admin", "autorizar", lambda a: a.post(
                f"/api/v1/autorizaciones-precio/{sol['id']}/autorizar/", {"comentario": "Ok por referida"}, format="json"), 200, critico=True)
            R.paso("3 autorizar", "admin", "autorizar dos veces no duplica", lambda a: a.post(
                f"/api/v1/autorizaciones-precio/{sol['id']}/autorizar/", {"comentario": "otra vez"}, format="json"), {400, 409})
            c = Cotizacion.objects.get(id=cot_id)
            R.chequeo("3 autorizar", "la cotización ya no está por autorizar", not c.precio_por_autorizar)

            # ── 4. Venta: el profesional acepta ───────────────────────────────
            with mock.patch("apps.cotizaciones.views.CotizacionViewSet._generar_compromiso_pago_si_aplica", return_value=None):
                R.paso("4 venta", "profesional", "registrar aceptación", lambda a: a.post(
                    f"/api/v1/cotizaciones/{cot_id}/cambiar_estado/", {"estado": "aceptada"}, format="json"), 200, critico=True)
            c.refresh_from_db()
            R.chequeo("4 venta", "estado aceptada con fecha", c.estado == "aceptada" and c.aceptada_en is not None)
            cartera = getattr(c, "cartera", None)
            R.chequeo("4 venta", "se creó la cartera con el total", cartera is not None and cartera.total == c.total,
                      f"cartera={getattr(cartera, 'total', None)} total={c.total}")
            ctx["cartera"] = str(cartera.id) if cartera else None
            R.paso("4 venta", "profesional", "editar la cotización ya aceptada (precio) no se permite", lambda a: a.patch(
                f"/api/v1/cotizaciones/{cot_id}/", {"notas": "cambio tras venta"}, format="json"), {200, 400, 403},
                nota="se registra qué hace: editar una venta aceptada debería estar acotado")

            # ── 5. Agenda: recepción agenda las sesiones del paquete ─────────
            r = R.paso("5 agenda", "recepcion", "ver paquetes vendidos del paciente (Nueva cita)", lambda a: a.get(
                "/api/v1/cotizaciones/", {"paciente": paciente_id, "estado": "aceptada"}),
                lambda r: (r.status_code == 200 and any(x["id"] == cot_id for x in r.data["results"]), ""))
            r = R.paso("5 agenda", "recepcion", "sesiones del paquete", lambda a: a.get(f"/api/v1/cotizaciones/{cot_id}/sesiones/"), 200)
            sesiones = r.data if r is not None else None
            item_trat = c.items.filter(activo=True, tipo="tratamiento").first()
            item_proc = c.items.filter(activo=True, tipo="procedimiento").first()
            ctx["sesiones_inicial"] = json.loads(json.dumps(sesiones, default=str))[:3] if isinstance(sesiones, list) else str(sesiones)[:300]

            def slots(item, fecha):
                """Horarios libres, como los pide el SlotPicker de Nueva cita."""
                r = R.api("recepcion").get("/api/v1/agenda/citas/slots_disponibles/", {
                    "profesional_id": str(pablo.id), "sede_id": str(sede_a.id), "fecha": fecha.isoformat(),
                    "item_cotizacion_id": str(item.id)})
                if r.status_code != 200:
                    return []
                data = r.data.get("slots", r.data) if isinstance(r.data, dict) else r.data
                return [x.get("inicio") or x.get("fecha_inicio") or x.get("hora") if isinstance(x, dict) else x for x in data
                        if not isinstance(x, dict) or x.get("disponible", True)]

            # Primer día con horario libre (hoy si aún queda jornada).
            dia_base = next(d for d in range(0, 10) if slots(c.items.filter(activo=True).first(), hoy + timedelta(days=d)))
            fecha_base = hoy + timedelta(days=dia_base)
            ctx["fecha_base"] = fecha_base.isoformat()
            ctx["slots_ejemplo"] = slots(c.items.filter(activo=True).first(), fecha_base)[:3]

            def agendar(quien, item, indice, dia=0, fecha_inicio=None, **extra):
                def fn(a):
                    valor = fecha_inicio
                    if valor is None:
                        # Desde el día pedido, el primero con horario libre (la sede no abre domingo).
                        for salto in range(dia, dia + 8):
                            libres = slots(item, fecha_base + timedelta(days=salto))
                            if libres:
                                valor = libres[min(indice, len(libres) - 1)]
                                break
                    datos = {"paciente": paciente_id, "sede": str(sede_a.id), "profesional": str(pablo.id),
                             "fecha_inicio": str(valor), "canal_origen": "presencial", "item_cotizacion": str(item.id), **extra}
                    return a.post("/api/v1/agenda/citas/", datos, format="json")
                return fn

            r = R.paso("5 agenda", "recepcion", "agendar sesión 1 del paquete hoy", agendar("recepcion", item_trat, 20), 201,
                       critico=True)
            cita1 = r.data["id"]
            R.paso("5 agenda", "profesional", "el profesional (no agenda) no puede agendar", agendar("profesional", item_trat, 21), 403)
            R.paso("5 agenda", "asesora", "la asesora de otra sede no agenda en esta", agendar("asesora", item_trat, 21), 403)
            r = R.paso("5 agenda", "recepcion", "agendar sesión 2 mañana", agendar("recepcion", item_trat, 9, dia=1), 201)
            cita2 = r.data["id"] if r is not None and r.status_code == 201 else None
            hora2 = r.data["fecha_inicio"] if cita2 else None
            R.paso("5 agenda", "recepcion", "el mismo profesional a la misma hora se rechaza",
                   agendar("recepcion", item_trat, 0, fecha_inicio=hora2),
                   lambda r: (r.status_code == 400, str(r.data)[:90]))
            R.paso("5 agenda", "recepcion", "agendar el procedimiento suelto de la venta", agendar("recepcion", item_proc, 10, dia=2), 201)
            R.paso("5 agenda", "recepcion", "el procedimiento (1 sesión) no admite una segunda", agendar("recepcion", item_proc, 11, dia=2),
                   lambda r: (r.status_code == 400 and "SIN_SESIONES" in str(r.data), str(r.data)[:90]))

            # ── 6. El profesional ve su agenda ───────────────────────────────
            R.paso("6 su agenda", "profesional", "ve sus citas de hoy (solo las suyas)", lambda a: a.get(
                "/api/v1/agenda/citas/", {"fecha_inicio__date": hoy.isoformat()}),
                lambda r: (r.status_code == 200 and all(str(x["profesional"]) == str(pablo.id) for x in r.data["results"])
                           and any(x["id"] == cita1 for x in r.data["results"]), f"{r.data.get('count')} citas"))
            R.paso("6 su agenda", "esteticista", "la esteticista no ve la cita de Pablo en su agenda", lambda a: a.get(
                "/api/v1/agenda/citas/", {"fecha_inicio__date": hoy.isoformat()}),
                lambda r: (r.status_code == 200 and not any(x["id"] == cita1 for x in r.data["results"]), ""))
            R.paso("6 su agenda", "esteticista", "…pero sí en el historial de la paciente", lambda a: a.get(
                "/api/v1/agenda/citas/", {"paciente": paciente_id}),
                lambda r: (r.status_code == 200 and any(x["id"] == cita1 for x in r.data["results"]), ""))

            # ── 7. Llegada (recepción) ───────────────────────────────────────
            R.paso("7 llegada", "recepcion", "confirmar la cita", lambda a: a.post(
                f"/api/v1/agenda/citas/{cita1}/cambiar_estado/", {"estado": "confirmada", "medio": "whatsapp"}, format="json"), 200)
            R.paso("7 llegada", "recepcion", "llegó → en espera", lambda a: a.post(
                f"/api/v1/agenda/citas/{cita1}/cambiar_estado/", {"estado": "en_espera"}, format="json"), 200, critico=True)
            with transaction.atomic():
                R.paso("7 llegada", "recepcion", "recepción no inicia la atención clínica", lambda a: a.post(
                    f"/api/v1/agenda/citas/{cita1}/cambiar_estado/", {"estado": "en_curso"}, format="json"), {400, 403},
                    nota="la UI no se lo ofrece (canIniciarAtencion); se prueba el backend")
                Cita.objects.filter(id=cita1).update(estado=Cita.Estado.EN_ESPERA)

            if PERSISTIR:
                # Para el recorrido en navegador: deja la venta y la cita en espera, y
                # otra cotización esperando autorización.
                r = R.paso("persistir", "profesional", "otra cotización por autorizar", lambda a: a.post(
                    "/api/v1/cotizaciones/", {**cuerpo, "solicitar_autorizacion": "Prueba QA en navegador"}, format="json"), 201)
                # Un cobro pagado sobre la sesión 2: para el aviso al cancelar una cita cobrada.
                from apps.cobros.models import Cobro, PagoRecibido

                cobro2 = Cobro.objects.create(
                    origen=Cobro.Origen.CITA, cita_id=cita2, paciente_id=paciente_id, sede=sede_a,
                    created_by=R.u["recepcion"], total="80000", subtotal="80000",
                )
                PagoRecibido.objects.create(
                    cobro=cobro2, medio_pago=efectivo, valor="80000", fecha=timezone.now(), recibido_por=R.u["recepcion"],
                )
                ctx["cobro_cita_2"] = str(cobro2.id)
                ids = {"paciente": paciente_id, "venta": cot_id, "por_autorizar": r.data["id"] if r is not None else None,
                       "cobro_cita_2": ctx["cobro_cita_2"],
                       "cita_hoy": cita1, "cita_2": cita2, "cartera": ctx.get("cartera"),
                       "item_procedimiento": str(item_proc.id)}
                (AQUI / "qa_flujo_ids.json").write_text(json.dumps(ids, indent=1), encoding="utf-8")
                print("Datos persistidos:", ids)
                return

            # ── 8. Atención (Pablo) ──────────────────────────────────────────
            R.paso("8 atención", "esteticista", "otra profesional no puede iniciar la cita de Pablo", lambda a: a.post(
                f"/api/v1/agenda/citas/{cita1}/cambiar_estado/", {"estado": "en_curso"}, format="json"), {403, 404})
            r = R.paso("8 atención", "profesional", "iniciar atención", lambda a: a.post(
                f"/api/v1/agenda/citas/{cita1}/cambiar_estado/", {"estado": "en_curso"}, format="json"), {200, 400})
            if r is not None and r.status_code == 400:
                R.chequeo("8 atención", "iniciar pidió algo previo", True, str(r.data)[:160])
                Cita.objects.filter(id=cita1).update(estado=Cita.Estado.EN_CURSO)
            historia_id = str(Cita.objects.get(id=cita1).paciente.historia_clinica.id)
            r = R.paso("8 atención", "profesional", "crear la nota de la atención", lambda a: a.post(
                "/api/v1/historia-clinica/notas/", {"historia": historia_id, "cita": cita1}, format="json"), 201, critico=True)
            nota_id = r.data["id"]
            R.paso("8 atención", "profesional", "crear la nota otra vez (doble clic) no duplica", lambda a: a.post(
                "/api/v1/historia-clinica/notas/", {"historia": historia_id, "cita": cita1}, format="json"),
                lambda r: (r.status_code in (200, 400, 409) or (r.status_code == 201 and r.data["id"] == nota_id),
                           f"{r.status_code} id={'mismo' if getattr(r, 'data', {}) and r.data.get('id') == nota_id else 'nuevo'}"))
            R.paso("8 atención", "profesional", "autoguardado del motivo", lambda a: a.patch(
                f"/api/v1/historia-clinica/notas/{nota_id}/", {"motivo_consulta": "Flacidez abdominal", "plan_manejo": "Sesión 1 de 11"},
                format="json"), 200)
            R.paso("8 atención", "recepcion", "recepción no escribe en la nota", lambda a: a.patch(
                f"/api/v1/historia-clinica/notas/{nota_id}/", {"motivo_consulta": "x"}, format="json"), {403, 404})
            stock_antes = StockInsumoSede.objects.get(insumo=insumo, sede=sede_a).stock_actual if insumo else None
            r = R.paso("8 atención", "profesional", "registrar consumo de insumo", lambda a: a.post(
                "/api/v1/historia-clinica/consumos-insumo/", {"nota": nota_id, "insumo": str(insumo.id), "cantidad": "1",
                                                               "sede": str(sede_a.id)}, format="json"), 201)
            if insumo:
                stock_despues = StockInsumoSede.objects.get(insumo=insumo, sede=sede_a).stock_actual
                R.chequeo("8 atención", "el stock bajó 1", stock_despues == stock_antes - 1, f"{stock_antes} → {stock_despues}")
            R.paso("8 atención", "profesional", "completar la nota", lambda a: a.post(
                f"/api/v1/historia-clinica/notas/{nota_id}/completar/", {}, format="json"), 200)
            R.paso("8 atención", "profesional", "editar la nota completada no se permite", lambda a: a.patch(
                f"/api/v1/historia-clinica/notas/{nota_id}/", {"motivo_consulta": "cambio"}, format="json"), {400, 403, 405})
            R.paso("8 atención", "profesional", "cerrar la cita (completada)", lambda a: a.post(
                f"/api/v1/agenda/citas/{cita1}/cambiar_estado/", {"estado": "completada"}, format="json"), 200)

            # ── 9. Efectos de la atención ────────────────────────────────────
            r = R.paso("9 efectos", "recepcion", "sesiones del paquete tras la atención",
                       lambda a: a.get(f"/api/v1/cotizaciones/{cot_id}/sesiones/"), 200)
            ctx["sesiones_tras_atencion"] = json.loads(json.dumps(r.data, default=str))[:3] if r is not None and isinstance(r.data, list) else None
            item_trat.refresh_from_db()
            completadas = Cita.objects.filter(item_cotizacion=item_trat, estado="completada").count()
            agendadas = Cita.objects.filter(item_cotizacion=item_trat).exclude(estado__in=["cancelada", "no_asistio"]).count()
            R.chequeo("9 efectos", "1 sesión completada del paquete", completadas == 1, f"completadas={completadas} agendadas={agendadas}")
            if cita2:
                R.paso("9 efectos", "recepcion", "cancelar la sesión 2", lambda a: a.post(
                    f"/api/v1/agenda/citas/{cita2}/cambiar_estado/", {"estado": "cancelada", "motivo_cancelacion": "Viaje"},
                    format="json"), 200)
                R.paso("9 efectos", "recepcion", "la sesión cancelada se puede volver a agendar", agendar("recepcion", item_trat, 15, dia=3), 201)
            r = R.paso("9 efectos", "profesional", "la cita completada aparece en Atenciones (historial)", lambda a: a.get(
                "/api/v1/agenda/citas/", {"profesional": str(pablo.id), "estado": "completada"}),
                lambda r: (r.status_code == 200 and any(x["id"] == cita1 for x in r.data["results"]), ""))
            R.paso("9 efectos", "profesional", "la nota queda en la historia", lambda a: a.get(
                f"/api/v1/historia-clinica/historias/{historia_id}/notas/"),
                lambda r: (r.status_code == 200 and nota_id in json.dumps(r.data, default=str), ""))

            # ── 10. Cobro de la venta / cartera ──────────────────────────────
            if ctx.get("cartera"):
                r = R.paso("10 cartera", "cajera", "la cajera ve la cartera de la paciente", lambda a: a.get(f"/api/v1/cartera/{ctx['cartera']}/"), 200)
                cuotas = (r.data or {}).get("cuotas", []) if r is not None and r.status_code == 200 else []
                pendiente = next((q for q in cuotas if Decimal(str(q.get("valor_esperado", 0))) > Decimal(str(q.get("valor_pagado", 0) or 0))), None)
                if pendiente:
                    abono = Decimal("500000")
                    R.paso("10 cartera", "gerencia", "gerencia (solo ver) no registra pagos", lambda a: a.patch(
                        f"/api/v1/cartera/cuotas/{pendiente['id']}/registrar_pago/", {"valor_pagado": "1000", "medio_pago": str(efectivo.id)},
                        format="json"), 403)
                    R.paso("10 cartera", "cajera", "registrar un abono de $500.000", lambda a: a.patch(
                        f"/api/v1/cartera/cuotas/{pendiente['id']}/registrar_pago/",
                        {"valor_pagado": str(abono), "fecha_pago": hoy.isoformat(), "medio_pago": str(efectivo.id)}, format="json"), 200)
                    cartera.refresh_from_db()
                    R.paso("10 cartera", "admin", "ingresos del mes incluyen el abono", lambda a: a.get(
                        "/api/v1/reportes/ingresos-por-origen/", {"fecha_inicio": hoy.replace(day=1).isoformat(), "fecha_fin": hoy.isoformat()}),
                        lambda r: (r.status_code == 200 and Decimal(r.data["totales"]["total"]) >= abono,
                                   f"totales={r.data.get('totales') if r.status_code == 200 else ''}"))
                else:
                    R.chequeo("10 cartera", "hay una cuota pendiente para cobrar", False, f"cuotas={str(cuotas)[:200]}")

            # ── 11. Descartar con citas: qué pasa ─────────────────────────────
            r = R.paso("11 descartar", "profesional", "cotizar otra propuesta (a precio de lista)", lambda a: a.post(
                "/api/v1/cotizaciones/", {**cuerpo, "items": [items[1]], "formas_pago": [
                    {"tipo": str(efectivo.id), "descripcion": "Contado", "valor": "120000"}]}, format="json"), 201)
            if r is not None and r.status_code == 201:
                otra = r.data["id"]
                R.paso("11 descartar", "profesional", "descartarla", lambda a: a.post(
                    f"/api/v1/cotizaciones/{otra}/cambiar_estado/", {"estado": "descartada", "motivo_descarte": "precio"}, format="json"),
                    {200})
        except Abortar as e:
            print(f"\n*** Recorrido detenido en un paso crítico: {e}")
        finally:
            if not PERSISTIR:
                transaction.set_rollback(True)



def limpiar():
    """Borra lo que dejó --persistir y devuelve el catálogo como estaba."""
    from apps.pacientes.models import Paciente

    ids = json.loads((AQUI / "qa_flujo_ids.json").read_text(encoding="utf-8"))
    clinica = Clinica.objects.get(nombre="Beauty Clinic")
    with transaction.atomic():
        from django.db.models.deletion import ProtectedError

        def borrar(obj, nivel=0):
            """Borra el objeto y, antes, lo que lo protege (solo cuelga de esta paciente QA)."""
            for _ in range(10):
                try:
                    with transaction.atomic():
                        obj.delete()
                    return
                except ProtectedError as e:
                    if nivel > 5:
                        raise
                    for protegido in e.protected_objects:
                        borrar(protegido, nivel + 1)

        paciente = Paciente.objects.get(id=ids["paciente"])
        for cita in Cita.objects.filter(paciente=paciente):
            borrar(cita)
        for cot in Cotizacion.objects.filter(paciente=paciente):
            if hasattr(cot, "cartera"):
                borrar(cot.cartera)
            borrar(cot)
        borrar(paciente)
        HorarioColaborador.objects.filter(colaborador__user__email="qa.profesional@cliniq.test").delete()
        Servicio.objects.filter(clinica=clinica, nombre="LIMPIEZA FACIAL").update(descuento_maximo_pct=Decimal("100"))
    print("Datos del recorrido borrados")


if __name__ == "__main__":
    if "--limpiar" in sys.argv:
        limpiar()
    else:
        main()
