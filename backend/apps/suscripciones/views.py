from urllib.parse import quote

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.authorization import user_is_tenant_admin
from apps.users.permissions import IsAdmin, IsSuperAdmin, get_clinica_activa

from . import seguimiento, services
from .models import NotaSeguimientoClinica, Suscripcion
from .serializers import (
    ExtenderPruebaSerializer,
    NotaSeguimientoSerializer,
    PagoManualSerializer,
    PerfilBienvenidaSerializer,
    SuscripcionAdminSerializer,
    SuscripcionSerializer,
)


class MiSuscripcionView(APIView):
    """Estado de la cuenta de la clínica: lo lee el aviso fijo de la app.

    Responde aunque la cuenta esté suspendida (es lo que muestra la pantalla de
    reactivar). Sin suscripción, la cuenta no tiene restricción.
    """

    permission_classes = (IsAuthenticated,)
    suscripcion_libre = True

    def get(self, request):
        clinica = get_clinica_activa(request)
        suscripcion = services.suscripcion_vigente(clinica.id) if clinica is not None else None
        if suscripcion is None:
            return Response({"estado": None, "acceso": services.ACCESO_TOTAL})
        datos = SuscripcionSerializer(suscripcion).data
        # Mientras no haya pago en línea, "Elegir plan" abre un WhatsApp con ventas.
        ventas = "".join(c for c in settings.CLINIQ_VENTAS_WHATSAPP if c.isdigit())
        datos["contacto_ventas_url"] = (
            f"https://wa.me/{ventas}?text=" + quote(f"Hola, quiero activar el plan de CliniQ para {clinica.nombre}.")
            if ventas else ""
        )
        en_prueba = suscripcion.estado == Suscripcion.Estado.PRUEBA
        # La bienvenida (dos preguntas) la ve una vez quien administra la clínica.
        datos["bienvenida_pendiente"] = (
            en_prueba and not suscripcion.perfil.get("visto") and user_is_tenant_admin(request.user)
            and request.user.rol != "superadmin"
        )
        from . import wompi

        datos["pago_en_linea"] = wompi.configurado()
        # Con cobro automático, la factura sale de estos datos: si faltan, se avisa.
        datos["facturacion_incompleta"] = False
        if suscripcion.modo_cobro == Suscripcion.ModoCobro.AUTOMATICO and suscripcion.fuente_pago_id:
            from .models import DatosFacturacion
            from .validacion_facturacion import problemas_de

            facturacion = DatosFacturacion.objects.filter(clinica=clinica).first()
            datos["facturacion_incompleta"] = facturacion is None or bool(problemas_de(facturacion))
        # Mora o solo lectura por renovaciones rechazadas: puede cobrar ya con su tarjeta guardada.
        from .cobros import puede_reintentar
        from .models import CobroSuscripcion

        datos["puede_reintentar_pago"] = puede_reintentar(suscripcion)
        datos["ultimo_rechazo"] = ""
        if datos["puede_reintentar_pago"]:
            ultimo = suscripcion.cobros.exclude(estado=CobroSuscripcion.Estado.APROBADO).order_by("-created_at").first()
            datos["ultimo_rechazo"] = (ultimo.mensaje if ultimo and ultimo.estado != CobroSuscripcion.Estado.PENDIENTE else "") or ""
        datos["preparacion"] = None
        if en_prueba:
            from apps.clinicas.preparacion import construir_preparacion

            prep = construir_preparacion(clinica, request.user)
            datos["preparacion"] = {k: prep[k] for k in ("nivel", "completados", "total", "todo_listo")}
        return Response(datos)


class PerfilBienvenidaView(APIView):
    """Respuestas de la bienvenida de la prueba. Se marca vista aunque no conteste."""

    permission_classes = (IsAdmin,)

    def post(self, request):
        datos = PerfilBienvenidaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        clinica = get_clinica_activa(request)
        suscripcion = get_object_or_404(Suscripcion, clinica=clinica)
        suscripcion.perfil = {**suscripcion.perfil, **{k: v for k, v in datos.validated_data.items() if v}, "visto": True}
        suscripcion.save(update_fields=["perfil", "updated_at"])
        return Response({"perfil": suscripcion.perfil})


class _AdminSuscripcionBase(APIView):
    permission_classes = (IsSuperAdmin,)

    def suscripcion(self, clinica_id) -> Suscripcion:
        return services.actualizar_estado(get_object_or_404(Suscripcion.objects.select_related("clinica__plan"), clinica_id=clinica_id))

    def responder(self, suscripcion):
        suscripcion.refresh_from_db()
        return Response(SuscripcionAdminSerializer(suscripcion).data)


class AdminSuscripcionView(_AdminSuscripcionBase):
    def get(self, request, clinica_id):
        return Response(SuscripcionAdminSerializer(self.suscripcion(clinica_id)).data)


class AdminExtenderPruebaView(_AdminSuscripcionBase):
    def post(self, request, clinica_id):
        datos = ExtenderPruebaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        try:
            suscripcion = services.extender_prueba(
                self.suscripcion(clinica_id), datos.validated_data["dias"], datos.validated_data["motivo"], request,
            )
        except services.AccionNoPermitida as exc:
            return Response({"error": str(exc), "code": "ACCION_NO_PERMITIDA"}, status=status.HTTP_400_BAD_REQUEST)
        return self.responder(suscripcion)


class AdminPagoManualView(_AdminSuscripcionBase):
    def post(self, request, clinica_id):
        datos = PagoManualSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        try:
            suscripcion = services.registrar_pago_manual(self.suscripcion(clinica_id), request=request, **datos.validated_data)
        except services.AccionNoPermitida as exc:
            return Response({"error": str(exc), "code": "ACCION_NO_PERMITIDA"}, status=status.HTTP_400_BAD_REQUEST)
        return self.responder(suscripcion)


class AdminSeguimientoView(APIView):
    """Vista "Pruebas" de la consola: avance de activación de cada clínica."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        filtro = request.query_params.get("filtro") or "pruebas"
        if filtro not in seguimiento.FILTROS:
            return Response({"error": "Filtro no válido.", "code": "FILTRO_INVALIDO"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(seguimiento.filas(filtro))


class AdminEmbudoView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        try:
            semanas = min(max(int(request.query_params.get("semanas") or 12), 1), 52)
        except ValueError:
            semanas = 12
        return Response(seguimiento.embudo(semanas))


class AdminNotasSeguimientoView(APIView):
    """Notas del seguimiento comercial a una clínica (llamadas, WhatsApp...)."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request, clinica_id):
        notas = NotaSeguimientoClinica.objects.filter(clinica_id=clinica_id).select_related("autor")
        return Response(NotaSeguimientoSerializer(notas, many=True).data)

    def post(self, request, clinica_id):
        from apps.clinicas.models import Clinica

        clinica = get_object_or_404(Clinica, pk=clinica_id)
        datos = NotaSeguimientoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        nota = datos.save(clinica=clinica, autor=request.user)
        return Response(NotaSeguimientoSerializer(nota).data, status=status.HTTP_201_CREATED)
