# ==============================================================================
# PIPELINE / MODEL COMPONENT: Module Service — File Upload & PDF Parsing
# TECH STACK: Python / FastAPI / pdfminer.six
# ==============================================================================
from __future__ import annotations

import io
import json
import mimetypes
import os
import secrets
import uuid
from pathlib import Path
from typing import Any

try:
    import magic  # python-magic for magic byte check
except ImportError:
    magic = None  # type: ignore[assignment]  # fallback to mimetypes
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextBox, LTTextLine

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.module import LessonModule

settings = get_settings()
logger = get_logger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".md", ".markdown"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/markdown",
    "text/plain",
    "text/x-markdown",
}
MAGIC_BYTE_SIGNATURES = {
    b"%PDF": "pdf",
}

_STORAGE_PATH = Path(settings.UPLOAD_STORAGE_PATH)


def _ensure_storage_dir() -> None:
    _STORAGE_PATH.mkdir(parents=True, exist_ok=True)


def _random_filename(original: str) -> str:
    """Generate a random server-side filename that cannot be guessed."""
    ext = Path(original).suffix.lower()
    return f"{secrets.token_hex(24)}{ext}"


def validate_upload(filename: str, content: bytes, max_bytes: int) -> str:
    """
    Validate uploaded file by extension, MIME type, and magic bytes.
    Returns the detected file type ("pdf" or "markdown").
    Raises ValueError with a user-safe message on failure.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type. Allowed: PDF, Markdown.")

    if len(content) > max_bytes:
        raise ValueError(f"File exceeds the maximum allowed size.")

    # MIME check via python-magic (optional — skip if libmagic unavailable)
    if magic is not None:
        try:
            mime = magic.from_buffer(content[:1024], mime=True)
            if mime not in ALLOWED_MIME_TYPES and "pdf" not in mime and "text" not in mime:
                raise ValueError(f"File content does not match allowed types.")
        except Exception as exc:
            if "ValueError" in type(exc).__name__:
                raise
            logger.warning("magic_check_failed", error=str(exc))

    # Magic byte check for PDF
    if suffix == ".pdf":
        if not content.startswith(b"%PDF"):
            raise ValueError("File claims to be a PDF but does not have a valid PDF signature.")
        return "pdf"

    return "markdown"


def save_file(original_filename: str, content: bytes) -> str:
    """Save file to the storage path with a random name. Returns the stored filename."""
    _ensure_storage_dir()
    stored_name = _random_filename(original_filename)
    file_path = _STORAGE_PATH / stored_name
    # Ensure no path traversal
    if not str(file_path.resolve()).startswith(str(_STORAGE_PATH.resolve())):
        raise ValueError("Invalid file path.")
    file_path.write_bytes(content)
    return stored_name


def parse_pdf(content: bytes) -> list[dict[str, Any]]:
    """
    Extract text chunks from a PDF.
    Each chunk: {"text": str, "section": str, "page": int}
    Raises ValueError for scanned PDFs (no text layer).
    """
    chunks = []
    try:
        for page_num, page_layout in enumerate(extract_pages(io.BytesIO(content)), start=1):
            page_text_parts = []
            for element in page_layout:
                if isinstance(element, LTTextBox):
                    text = element.get_text().strip()
                    if text:
                        page_text_parts.append(text)

            if page_text_parts:
                chunks.append({
                    "text": "\n".join(page_text_parts),
                    "section": f"Page {page_num}",
                    "page": page_num,
                })
    except Exception as exc:
        raise ValueError(f"Failed to parse PDF: {exc}")

    if not chunks:
        raise ValueError(
            "This PDF does not appear to contain extractable text. "
            "Scanned image PDFs are not supported. Please upload a text-based PDF or convert to Markdown."
        )
    return chunks


def parse_markdown(content: bytes) -> list[dict[str, Any]]:
    """Split Markdown content into chunks by heading."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("Markdown file is not valid UTF-8.")

    chunks = []
    current_section = "Introduction"
    current_lines = []

    for line in text.split("\n"):
        if line.startswith("#"):
            if current_lines:
                chunks.append({
                    "text": "\n".join(current_lines).strip(),
                    "section": current_section,
                    "page": len(chunks) + 1,
                })
            current_section = line.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        chunks.append({
            "text": "\n".join(current_lines).strip(),
            "section": current_section,
            "page": len(chunks) + 1,
        })

    if not chunks:
        raise ValueError("Markdown file appears to be empty.")
    return chunks
