from django.urls import path

from apps.users.views import (
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
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("impersonate/<uuid:user_id>/", ImpersonateUserView.as_view(), name="auth-impersonate"),
    path("invitar/", InvitationRequestView.as_view(), name="auth-invitar"),
    path("recuperar-password/", PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("recuperar-password/<str:token>/", PasswordResetValidateView.as_view(), name="auth-password-reset-validate"),
    path("restablecer-password/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
]
