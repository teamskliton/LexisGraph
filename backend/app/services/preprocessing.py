import logging
from pathlib import Path
import re
from threading import Lock
from collections import Counter

import spacy
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer
from spacy.language import Language

logger = logging.getLogger(__name__)

_SPACY_MODEL_NAME = "en_core_web_sm"
_EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

_NLP: Language | None = None
_EMBEDDER: SentenceTransformer | None = None
_MODEL_LOCK = Lock()

_OBLIGATION_KEYWORDS = ("must", "shall", "required")
_PENALTY_KEYWORDS = (
    "penalty",
    "penalties",
    "fine",
    "punishable",
    "disciplinary",
    "violation",
)
_CONDITION_KEYWORDS = ("if", "provided that")

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
    """Split large text into fixed-size chunks for safe NLP processing."""
    if not text:
        return []
    return [text[index : index + max_length] for index in range(0, len(text), max_length)]


def _get_nlp() -> Language:
    global _NLP
    if _NLP is None:
        with _MODEL_LOCK:
            if _NLP is None:
                logger.info("Loading spaCy model: %s", _SPACY_MODEL_NAME)
                _NLP = spacy.load(_SPACY_MODEL_NAME)
                _NLP.max_length = 2_000_000
                if (
                    "parser" not in _NLP.pipe_names
                    and "senter" not in _NLP.pipe_names
                    and "sentencizer" not in _NLP.pipe_names
                ):
                    _NLP.add_pipe("sentencizer")
    return _NLP


def _get_embedder() -> SentenceTransformer:
    global _EMBEDDER
    if _EMBEDDER is None:
        with _MODEL_LOCK:
            if _EMBEDDER is None:
                logger.info("Loading sentence-transformers model: %s", _EMBEDDING_MODEL_NAME)
                _EMBEDDER = SentenceTransformer(_EMBEDDING_MODEL_NAME)
    return _EMBEDDER


def _contains_any_keyword(text_lower: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text_lower for keyword in keywords)


def _classify_clause(clause_text: str) -> str:
    text_lower = clause_text.lower()

    if _contains_any_keyword(text_lower, _OBLIGATION_KEYWORDS):
        return "obligation"

    if _contains_any_keyword(text_lower, _PENALTY_KEYWORDS):
        return "penalty"

    if _contains_any_keyword(text_lower, _CONDITION_KEYWORDS):
        return "condition"

    return "general"


def classify_clause(clause_text: str) -> str:
    """Public classifier wrapper retained for backward compatibility."""
    return _classify_clause(clause_text)


def _split_long_clause(text: str, max_length: int = 300) -> list[str]:
    """Split very long clauses on commas and conjunction hints."""
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= max_length:
        return [compact] if compact else []

    segments = re.split(r",\s+(?=(?:if|provided that|and|or|but)\b)", compact, flags=re.IGNORECASE)
    rebuilt: list[str] = []
    buffer = ""
    for segment in segments:
        if not segment:
            continue
        candidate = f"{buffer} {segment}".strip() if buffer else segment.strip()
        if len(candidate) > max_length and buffer:
            rebuilt.append(buffer.strip())
            buffer = segment.strip()
        else:
            buffer = candidate

    if buffer:
        rebuilt.append(buffer.strip())

    return [part for part in rebuilt if part]


def _split_sentence_into_clauses(sentence: str) -> list[str]:
    """Split a sentence using semicolons and bullet markers."""
    if not sentence:
        return []

    parts: list[str] = []
    for block in sentence.split(";"):
        candidate = block.strip()
        if not candidate:
            continue

        # Split bullet/numbered points while preserving content.
        bullet_parts = re.split(r"(?:\n|^)(?:[-*•]|\d+[\.)])\s+", candidate)
        for bullet in bullet_parts:
            normalized = re.sub(r"\s+", " ", bullet).strip()
            if not normalized:
                continue
            parts.extend(_split_long_clause(normalized))

    return [part for part in parts if part]


def _extract_clauses(cleaned_text: str) -> list[str]:
    """Generate clause candidates from cleaned text with robust splitting."""
    nlp = _get_nlp()
    doc = nlp(cleaned_text)

    clauses: list[str] = []
    for sent in doc.sents:
        clauses.extend(_split_sentence_into_clauses(sent.text.strip()))

    return clauses


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
    """Preprocess legal text into classified clauses with NER and embeddings.

    Output format:
    [
        {
            "text": "...",
            "type": "...",
            "entities": [...],
            "embedding": [...]
        }
    ]
    """
    if not text or not text.strip():
        return []

    cleaned_text = clean_text(text)
    if not cleaned_text:
        return []

    embedder = _get_embedder()

    clauses: list[str] = []
    for chunk in split_text_into_chunks(cleaned_text):
        clauses.extend(_extract_clauses(chunk))

    if not clauses:
        return []

    vectors = embedder.encode(clauses)

    nlp = _get_nlp()
    results: list[dict] = []
    for index, clause in enumerate(clauses):
        clause_doc = nlp(clause)
        entities = [
            {
                "text": ent.text,
                "label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char,
            }
            for ent in clause_doc.ents
        ]

        results.append(
            {
                "text": clause,
                "type": _classify_clause(clause),
                "entities": entities,
                "embedding": vectors[index].tolist(),
            }
        )

    type_distribution = Counter(item["type"] for item in results)
    logger.info(
        "Preprocessing complete: clauses=%s distribution=%s",
        len(results),
        dict(type_distribution),
    )

    return results


def process_document(text: str, source: str = "user") -> list[dict]:
    """Process document text into clauses using the shared preprocessing pipeline."""
    _ = source  # Reserved for future source-specific preprocessing behavior.
    return preprocess_text(text)


def validate_pipeline_output(data: dict) -> bool:
    """Validate that pipeline output has text, clauses, and embeddings."""
    text = data.get("text")
    clauses = data.get("clauses")

    if not isinstance(text, str) or not text.strip():
        return False

    if not isinstance(clauses, list) or not clauses:
        return False

    for clause in clauses:
        if not isinstance(clause, dict):
            return False
        embedding = clause.get("embedding")
        if not isinstance(embedding, list) or not embedding:
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
