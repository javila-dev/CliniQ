from django.urls import path

from apps.notificaciones.views import (
    EmailConfigView,
    EmailSendView,
    LyvioWebhookView,
    NotificacionFallidaCallbackView,
    NotificacionFallidaListView,
    NotificacionFallidaResolverView,
    WhatsappPropioConectarView,
    WhatsappPropioReconectarView,
    WhatsappPropioView,
)


urlpatterns = [
    path("emails/config/", EmailConfigView.as_view(), name="email-config"),
    path("emails/enviar/", EmailSendView.as_view(), name="email-enviar"),
    path("fallidas/", NotificacionFallidaListView.as_view(), name="notificacion-fallida-list"),
    path("fallidas/<uuid:pk>/resolver/", NotificacionFallidaResolverView.as_view(), name="notificacion-fallida-resolver"),
    path("n8n-callback/", NotificacionFallidaCallbackView.as_view(), name="notificacion-n8n-callback"),
    path("lyvio-webhook/", LyvioWebhookView.as_view(), name="lyvio-webhook"),
    path("whatsapp-propio/", WhatsappPropioView.as_view(), name="whatsapp-propio"),
    path("whatsapp-propio/conectar/", WhatsappPropioConectarView.as_view(), name="whatsapp-propio-conectar"),
    path(
        "whatsapp-propio/numeros/<uuid:pk>/reconectar/",
        WhatsappPropioReconectarView.as_view(),
        name="whatsapp-propio-reconectar",
    ),
]
