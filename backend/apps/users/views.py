from django.contrib.auth import get_user_model
from django.utils.encoding import force_str
from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from django.db import OperationalError, ProgrammingError
from django.db.models.deletion import ProtectedError

from apps.clinicas.models import Clinica
from apps.users import services
from apps.users.models import Permiso, Rol, RolAuditoria, RolPermiso
from apps.users.permissions import IsAdmin, RequirePermission
from apps.users.serializers import (
    InvitationRequestSerializer,
    LoginSerializer,
    MeUpdateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PermisoSerializer,
    RolPermisosUpdateSerializer,
    RolSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)

User = get_user_model()


def _check_clinica_user_limit(clinica):
    """Returns (error_message, error_code) si se alcanzó el límite, o None si puede agregar."""
    plan = getattr(clinica, "plan", None)
    if plan is None or plan.max_usuarios == 0:
        return None
    activos = clinica.usuarios.filter(activo=True).count()
    if activos >= plan.max_usuarios:
        return (
            f"La clinica ha alcanzado el limite de {plan.max_usuarios} usuarios activos de su plan '{plan.nombre}'.",
            "PLAN_LIMIT_REACHED",
        )
    return None


PROTECTED_RELATION_LABELS = {
    "agenda.cita": "citas",
    "agenda.bloqueoagenda": "bloqueos de agenda",
    "colaboradores.colaborador": "colaboradores",
    "cobros.cobro": "cobros",
    "cobros.pagorecibido": "pagos",
    "historia_clinica.notaclinica": "notas clinicas",
    "inventario.movimientoinventario": "movimientos de inventario",
    "proveedores.ordencompra": "ordenes de compra",
}


def error_response(message: str, code: str, status_code: int) -> Response:
    return Response({"error": message, "code": code}, status=status_code)


def _protected_relations_message(exc: ProtectedError) -> str:
    relation_names = sorted(
        {
            PROTECTED_RELATION_LABELS.get(
                f"{obj._meta.app_label}.{obj._meta.model_name}",
                force_str(getattr(obj._meta, "verbose_name_plural", obj._meta.model_name)),
            )
            for obj in exc.protected_objects
        }
    )
    if relation_names:
        return "No se puede eliminar el usuario porque tiene registros asociados en: " + ", ".join(relation_names) + "."
    return "No se puede eliminar el usuario porque tiene registros asociados."


class LoginView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return error_response("Credenciales invalidas.", "INVALID_CREDENTIALS", status.HTTP_401_UNAUTHORIZED)

        user = serializer.user
        if getattr(user, "clinica_id", None):
            clinica = Clinica.objects.filter(id=user.clinica_id).values("activo").first()
            if clinica and not clinica["activo"]:
                return error_response(
                    "La clinica no esta activa. Contacta al administrador.",
                    "CLINICA_INACTIVA",
                    status.HTTP_403_FORBIDDEN,
                )

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    authentication_classes = ()
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return error_response("No fue posible refrescar el token.", "TOKEN_REFRESH_FAILED", status.HTTP_401_UNAUTHORIZED)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.request_password_reset(serializer.validated_data["email"])
        except ValidationError as exc:
            detail = exc.detail
            message = detail[0] if isinstance(detail, list) else detail
            return error_response(
                str(message),
                "PASSWORD_RESET_EMAIL_NOT_CONFIGURED",
                status.HTTP_400_BAD_REQUEST,
            )
        except (ProgrammingError, OperationalError):
            return error_response(
                "La recuperacion de contrasena no esta disponible todavia. Ejecuta las migraciones pendientes.",
                "PASSWORD_RESET_MIGRATION_REQUIRED",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception:
            return error_response(
                "No fue posible procesar la solicitud de recuperacion.",
                "PASSWORD_RESET_REQUEST_FAILED",
                status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "ok": True,
                "message": "Si el correo existe, enviaremos instrucciones para recuperar la contrasena.",
            },
            status=status.HTTP_200_OK,
        )


class InvitationRequestView(APIView):
    permission_classes = (IsAdmin,)

    def post(self, request, *args, **kwargs):
        serializer = InvitationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            clinica = None if request.user.rol == "superadmin" else request.user.clinica
            services.send_user_invitation(
                serializer.validated_data["email"],
                clinica=clinica,
            )
        except User.DoesNotExist:
            return Response(
                {"error": "No existe un usuario con ese correo."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValidationError as exc:
            detail = exc.detail
            message = detail[0] if isinstance(detail, list) else detail
            return error_response(
                str(message),
                "INVITATION_EMAIL_NOT_CONFIGURED",
                status.HTTP_400_BAD_REQUEST,
            )
        except (ProgrammingError, OperationalError):
            return error_response(
                "La invitacion no esta disponible todavia. Ejecuta las migraciones pendientes.",
                "INVITATION_MIGRATION_REQUIRED",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception:
            return error_response(
                "No fue posible enviar la invitacion.",
                "INVITATION_SEND_FAILED",
                status.HTTP_400_BAD_REQUEST,
            )

        return Response({"ok": True}, status=status.HTTP_200_OK)


class PasswordResetValidateView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def get(self, request, token, *args, **kwargs):
        try:
            reset_token = services.get_valid_password_reset_token(token)
        except ValueError as exc:
            return Response({"ok": False, "error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "ok": True,
                "email": reset_token.user.email,
                "expires_at": reset_token.expires_at,
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            password_errors = serializer.errors.get("non_field_errors") or serializer.errors.get("nueva_password")
            if password_errors:
                message = password_errors[0]
                return Response({"error": str(message)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            services.confirm_password_reset(
                serializer.validated_data["token"],
                serializer.validated_data["nueva_password"],
            )
        except ValidationError as exc:
            detail = exc.detail
            message = detail[0] if isinstance(detail, list) else detail
            return Response({"error": str(message)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response(
                {"error": str(exc), "code": "PASSWORD_RESET_INVALID_TOKEN"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "ok": True,
                "message": "La contrasena fue actualizada correctamente.",
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return error_response("El refresh token es obligatorio.", "REFRESH_REQUIRED", status.HTTP_400_BAD_REQUEST)

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return error_response("El refresh token no es valido.", "INVALID_REFRESH_TOKEN", status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        serializer = MeUpdateSerializer(instance=request.user, data=request.data, partial=True, context={"request": request})
        if not serializer.is_valid():
            return error_response("No fue posible actualizar el perfil.", "ME_UPDATE_INVALID", status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data, status=status.HTTP_200_OK)


class ImpersonateUserView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id, *args, **kwargs):
        if request.user.rol != User.Role.SUPERADMIN:
            return error_response(
                "Solo un superadmin puede impersonar usuarios.",
                "SUPERADMIN_REQUIRED",
                status.HTTP_403_FORBIDDEN,
            )

        if str(request.user.id) == str(user_id):
            return error_response(
                "No puedes impersonarte a ti mismo.",
                "CANNOT_IMPERSONATE_SELF",
                status.HTTP_400_BAD_REQUEST,
            )

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return error_response(
                "No existe un usuario con ese identificador.",
                "USER_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )

        refresh = LoginSerializer.get_token(target_user)
        user_data = UserSerializer(target_user, context={"request": request}).data
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": user_data,
            },
            status=status.HTTP_200_OK,
        )


class PermisoListView(APIView):
    permission_classes = (RequirePermission("roles.ver"),)

    def get(self, request, *args, **kwargs):
        permisos = Permiso.objects.filter(activo=True, assignable=True).order_by("modulo", "accion", "clave")
        agrupados = {}
        for permiso in permisos:
            agrupados.setdefault(permiso.modulo, []).append(PermisoSerializer(permiso).data)
        return Response(
            [
                {"modulo": modulo, "permisos": items}
                for modulo, items in agrupados.items()
            ],
            status=status.HTTP_200_OK,
        )


class RolViewSet(GenericViewSet):
    serializer_class = RolSerializer
    queryset = Rol.objects.prefetch_related("permisos").annotate(usuarios_count=Count("usuarios"))
    lookup_field = "pk"

    def get_permissions(self):
        permission_map = {
            "list": "roles.ver",
            "retrieve": "roles.ver",
            "create": "roles.crear",
            "partial_update": "roles.editar",
            "update": "roles.editar",
            "destroy": "roles.eliminar",
            "permisos": "roles.asignar_permisos",
        }
        permission_key = permission_map.get(self.action, "roles.ver")
        return [RequirePermission(permission_key)()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            qs = qs.filter(clinica=user.clinica)
        return qs.exclude(slug="superadmin")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def list(self, request):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data, status=status.HTTP_200_OK)

    def create(self, request):
        if not request.user.clinica_id:
            return Response(
                {"error": "El usuario autenticado no tiene una clinica asociada.", "code": "CLINIC_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rol = serializer.save(
            clinica=request.user.clinica,
            es_sistema=False,
            editable=True,
        )
        RolAuditoria.objects.create(
            rol=rol,
            usuario=request.user,
            accion=RolAuditoria.Accion.CREAR,
            despues=RolSerializer(rol, context=self.get_serializer_context()).data,
        )
        return Response(self.get_serializer(rol).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        rol = self.get_object()
        if rol.slug == "admin" or not rol.editable:
            return Response(
                {"error": "Este rol no se puede editar.", "code": "ROLE_NOT_EDITABLE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        antes = RolSerializer(rol, context=self.get_serializer_context()).data
        serializer = self.get_serializer(rol, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        rol = serializer.save()
        despues = RolSerializer(rol, context=self.get_serializer_context()).data
        RolAuditoria.objects.create(
            rol=rol,
            usuario=request.user,
            accion=RolAuditoria.Accion.EDITAR,
            antes=antes,
            despues=despues,
        )
        return Response(despues, status=status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        rol = self.get_object()
        if rol.slug == "admin" or not rol.editable:
            return Response(
                {"error": "Este rol no se puede eliminar.", "code": "ROLE_NOT_DELETABLE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if rol.usuarios.exists():
            return Response(
                {"error": "No se puede eliminar un rol con usuarios asignados.", "code": "ROLE_HAS_USERS"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        antes = RolSerializer(rol, context=self.get_serializer_context()).data
        RolAuditoria.objects.create(
            rol=rol,
            usuario=request.user,
            accion=RolAuditoria.Accion.ELIMINAR,
            antes=antes,
        )
        rol.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["put"], url_path="permisos")
    def permisos(self, request, pk=None):
        rol = self.get_object()
        if rol.slug == "admin" or not rol.editable:
            return Response(
                {"error": "Los permisos de este rol no se pueden modificar.", "code": "ROLE_PERMISSIONS_LOCKED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RolPermisosUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        antes = RolSerializer(rol, context=self.get_serializer_context()).data
        permisos = list(Permiso.objects.filter(clave__in=serializer.validated_data["permission_keys"]))
        with transaction.atomic():
            RolPermiso.objects.filter(rol=rol).delete()
            RolPermiso.objects.bulk_create([RolPermiso(rol=rol, permiso=permiso) for permiso in permisos])
            RolAuditoria.objects.create(
                rol=rol,
                usuario=request.user,
                accion=RolAuditoria.Accion.ASIGNAR_PERMISOS,
                antes=antes,
                despues={"permission_keys": sorted(serializer.validated_data["permission_keys"])},
            )
        rol.refresh_from_db()
        return Response(RolSerializer(rol, context=self.get_serializer_context()).data, status=status.HTTP_200_OK)


class UserViewSet(GenericViewSet):
    filterset_fields = ("activo",)
    search_fields = ("first_name", "last_name", "email")
    ordering_fields = ("last_name", "first_name", "created_at")

    def get_permissions(self):
        permission_map = {
            "list": "usuarios.ver",
            "retrieve": "usuarios.ver",
            "create": "usuarios.crear",
            "partial_update": "usuarios.editar",
            "update": "usuarios.editar",
            "destroy": "usuarios.eliminar",
            "activar": "usuarios.editar",
            "desactivar": "usuarios.editar",
        }
        if self.action == "cambiar_password":
            return [IsAuthenticated()]
        if self.action in {"limite", "reenviar_invitacion"}:
            return [IsAdmin()]
        return [RequirePermission(permission_map.get(self.action, "usuarios.ver"))()]

    def get_queryset(self):
        qs = (
            __import__("django.contrib.auth", fromlist=["get_user_model"])
            .get_user_model()
            .objects.select_related("clinica", "rol_dinamico", "colaborador__sede_principal")
        )
        if self.request.user.rol != "superadmin":
            qs = qs.filter(clinica=self.request.user.clinica)
        else:
            clinica_header = self.request.headers.get("X-Clinica-Id", "").strip()
            if clinica_header:
                qs = qs.filter(clinica_id=clinica_header)
        rol = self.request.query_params.get("rol")
        if rol:
            qs = qs.filter(rol_dinamico__slug=rol)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        return UserAdminSerializer

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def list(self, request):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(UserAdminSerializer(page, many=True, context=self.get_serializer_context()).data)
        return Response(UserAdminSerializer(qs, many=True, context=self.get_serializer_context()).data)

    def create(self, request):
        serializer = UserCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        if request.user.rol != "superadmin" and request.user.clinica_id:
            clinica = Clinica.objects.select_related("plan").filter(id=request.user.clinica_id).first()
            if clinica:
                limit_error = _check_clinica_user_limit(clinica)
                if limit_error:
                    message, code = limit_error
                    return error_response(message, code, status.HTTP_403_FORBIDDEN)
        user = serializer.save()
        return Response(UserAdminSerializer(user, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        user = self.get_object()
        return Response(UserAdminSerializer(user, context=self.get_serializer_context()).data)

    def partial_update(self, request, pk=None):
        user = self.get_object()
        serializer = UserUpdateSerializer(user, data=request.data, partial=True, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserAdminSerializer(user, context=self.get_serializer_context()).data)

    def destroy(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response(
                {"error": "No puedes eliminarte a ti mismo.", "code": "SELF_DELETE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user.delete()
        except ProtectedError as exc:
            return Response(
                {"error": _protected_relations_message(exc), "code": "USER_DELETE_PROTECTED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="limite")
    def limite(self, request):
        clinica = None
        if request.user.rol != "superadmin" and request.user.clinica_id:
            clinica = Clinica.objects.select_related("plan").filter(id=request.user.clinica_id).first()

        activos = clinica.usuarios.filter(activo=True).count() if clinica else 0
        plan = getattr(clinica, "plan", None) if clinica else None

        if plan is None or plan.max_usuarios == 0:
            return Response({
                "max_usuarios": None,
                "usuarios_activos": activos,
                "puede_agregar": True,
                "slots_disponibles": None,
                "sin_limite": True,
            })

        slots = max(0, plan.max_usuarios - activos)
        return Response({
            "max_usuarios": plan.max_usuarios,
            "usuarios_activos": activos,
            "puede_agregar": activos < plan.max_usuarios,
            "slots_disponibles": slots,
            "sin_limite": False,
        })

    @action(detail=True, methods=["post"], url_path="cambiar_password")
    def cambiar_password(self, request, pk=None):
        user = self.get_object()
        if request.user != user and not request.user.es_admin:
            return Response({"error": "Sin permiso.", "code": "FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)
        nueva = request.data.get("nueva_password", "")
        if len(nueva) < 8:
            return Response(
                {"error": "La contraseña debe tener al menos 8 caracteres.", "code": "PASSWORD_TOO_SHORT"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(nueva)
        user.save(update_fields=["password"])
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="reenviar_invitacion")
    def reenviar_invitacion(self, request, pk=None):
        user = self.get_object()

        if user.last_login is not None:
            return error_response(
                "El usuario ya activo su cuenta y no necesita una nueva invitacion.",
                "USER_ALREADY_ACTIVATED",
                status.HTTP_400_BAD_REQUEST,
            )

        _, url, email_enviado = services.generar_link_invitacion(user)

        return Response({
            "ok": True,
            "url": url,
            "email_enviado": email_enviado,
        })

    @action(detail=True, methods=["post"], url_path="activar")
    def activar(self, request, pk=None):
        user = self.get_object()
        if not user.activo and user.clinica_id:
            clinica = Clinica.objects.select_related("plan").filter(id=user.clinica_id).first()
            if clinica:
                limit_error = _check_clinica_user_limit(clinica)
                if limit_error:
                    message, code = limit_error
                    return error_response(message, code, status.HTTP_403_FORBIDDEN)
        user.activo = True
        user.save(update_fields=["activo"])
        return Response(UserAdminSerializer(user, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="desactivar")
    def desactivar(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response(
                {"error": "No puedes desactivarte a ti mismo.", "code": "SELF_DEACTIVATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.activo = False
        user.save(update_fields=["activo"])
        return Response(UserAdminSerializer(user, context=self.get_serializer_context()).data)
