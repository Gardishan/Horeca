"""Independently parse a synthetic PDF from stdin; never print document content."""
import io
import json
import logging
import sys

from pypdf import PdfReader


def main():
    diagnostics = io.StringIO()
    handler = logging.StreamHandler(diagnostics)
    logging.getLogger("pypdf").addHandler(handler)
    content = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
    if not content or len(content) > 10 * 1024 * 1024:
        raise ValueError("Invalid fixture size")
    reader = PdfReader(io.BytesIO(content), strict=True)
    if reader.is_encrypted or len(reader.pages) != 1:
        raise ValueError("Expected one unencrypted demo page")
    page = reader.pages[0]
    if page.mediabox.width <= 0 or page.mediabox.height <= 0:
        raise ValueError("Invalid page dimensions")
    text = page.extract_text()
    if "DEMO ONLY" not in text or "HORECA KZ" not in text.upper() or diagnostics.getvalue():
        raise ValueError("Unreadable or missing demo content")
    print(json.dumps({"ok": True, "pages": 1, "demoTextReadable": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("PDF validation failed: expected a readable synthetic demo PDF.", file=sys.stderr)
        sys.exit(1)
