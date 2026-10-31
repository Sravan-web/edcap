# ==============================================================================
# Tests — Notification Service & Delivery
# ==============================================================================
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock

from app.services.notification_service import (
    ConsoleEmailAdapter,
    NotificationService,
)


class TestNotificationDelivery(unittest.IsolatedAsyncioTestCase):
    async def test_console_email_adapter(self):
        adapter = ConsoleEmailAdapter()
        await adapter.send(
            to="student@edcap.demo",
            subject="Test Subject",
            body_html="<p>Test</p>",
            body_text="Test",
        )

    async def test_notification_service_methods(self):
        service = NotificationService()
        mock_email = AsyncMock()
        service._email = mock_email

        # Verification email
        await service.send_verification_email("user@demo.com", "token123", "http://localhost:3000")
        self.assertTrue(mock_email.send.called)
        self.assertIn("Verify your email", mock_email.send.call_args[1]["subject"])

        # Password reset email
        await service.send_password_reset_email("user@demo.com", "token123", "http://localhost:3000")
        self.assertIn("Password reset", mock_email.send.call_args[1]["subject"])

        # Account locked email
        await service.send_account_locked_email("user@demo.com", 15)
        self.assertIn("locked", mock_email.send.call_args[1]["subject"])

        # Password changed email
        await service.send_password_changed_email("user@demo.com")
        self.assertIn("password has been changed", mock_email.send.call_args[1]["subject"])

        # Suspicious login
        await service.send_suspicious_login_email("user@demo.com", "192.168.1.0/24", "Safari/Mac")
        self.assertIn("sign-in", mock_email.send.call_args[1]["subject"])

        # Quiz approval needed
        await service.send_quiz_approval_needed("prof@demo.com", "Data Structures", "2026-10-28")
        self.assertIn("Quiz awaiting approval", mock_email.send.call_args[1]["subject"])
        self.assertIn("Data Structures", mock_email.send.call_args[1]["subject"])

        # Support signal digest
        await service.send_support_signal_digest("prof@demo.com", "Data Structures", 3)
        self.assertIn("Daily learning support digest", mock_email.send.call_args[1]["subject"])
        self.assertIn("Data Structures", mock_email.send.call_args[1]["subject"])


if __name__ == "__main__":
    unittest.main()
