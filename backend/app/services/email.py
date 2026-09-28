"""Outbound email.

Three delivery modes, selected with `EMAIL_MODE` so the project runs locally with
no SMTP account at all:

* ``console`` - render the message and log a summary (default)
* ``file``    - write the rendered HTML into ``EMAIL_OUTPUT_DIR`` so you can open it
* ``smtp``    - deliver through the configured SMTP server

Sending is always best-effort: a mail failure is logged, never raised into the
request, so a flaky SMTP server can't break registration or checkout.
"""

from __future__ import annotations

import logging
import re
import smtplib
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

logger = logging.getLogger("app.email")

TEMPLATE_DIR = Path(__file__).parent / "email_templates"

_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _html_to_text(html: str) -> str:
    """Crude plain-text alternative so the message isn't HTML-only."""
    text = re.sub(r"<(script|style).*?</\1>", "", html, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>|</p>|</tr>|</h1>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def render_template(template_name: str, **context) -> str:
    """Render one of the HTML templates with the shared branding context."""
    template = _env.get_template(template_name)
    return template.render(
        company_name=settings.email_from_name,
        customer_app_url=settings.customer_app_url.rstrip("/"),
        admin_app_url=settings.admin_app_url.rstrip("/"),
        **context,
    )


def _deliver_smtp(message: EmailMessage) -> None:
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.ehlo()
        if settings.smtp_use_tls:
            server.starttls()
            server.ehlo()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


def _deliver_file(to_email: str, subject: str, html_body: str) -> None:
    out_dir = Path(settings.email_output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_subject = re.sub(r"[^a-zA-Z0-9._-]+", "-", subject)[:60].strip("-")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    path = out_dir / f"{stamp}_{re.sub(r'[^a-zA-Z0-9._-]+', '-', to_email)}_{safe_subject}.html"
    path.write_text(html_body, encoding="utf-8")
    logger.info("Email written to %s", path)


def send_email(*, to_email: str, subject: str, html_body: str) -> bool:
    """Send one message. Returns True when it was delivered/recorded."""
    try:
        if settings.email_mode == "smtp":
            if not settings.smtp_configured:
                logger.warning(
                    "EMAIL_MODE=smtp but SMTP_HOST is empty - skipping email '%s' to %s",
                    subject,
                    to_email,
                )
                return False

            message = EmailMessage()
            message["Subject"] = subject
            message["From"] = f"{settings.email_from_name} <{settings.email_from}>"
            message["To"] = to_email
            message.set_content(_html_to_text(html_body))
            message.add_alternative(html_body, subtype="html")
            _deliver_smtp(message)
            logger.info("Email sent to %s via SMTP: %s", to_email, subject)
            return True

        if settings.email_mode == "file":
            _deliver_file(to_email, subject, html_body)
            return True

        # console mode
        logger.info(
            "[EMAIL:console] to=%s from=%s subject=%s (%d bytes of HTML)",
            to_email,
            settings.email_from,
            subject,
            len(html_body),
        )
        return True
    except Exception:  # noqa: BLE001 - email must never break the request
        logger.exception("Failed to send email '%s' to %s", subject, to_email)
        return False


def send_template_email(*, to_email: str, subject: str, template_name: str, **context) -> bool:
    """Render a template and send it. Used by every notification below."""
    html_body = render_template(
        template_name, subject=subject, heading=context.pop("heading", subject), **context
    )
    return send_email(to_email=to_email, subject=subject, html_body=html_body)
