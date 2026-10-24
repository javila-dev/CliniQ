"""Pago en línea de la suscripción (Wompi): lo usa quien administra la clínica
desde Configuración → Plan, también con la cuenta en solo lectura o suspendida
(por eso todas son `suscripcion_libre`)."""

import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clinicas.models import Plan
from apps.core.logging import get_client_ip
from apps.users.permissions import IsAdmin, IsSuperAdmin, get_clinica_activa

from . import alegra, cobros, facturacion, wompi
from .models import CobroSuscripcion, EventoWompi, FacturaSaaS, Suscripcion
from .serializers import (
    CambiarPlanSerializer,
    CobroSerializer,
    ContratarSerializer,
    DatosFacturacionSerializer,
    SuscripcionSerializer,
    TarjetaNuevaSerializer,
)
from .services import actualizar_estado

logger = logging.getLogger(__name__)


def _error(mensaje: str, code: str = "PAGO_NO_PERMITIDO", estado=status.HTTP_400_BAD_REQUEST):
    return Response({"error": mensaje, "code": code}, status=estado)


class _PagoBase(APIView):
    permission_classes = (IsAdmin,)
    suscripcion_libre = True

    def suscripcion(self, request) -> Suscripcion:
        clinica = get_clinica_activa(request)
        s = get_object_or_404(Suscripcion.objects.select_related("clinica__plan", "fuente_pago"), clinica=clinica)
        return actualizar_estado(s)

    def aceptacion(self, request, datos) -> dict:
        return {
            "acceptance_token": datos["acceptance_token"],
            "accept_personal_auth": datos["accept_personal_auth"],
            "aceptado_at": timezone.now().isoformat(),
            "ip": get_client_ip(request),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
        }


# Funciones que dependen del plan, en el orden en que se muestran.
FUNCIONES_PLAN = (
    ("modulo_estetico_habilitado", "Módulo estético"),
    ("modulo_obesidad_habilitado", "Módulo de obesidad"),
    ("facial_verificacion_habilitada", "Verificación facial"),
    ("whatsapp_habilitado", "WhatsApp"),
    ("whatsapp_numero_propio_habilitado", "WhatsApp con número propio"),
)


class ConfigPagoView(_PagoBase):
    """Lo que necesita la pantalla de pago: llave pública, políticas de Wompi a
    aceptar, planes con precios y datos de facturación guardados."""

    def get(self, request):
        s = self.suscripcion(request)
        clinica = s.clinica
        if not wompi.configurado():
            return Response({"disponible": False})
        try:
            aceptacion = wompi.tokens_aceptacion()
        except wompi.WompiError as exc:
            return _error(str(exc), "PASARELA_NO_DISPONIBLE", status.HTTP_503_SERVICE_UNAVAILABLE)

        planes = []
        for plan in Plan.objects.filter(activo=True, precio__isnull=False).order_by("precio"):
            if not (plan.mostrar_publico or plan.pk == clinica.plan_id):
                continue
            try:
                cobros.validar_limites(clinica, plan)
                bloqueo = ""
            except cobros.CobroNoPermitido as exc:
                bloqueo = str(exc)
            planes.append({
                "id": str(plan.pk), "nombre": plan.nombre, "descripcion": plan.descripcion,
                "max_usuarios": plan.max_usuarios, "max_sedes": plan.max_sedes,
                "precio_mensual": cobros.precio_periodo(plan, Suscripcion.Ciclo.MENSUAL),
                "precio_anual": cobros.precio_periodo(plan, Suscripcion.Ciclo.ANUAL),
                "descuento_anual_pct": plan.descuento_anual_pct,
                # Lo que la clínica tiene hoy (p. ej. en la prueba) y este plan no incluye.
                "pierdes": [nombre for campo, nombre in FUNCIONES_PLAN if getattr(clinica, campo) and not getattr(plan, campo)],
                # El uso actual (usuarios, sedes) supera el plan: no se puede contratar.
                "bloqueo": bloqueo,
            })

        return Response({
            "disponible": True,
            "ambiente": settings.WOMPI_ENV,
            "llave_publica": settings.WOMPI_PUBLIC_KEY,
            "url_api": wompi.base_url(),
            "aceptacion": aceptacion,
            "planes": planes,
            "plan_actual_id": str(clinica.plan_id) if clinica.plan_id else None,
            **datos_facturacion_para_form(clinica, request.user),
            "suscripcion": SuscripcionSerializer(s).data,
        })


def datos_facturacion_para_form(clinica, usuario) -> dict:
    """Los datos guardados (o precargados con lo del registro), los campos que
    faltan y los catálogos del formulario."""
    from .ubicacion import catalogo
    from .validacion_facturacion import RESPONSABILIDADES, dv_nit, limpiar_documento, problemas

    guardados = getattr(clinica, "datos_facturacion", None)
    if guardados is not None:
        datos = DatosFacturacionSerializer(guardados).data
    else:
        nit = limpiar_documento((clinica.nit or "").split("-")[0])
        datos = {
            "tipo_persona": "juridica", "tipo_documento": "NIT", "numero_documento": nit,
            "dv": dv_nit(nit) if nit.isdigit() else "", "razon_social": clinica.nombre, "nombres": "", "apellidos": "",
            "email_facturacion": clinica.email or usuario.email, "telefono": clinica.telefono or "",
            "direccion": "", "ciudad": "", "departamento": "", "responsable_iva": False, "responsabilidades_fiscales": [],
        }
    return {
        "datos_facturacion": datos,
        "datos_facturacion_faltantes": problemas(datos),
        "ubicaciones": catalogo(),
        "responsabilidades_fiscales": RESPONSABILIDADES,
    }


class DatosFacturacionView(_PagoBase):
    """Ver y corregir los datos de facturación sin pagar (también con pago manual)."""

    def get(self, request):
        s = self.suscripcion(request)
        return Response(datos_facturacion_para_form(s.clinica, request.user))

    def put(self, request):
        from .models import DatosFacturacion

        s = self.suscripcion(request)
        guardados = DatosFacturacion.objects.filter(clinica=s.clinica).first()
        datos = DatosFacturacionSerializer(guardados, data=request.data)
        datos.is_valid(raise_exception=True)
        datos.save(clinica=s.clinica)
        # Si había facturas detenidas por datos incompletos, vuelven a intentarse.
        FacturaSaaS.objects.filter(cobro__suscripcion=s).exclude(estado=FacturaSaaS.Estado.EMITIDA).update(
            estado=FacturaSaaS.Estado.PENDIENTE, intentos=0,
        )
        return Response(datos_facturacion_para_form(s.clinica, request.user))


class ContratarView(_PagoBase):
    def post(self, request):
        s = self.suscripcion(request)
        datos = ContratarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        d = datos.validated_data
        try:
            cobro = cobros.contratar(
                s, plan=d["plan"], ciclo=d["ciclo"], token=d["token"], acceptance_token=d["acceptance_token"],
                accept_personal_auth=d["accept_personal_auth"], tarjeta=d["tarjeta"],
                datos_facturacion=d["datos_facturacion"], aceptacion=self.aceptacion(request, d), usuario=request.user,
            )
        except (cobros.CobroNoPermitido, wompi.WompiError) as exc:
            return _error(str(exc))
        return Response(CobroSerializer(cobro).data, status=status.HTTP_201_CREATED)


class CobrosView(_PagoBase):
    def get(self, request):
        s = self.suscripcion(request)
        return Response(CobroSerializer(s.cobros.select_related("plan", "fuente_pago", "factura")[:24], many=True).data)


class CobroDetalleView(_PagoBase):
    """La pantalla "Procesando pago" pregunta aquí; si sigue pendiente, se consulta a Wompi."""

    def get(self, request, referencia):
        s = self.suscripcion(request)
        cobro = get_object_or_404(CobroSuscripcion.objects.select_related("plan", "fuente_pago"), suscripcion=s, referencia=referencia)
        cobros.consultar(cobro)
        cobro.refresh_from_db()
        s.refresh_from_db()
        return Response({**CobroSerializer(cobro).data, "suscripcion": SuscripcionSerializer(s).data})


class CambiarTarjetaView(_PagoBase):
    def post(self, request):
        s = self.suscripcion(request)
        datos = TarjetaNuevaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        d = datos.validated_data
        try:
            cobros.cambiar_tarjeta(
                s, token=d["token"], acceptance_token=d["acceptance_token"], accept_personal_auth=d["accept_personal_auth"],
                tarjeta=d["tarjeta"], aceptacion=self.aceptacion(request, d), usuario=request.user,
            )
        except (cobros.CobroNoPermitido, wompi.WompiError) as exc:
            return _error(str(exc))
        s.refresh_from_db()
        return Response(SuscripcionSerializer(s).data)


class CambiarPlanView(_PagoBase):
    def post(self, request):
        s = self.suscripcion(request)
        datos = CambiarPlanSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        try:
            cobro = cobros.cambiar_plan(s, plan=datos.validated_data["plan"], ciclo=datos.validated_data["ciclo"], usuario=request.user)
        except (cobros.CobroNoPermitido, wompi.WompiError) as exc:
            return _error(str(exc))
        s.refresh_from_db()
        return Response({
            "cobro": CobroSerializer(cobro).data if cobro else None,
            "suscripcion": SuscripcionSerializer(s).data,
        })


class CancelarView(_PagoBase):
    def post(self, request):
        s = self.suscripcion(request)
        try:
            cobros.cancelar(s, cancelar=bool(request.data.get("cancelar", True)), usuario=request.user)
        except cobros.CobroNoPermitido as exc:
            return _error(str(exc))
        return Response(SuscripcionSerializer(s).data)


class WebhookWompiView(APIView):
    """Eventos de Wompi. Responde 200 siempre que la firma sea válida (si no,
    Wompi reintenta); con firma inválida, 401 y no se toca nada."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        evento = request.data if isinstance(request.data, dict) else {}
        transaccion = (evento.get("data") or {}).get("transaction") or {}
        valido = wompi.evento_valido(evento)
        registro = EventoWompi.objects.create(
            evento=str(evento.get("event", ""))[:60],
            referencia=str(transaccion.get("reference", ""))[:60],
            checksum=str((evento.get("signature") or {}).get("checksum", ""))[:100],
            checksum_valido=valido,
            payload=evento,
        )
        if not valido:
            logger.warning("Evento de Wompi con firma inválida (id %s)", registro.pk)
            return Response({"ok": False}, status=status.HTTP_401_UNAUTHORIZED)

        if evento.get("event") == "transaction.updated" and registro.referencia:
            cobro = CobroSuscripcion.objects.filter(referencia=registro.referencia).first()
            if cobro is not None and int(transaccion.get("amount_in_cents") or 0) == cobro.monto_centavos:
                if not cobro.wompi_transaccion_id and transaccion.get("id"):
                    cobro.wompi_transaccion_id = str(transaccion["id"])
                    cobro.save(update_fields=["wompi_transaccion_id", "updated_at"])
                cobros.resolver(cobro, transaccion.get("status", ""), transaccion.get("status_message") or "")
            elif cobro is not None:
                logger.error("Evento de Wompi con monto distinto al cobro %s", cobro.referencia)
        registro.procesado_at = timezone.now()
        registro.save(update_fields=["procesado_at"])
        return Response({"ok": True})


class AdminCobrosView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request, clinica_id):
        qs = CobroSuscripcion.objects.filter(suscripcion__clinica_id=clinica_id).select_related("plan", "fuente_pago", "factura")[:50]
        return Response(CobroSerializer(qs, many=True).data)


def _pdf_factura(factura: FacturaSaaS | None):
    """El enlace del PDF lo da Alegra en el momento (no se guarda: puede vencer)."""
    if factura is None or factura.estado != FacturaSaaS.Estado.EMITIDA or not factura.alegra_invoice_id:
        return _error("La factura de este pago aún no está lista.", "FACTURA_NO_DISPONIBLE", status.HTTP_404_NOT_FOUND)
    try:
        data = alegra.obtener_factura(factura.alegra_invoice_id)
    except alegra.AlegraError:
        return _error("No pudimos traer la factura en este momento. Intenta de nuevo.", "ALEGRA_NO_DISPONIBLE", status.HTTP_503_SERVICE_UNAVAILABLE)
    pdf = data.get("pdf")
    url = pdf.get("url") if isinstance(pdf, dict) else pdf
    if not url:
        return _error("La factura todavía no tiene PDF.", "FACTURA_SIN_PDF", status.HTTP_404_NOT_FOUND)
    return Response({"url": url, "numero": factura.numero})


class FacturaPdfView(_PagoBase):
    def get(self, request, referencia):
        s = self.suscripcion(request)
        cobro = get_object_or_404(CobroSuscripcion.objects.select_related("factura"), suscripcion=s, referencia=referencia)
        return _pdf_factura(getattr(cobro, "factura", None))


class AdminFacturaView(APIView):
    """Consola: ver el PDF o reintentar la factura de un cobro (también si quedó en error)."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request, referencia):
        cobro = get_object_or_404(CobroSuscripcion.objects.select_related("factura"), referencia=referencia)
        return _pdf_factura(getattr(cobro, "factura", None))

    def post(self, request, referencia):
        cobro = get_object_or_404(CobroSuscripcion.objects.select_related("suscripcion__clinica", "plan"), referencia=referencia)
        if not alegra.configurado():
            return _error("Alegra no está configurado.", "ALEGRA_NO_CONFIGURADO")
        FacturaSaaS.objects.filter(cobro=cobro, estado=FacturaSaaS.Estado.ERROR).update(estado=FacturaSaaS.Estado.PENDIENTE, intentos=0)
        factura = facturacion.emitir(cobro)
        cobro.refresh_from_db()
        return Response(CobroSerializer(cobro).data, status=status.HTTP_200_OK if factura else status.HTTP_400_BAD_REQUEST)


class AdminPagosView(APIView):
    """Consola → Pagos: cobros de todas las clínicas, para conciliar con Wompi y
    Alegra. Filtros: desde/hasta (fecha del cobro), estado, factura
    (emitida | pendiente | error | sin_factura), concepto y q (clínica o referencia)."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        from datetime import date

        from django.db.models import Q, Sum

        from apps.core.pagination import PaginacionEstandar

        from .serializers import CobroAdminSerializer

        p = request.query_params
        qs = CobroSuscripcion.objects.select_related("suscripcion__clinica", "plan", "fuente_pago", "factura")

        def _fecha(nombre):
            try:
                return date.fromisoformat(p.get(nombre) or "")
            except ValueError:
                return None

        if desde := _fecha("desde"):
            qs = qs.filter(created_at__date__gte=desde)
        if hasta := _fecha("hasta"):
            qs = qs.filter(created_at__date__lte=hasta)
        if p.get("concepto"):
            qs = qs.filter(concepto=p["concepto"])
        if q := (p.get("q") or "").strip():
            qs = qs.filter(Q(suscripcion__clinica__nombre__icontains=q) | Q(referencia__icontains=q) | Q(factura__numero__icontains=q))
        factura = p.get("factura")
        if factura == "sin_factura":
            qs = qs.filter(estado=CobroSuscripcion.Estado.APROBADO, factura__isnull=True)
        elif factura in FacturaSaaS.Estado.values:
            qs = qs.filter(factura__estado=factura)

        # Totales del periodo filtrado, sin el filtro de estado (para ver aprobado vs. rechazado).
        aprobados = qs.filter(estado=CobroSuscripcion.Estado.APROBADO)
        resumen = {
            "aprobados": aprobados.count(),
            "total_aprobado": (aprobados.aggregate(t=Sum("monto_centavos"))["t"] or 0) / 100,
            "rechazados": qs.filter(estado__in=[CobroSuscripcion.Estado.RECHAZADO, CobroSuscripcion.Estado.ERROR]).count(),
            "pendientes": qs.filter(estado=CobroSuscripcion.Estado.PENDIENTE).count(),
            "facturas_con_problema": aprobados.filter(
                Q(factura__isnull=True) | ~Q(factura__estado=FacturaSaaS.Estado.EMITIDA)
            ).count(),
        }
        if p.get("estado"):
            qs = qs.filter(estado=p["estado"]) if p["estado"] != "fallido" else qs.filter(
                estado__in=[CobroSuscripcion.Estado.RECHAZADO, CobroSuscripcion.Estado.ERROR]
            )

        paginador = PaginacionEstandar()
        pagina = paginador.paginate_queryset(qs.order_by("-created_at"), request, view=self)
        respuesta = paginador.get_paginated_response(CobroAdminSerializer(pagina, many=True).data)
        respuesta.data["resumen"] = resumen
        return respuesta
