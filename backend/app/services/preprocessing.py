import logging
from pathlib import Path
import re
from threading import Lock

import spacy
from bs4 import BeautifulSoup
from spacy.language import Language

logger = logging.getLogger(__name__)

_SPACY_MODEL_NAME = "en_core_web_sm"

_NLP: Language | None = None
_MODEL_LOCK = Lock()

_NAVIGATION_TERMS = {
    "home",
    "login",
    "logout",
    "sign in",
    "sign up",
    "register",
    "menu",
    "search",
    "privacy policy",
    "terms of use",
    "copyright",
    "skip to content",
}


def split_text_into_chunks(text: str, max_length: int = 300000) -> list[str]:
    """Split text into fixed-size chunks for safe spaCy processing."""
    if not text:
        return []

    return [text[i : i + max_length] for i in range(0, len(text), max_length)]


def _get_nlp() -> Language:
    global _NLP
    if _NLP is None:
        with _MODEL_LOCK:
            if _NLP is None:
                logger.info("Loading spaCy model: %s", _SPACY_MODEL_NAME)
                _NLP = spacy.load(_SPACY_MODEL_NAME, disable=["parser"])
                _NLP.max_length = 2_000_000
                if "sentencizer" not in _NLP.pipe_names:
                    _NLP.add_pipe("sentencizer")
    return _NLP


def classify_clause(clause_text: str) -> str:
    text = clause_text.lower()
    if "must" in text or "shall" in text or "required" in text:
        return "obligation"
    if "penalty" in text or "fine" in text or "punishable" in text:
        return "penalty"
    if re.search(r"\bif\b", text) or "provided that" in text:
        return "condition"
    return "general"


def _normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip().lower()


def clean_text(text: str, lowercase: bool = False) -> str:
    """Clean noisy text while preserving legal meaning.

    Steps:
    - Remove HTML tags
    - Remove obvious navigation fragments
    - Remove repeated header/footer-like lines
    - Normalize whitespace and special characters
    """
    if not text or not text.strip():
        return ""

    # Strip HTML markup while keeping visible text content.
    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()
    extracted_text = soup.get_text("\n", strip=True)

    raw_lines = [line.strip() for line in extracted_text.splitlines() if line.strip()]
    if not raw_lines:
        return ""

    normalized_counts: dict[str, int] = {}
    for line in raw_lines:
        key = _normalize_line(line)
        normalized_counts[key] = normalized_counts.get(key, 0) + 1

    filtered_lines: list[str] = []
    for line in raw_lines:
        key = _normalize_line(line)
        if not key:
            continue

        # Drop short navigation-only lines.
        if key in _NAVIGATION_TERMS:
            continue
        if len(key) <= 18 and any(term == key for term in _NAVIGATION_TERMS):
            continue

        # Drop repeated short page furniture (header/footer style).
        if normalized_counts.get(key, 0) > 2 and len(key) < 120:
            continue

        # Drop noisy page markers like "page 1".
        if re.fullmatch(r"page\s+\d+(\s+of\s+\d+)?", key):
            continue

        filtered_lines.append(line)

    cleaned = "\n".join(filtered_lines)

    # Normalize unusual symbols but preserve legal punctuation.
    cleaned = cleaned.replace("\u00a0", " ")
    cleaned = re.sub(r"[^\w\s\.,;:()\[\]\-/'\"%$]", " ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = cleaned.strip()

    return cleaned.lower() if lowercase else cleaned


def preprocess_text(text: str) -> list[dict]:
    """Preprocess legal text using chunk-based spaCy processing only."""
    if not text or not text.strip():
        return []

    cleaned_text = clean_text(text)
    if not cleaned_text:
        return []

    logger.info("[PREPROCESS] Text length: %s", len(cleaned_text))
    chunks = split_text_into_chunks(cleaned_text)
    logger.info("[PREPROCESS] Total chunks: %s", len(chunks))

    nlp = _get_nlp()
    all_clauses: list[dict] = []
    for index, chunk in enumerate(chunks, start=1):
        logger.info("[PREPROCESS] Processing chunk %s/%s", index, len(chunks))

        doc = nlp(chunk)
        for sent in doc.sents:
            clause_text = sent.text.strip()
            if not clause_text:
                continue

            all_clauses.append(
                {
                    "text": clause_text,
                    "type": classify_clause(clause_text),
                    "entities": [ent.text for ent in doc.ents],
                }
            )

    logger.info("[PREPROCESS] Total clauses: %s", len(all_clauses))
    return all_clauses


def validate_pipeline_output(data: dict) -> bool:
    """Validate that pipeline output has non-empty text and clause objects."""
    text = data.get("text")
    clauses = data.get("clauses")

    if not isinstance(text, str) or not text.strip():
        return False

    if not isinstance(clauses, list) or not clauses:
        return False

    for clause in clauses:
        if not isinstance(clause, dict):
            return False
        if not isinstance(clause.get("text"), str) or not clause.get("text", "").strip():
            return False

    return True


def preprocess_file(file_path: str) -> list[dict]:
    """Preprocess text from a file path using the legal pipeline."""
    path = Path(file_path)
    logger.info("Preprocessing file: %s", path)

    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")

    text = path.read_text(encoding="utf-8")
    return preprocess_text(text)
