from io import BytesIO
import json
from pathlib import Path

import pdfplumber
from docx import Document


BASE_DATA_DIR = Path("data/raw")
PROCESSED_DATA_DIR = Path("data/processed")
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


class UnsupportedFileTypeError(ValueError):
    """Raised when upload extension is not supported."""


def _get_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def _validate_extension(filename: str) -> str:
    extension = _get_extension(filename)
    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise UnsupportedFileTypeError(f"Unsupported file type. Allowed: {allowed}")
    return extension


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract UTF-8 text from PDF, DOCX, or TXT file bytes."""
    extension = _validate_extension(filename)

    if extension == ".txt":
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("TXT file must be UTF-8 encoded") from exc
        return text.strip()

    if extension == ".pdf":
        try:
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
            text = "\n".join(part.strip() for part in pages if part.strip())
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Failed to extract text from PDF") from exc
        if not text:
            raise ValueError("No extractable text found in PDF")
        return text

    try:
        document = Document(BytesIO(file_bytes))
        paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs]
        text = "\n".join(part for part in paragraphs if part)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Failed to extract text from DOCX") from exc

    if not text:
        raise ValueError("No extractable text found in DOCX")
    return text


def save_raw_file(
    file_bytes: bytes,
    filename: str,
    source: str = "user",
    file_hash: str | None = None,
) -> str:
    """Persist raw file bytes into data/raw/<source>."""
    source_dir = BASE_DATA_DIR / source
    source_dir.mkdir(parents=True, exist_ok=True)

    safe_name = Path(filename).name
    if not safe_name:
        safe_name = "upload.bin"

    destination_name = f"{file_hash}_{safe_name}" if file_hash else safe_name
    destination = source_dir / destination_name

    with destination.open("wb") as out_file:
        out_file.write(file_bytes)

    return str(destination)


def file_exists_with_hash(file_hash: str, source: str = "user") -> bool:
    """Check if a file with the same content hash already exists."""
    source_dir = BASE_DATA_DIR / source
    if not source_dir.exists():
        return False

    return any(source_dir.glob(f"{file_hash}_*"))


def save_processed_json(payload: dict, file_hash: str, source: str = "user") -> str:
    """Persist processed payload to data/processed/<source>/<hash>.json."""
    source_dir = PROCESSED_DATA_DIR / source
    source_dir.mkdir(parents=True, exist_ok=True)

    destination = source_dir / f"{file_hash}.json"
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return str(destination)
