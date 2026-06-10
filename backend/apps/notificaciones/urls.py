from django.urls import path

from apps.notificaciones.views import EmailConfigView, EmailSendView


urlpatterns = [
    path("emails/config/", EmailConfigView.as_view(), name="email-config"),
    path("emails/enviar/", EmailSendView.as_view(), name="email-enviar"),
]
