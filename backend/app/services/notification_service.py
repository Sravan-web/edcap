# ==============================================================================
# PIPELINE / MODEL COMPONENT: Notification Service
# TECH STACK: Python — console adapter (dev) / SMTP adapter (prod)
# ==============================================================================
from __future__ import annotations

import smtplib
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class EmailAdapter(ABC):
    @abstractmethod
    async def send(self, to: str, subject: str, body_html: str, body_text: str) -> None:
        """Send an email."""


class ConsoleEmailAdapter(EmailAdapter):
    """Dev adapter: prints emails to the console log instead of sending."""
    async def send(self, to: str, subject: str, body_html: str, body_text: str) -> None:
        logger.info(
            "console_email",
            to=to,
            subject=subject,
            body_preview=body_text[:200],
        )


class SMTPEmailAdapter(EmailAdapter):
    """Production SMTP adapter."""
    async def send(self, to: str, subject: str, body_html: str, body_text: str) -> None:
        import asyncio
        await asyncio.get_event_loop().run_in_executor(None, self._send_sync, to, subject, body_html, body_text)

    def _send_sync(self, to: str, subject: str, body_html: str, body_text: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = to
        msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_TLS:
                server.starttls()
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("smtp_email_sent", to=to, subject=subject)


def get_email_adapter() -> EmailAdapter:
    if settings.EMAIL_PROVIDER == "smtp":
        return SMTPEmailAdapter()
    return ConsoleEmailAdapter()


class NotificationService:
    def __init__(self) -> None:
        self._email = get_email_adapter()

    async def send_verification_email(self, to: str, token: str, base_url: str) -> None:
        link = f"{base_url}/auth/verify-email?token={token}"
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — Verify your email address",
            body_html=f"""
                <p>Welcome to <strong>{settings.APP_NAME}</strong>!</p>
                <p>Please verify your email address by clicking the link below. This link expires in {settings.EMAIL_VERIFY_EXPIRY_H} hours.</p>
                <p><a href="{link}">Verify Email Address</a></p>
                <p>If you did not create an account, you can safely ignore this email.</p>
            """,
            body_text=f"Verify your email: {link}\n\nLink expires in {settings.EMAIL_VERIFY_EXPIRY_H} hours.",
        )

    async def send_password_reset_email(self, to: str, token: str, base_url: str) -> None:
        link = f"{base_url}/auth/reset-password?token={token}"
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — Password reset request",
            body_html=f"""
                <p>A password reset was requested for your {settings.APP_NAME} account.</p>
                <p>Click the link below to set a new password. This link expires in {settings.RESET_TOKEN_EXPIRY_MIN} minutes and can only be used once.</p>
                <p><a href="{link}">Reset Password</a></p>
                <p>If you did not request this, your account may be at risk. Please contact support immediately.</p>
            """,
            body_text=f"Reset your password: {link}\n\nExpires in {settings.RESET_TOKEN_EXPIRY_MIN} minutes. Single use.",
        )

    async def send_account_locked_email(self, to: str, lockout_minutes: int) -> None:
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — Account temporarily locked",
            body_html=f"""
                <p>Your {settings.APP_NAME} account has been temporarily locked due to multiple failed login attempts.</p>
                <p>It will be automatically unlocked in <strong>{lockout_minutes} minutes</strong>.</p>
                <p>If this was not you, please reset your password immediately or contact support.</p>
            """,
            body_text=f"Your account is temporarily locked for {lockout_minutes} minutes due to failed login attempts.",
        )

    async def send_password_changed_email(self, to: str) -> None:
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — Your password has been changed",
            body_html=f"""
                <p>Your {settings.APP_NAME} password was successfully changed and all active sessions have been terminated.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            """,
            body_text="Your password was changed. All sessions have been terminated. Contact support if this was not you.",
        )

    async def send_suspicious_login_email(self, to: str, ip_prefix: str, device_hint: str) -> None:
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — New sign-in detected",
            body_html=f"""
                <p>A sign-in to your {settings.APP_NAME} account was detected from a new device or location.</p>
                <ul><li>Location prefix: {ip_prefix}</li><li>Device hint: {device_hint}</li></ul>
                <p>If this was not you, please log out of all devices and reset your password.</p>
            """,
            body_text=f"New sign-in detected from {ip_prefix} ({device_hint}). Secure your account if not you.",
        )

    async def send_quiz_approval_needed(self, to: str, course_name: str, quiz_date: str) -> None:
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — Quiz awaiting approval: {course_name}",
            body_html=f"<p>A new daily quiz for <strong>{course_name}</strong> on <strong>{quiz_date}</strong> is ready for your review and approval.</p>",
            body_text=f"A new quiz for {course_name} ({quiz_date}) is awaiting your approval in {settings.APP_NAME}.",
        )

    async def send_support_signal_digest(self, to: str, course_name: str, new_flag_count: int) -> None:
        await self._email.send(
            to=to,
            subject=f"{settings.APP_NAME} — Daily learning support digest: {course_name}",
            body_html=f"<p><strong>{new_flag_count}</strong> new support signal(s) were identified in <strong>{course_name}</strong> today. Log in to review and generate targeted playbooks.</p>",
            body_text=f"{new_flag_count} new support signals in {course_name}. Log in to review.",
        )


async def dispatch_support_signal_digests(
    db: Any,
    *,
    course_id: Any | None = None,
) -> dict[str, int]:
    """
    Finds open support flags, aggregates signals per course,
    and sends digest emails to the assigned faculty members.
    """
    from app.models.course import Course, CourseFaculty
    from app.models.flag import SupportFlag
    from app.models.user import User
    from sqlalchemy import func, select

    query = select(SupportFlag.course_id, func.count(SupportFlag.id).label("flag_count")).where(
        SupportFlag.status == "open"
    )
    if course_id:
        query = query.where(SupportFlag.course_id == course_id)
    query = query.group_by(SupportFlag.course_id)

    result = await db.execute(query)
    course_flag_counts = result.all()

    notifications = NotificationService()
    emails_sent = 0
    courses_processed = 0

    for c_id, count in course_flag_counts:
        course = await db.get(Course, c_id)
        if not course:
            continue
        courses_processed += 1

        cf_result = await db.execute(
            select(User)
            .join(CourseFaculty, CourseFaculty.faculty_id == User.id)
            .where(CourseFaculty.course_id == c_id)
        )
        faculty_members = cf_result.scalars().all()

        for faculty in faculty_members:
            if faculty.email:
                await notifications.send_support_signal_digest(
                    to=faculty.email,
                    course_name=course.name,
                    new_flag_count=count,
                )
                emails_sent += 1

    logger.info("support_signal_digests_dispatched", courses=courses_processed, emails=emails_sent)
    return {
        "courses_processed": courses_processed,
        "emails_sent": emails_sent,
    }
