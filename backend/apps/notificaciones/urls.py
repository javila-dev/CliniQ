from django.urls import path

from apps.notificaciones.views import (
    EmailConfigView,
    EmailSendView,
    NotificacionFallidaCallbackView,
    NotificacionFallidaListView,
    NotificacionFallidaResolverView,
)


urlpatterns = [
    path("emails/config/", EmailConfigView.as_view(), name="email-config"),
    path("emails/enviar/", EmailSendView.as_view(), name="email-enviar"),
    path("fallidas/", NotificacionFallidaListView.as_view(), name="notificacion-fallida-list"),
    path("fallidas/<uuid:pk>/resolver/", NotificacionFallidaResolverView.as_view(), name="notificacion-fallida-resolver"),
    path("n8n-callback/", NotificacionFallidaCallbackView.as_view(), name="notificacion-n8n-callback"),
]
