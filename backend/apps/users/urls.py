from django.urls import path

from apps.users.views import (
    CapturaFirmaEstadoView,
    CapturaFirmaView,
    FirmaMovilPublicaView,
    GoogleLoginView,
    ImpersonateUserView,
    InvitationRequestView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PasswordResetValidateView,
    RefreshView,
)


urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("google/", GoogleLoginView.as_view(), name="auth-google"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("me/captura-firma/", CapturaFirmaView.as_view(), name="auth-captura-firma"),
    path("me/captura-firma/<str:token>/estado/", CapturaFirmaEstadoView.as_view(), name="auth-captura-firma-estado"),
    path("firma-movil/<str:token>/", FirmaMovilPublicaView.as_view(), name="auth-firma-movil"),
    path("impersonate/<uuid:user_id>/", ImpersonateUserView.as_view(), name="auth-impersonate"),
    path("invitar/", InvitationRequestView.as_view(), name="auth-invitar"),
    path("recuperar-password/", PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("recuperar-password/<str:token>/", PasswordResetValidateView.as_view(), name="auth-password-reset-validate"),
    path("restablecer-password/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
]
