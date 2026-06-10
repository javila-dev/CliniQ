from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.users.models import PasswordResetToken
from apps.users.services import send_invitation_email


User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendInvitationEmailTests(TestCase):
    def test_send_invitation_email_skips_recent_duplicate_send(self):
        user = User.objects.create_user(
            email="colaborador@example.com",
            password=None,
            first_name="Ana",
            last_name="Perez",
        )

        with patch("apps.users.services.enviar_email", return_value=1) as mocked_send:
            send_invitation_email(user)
            send_invitation_email(user)

        self.assertEqual(mocked_send.call_count, 1)
        self.assertEqual(
            PasswordResetToken.objects.filter(
                user=user,
                purpose=PasswordResetToken.Purpose.INVITE,
                activo=True,
                used_at__isnull=True,
            ).count(),
            1,
        )

    def test_send_invitation_email_allows_resend_after_cooldown(self):
        user = User.objects.create_user(
            email="colaborador2@example.com",
            password=None,
            first_name="Luis",
            last_name="Diaz",
        )

        with patch("apps.users.services.enviar_email", return_value=1) as mocked_send:
            send_invitation_email(user)
            PasswordResetToken.objects.filter(
                user=user,
                purpose=PasswordResetToken.Purpose.INVITE,
            ).update(created_at=timezone.now() - timedelta(minutes=10))
            send_invitation_email(user)

        self.assertEqual(mocked_send.call_count, 2)
        self.assertEqual(
            PasswordResetToken.objects.filter(
                user=user,
                purpose=PasswordResetToken.Purpose.INVITE,
                activo=True,
                used_at__isnull=True,
            ).count(),
            1,
        )
