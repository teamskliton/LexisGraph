import logging
import hashlib
from pathlib import Path
import re
from threading import Lock

import spacy
from bs4 import BeautifulSoup
from spacy.language import Language

from app.services.embedding_model import get_embedding_model

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
_INVALID_CLAUSE_KEYWORDS = (
    "CHAPTER",
    "ACT NO",
    "LIST OF",
    "ABBREVIATIONS",
    "TABLE OF CONTENTS",
)
_DEFAULT_DOMAIN = "IT"
_DEFAULT_MAX_CLAUSES = 500
_MAX_ENTITIES_PER_CLAUSE = 5


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
    if "must not" in text or "prohibited" in text:
        return "prohibition"
    if "shall" in text or "must" in text:
        return "obligation"
    if "may" in text:
        return "permission"
    if "if" in text or "where" in text:
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
    cleaned = re.sub(r"\n+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\b\d+\b", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip()

    return cleaned.lower() if lowercase else cleaned


def is_valid_clause(text: str) -> bool:
    value = text.strip()
    if len(value) < 40:
        return False
    if value.isupper():
        return False
    if any(keyword in value.upper() for keyword in _INVALID_CLAUSE_KEYWORDS):
        return False
    if re.match(r"^[\d\W]+$", value):
        return False
    return True


def is_legal_clause(text: str) -> bool:
    value = text.lower()
    keywords = [
        "shall",
        "must",
        "may",
        "required",
        "prohibited",
        "not allowed",
        "should",
        "liable",
        "penalty",
        "if",
        "where",
        "subject to",
    ]
    return any(word in value for word in keywords)


def hash_clause(clause_text: str) -> str:
    return hashlib.md5(clause_text.encode("utf-8")).hexdigest()


def _extract_clause_entities(nlp: Language, clause_text: str) -> list[str]:
    sent_doc = nlp(clause_text)
    entities: list[str] = []
    seen: set[str] = set()
    for ent in sent_doc.ents:
        entity_text = ent.text.strip()
        if len(entity_text) <= 2:
            continue
        key = entity_text.lower()
        if key in seen:
            continue
        seen.add(key)
        entities.append(entity_text)
        if len(entities) >= _MAX_ENTITIES_PER_CLAUSE:
            break
    return entities


def extract_structure(text: str) -> tuple[str | None, str | None, str | None]:
    words = text.split()
    subject = words[0] if len(words) > 0 else None
    action = words[1] if len(words) > 1 else None
    obj = " ".join(words[2:]) if len(words) > 2 else None
    return subject, action, obj


def preprocess_text(text: str, max_clauses: int = _DEFAULT_MAX_CLAUSES) -> list[dict]:
    """Preprocess legal text and emit clause metadata plus embeddings."""
    logger.info("� ===== PREPROCESS PIPELINE STARTED =====")
    logger.info("�🔥 PREPROCESS FUNCTION CALLED")
    if not text or not text.strip():
        return []

    logger.info("[PREPROCESS] Input length: %s characters", len(text))
    logger.info("[PREPROCESS] STEP 1: Input received")

    cleaned_text = clean_text(text)
    if not cleaned_text:
        return []

    logger.info("[PREPROCESS] Cleaned text length: %s", len(cleaned_text))
    logger.info("[PREPROCESS] STEP 2: Text cleaned length=%s", len(cleaned_text))
    nlp = _get_nlp()
    all_clauses: list[dict] = []
    clause_texts_for_embedding: list[str] = []
    seen_clause_hashes: set[str] = set()
    total_extracted = 0
    valid_clauses = 0
    filtered_out = 0
    duplicates_skipped = 0

    chunks = split_text_into_chunks(cleaned_text)
    logger.info("[PREPROCESS] Total chunks created: %s", len(chunks))
    logger.info("[PREPROCESS] STEP 3: Chunking complete total_chunks=%s", len(chunks))
    for index, chunk in enumerate(chunks, start=1):
        logger.info("🔹 Processing chunk %s/%s", index, len(chunks))
        clauses_before = len(all_clauses)
        logger.info("[PREPROCESS] STEP 4: Processing chunk %s/%s", index, len(chunks))
        doc = nlp(chunk)
        for sent in doc.sents:
            total_extracted += 1
            clause_text = sent.text.strip()
            if not is_valid_clause(clause_text):
                filtered_out += 1
                continue
            if not is_legal_clause(clause_text):
                filtered_out += 1
                continue

            clause_key = hash_clause(clause_text.lower())
            if clause_key in seen_clause_hashes:
                duplicates_skipped += 1
                continue
            seen_clause_hashes.add(clause_key)

            valid_clauses += 1
            subject, action, obj = extract_structure(clause_text)
            all_clauses.append(
                {
                    "id": f"C{len(all_clauses) + 1}",
                    "text": clause_text,
                    "type": classify_clause(clause_text),
                    "subject": subject,
                    "action": action,
                    "object": obj,
                    "entities": _extract_clause_entities(nlp, clause_text),
                }
            )
            clause_texts_for_embedding.append(clause_text)
            if len(all_clauses) >= max_clauses:
                logger.info("[PREPROCESS] Clause cap reached max_clauses=%s", max_clauses)
                break
        clauses_after = len(all_clauses)
        logger.info("   → Extracted %s clauses from this chunk", clauses_after - clauses_before)
        progress = int((index / len(chunks)) * 100) if chunks else 100
        logger.info("📈 Progress: %s%%", progress)
        if len(all_clauses) >= max_clauses:
            break

    if all_clauses:
        logger.info("⚡ Generating embeddings...")
        logger.info("[PREPROCESS] STEP 5: Embedding generation started clauses=%s", len(all_clauses))
        embedder = get_embedding_model()
        vectors = embedder.encode(clause_texts_for_embedding)
        for index, clause in enumerate(all_clauses):
            clause["embedding"] = vectors[index].tolist()
        logger.info("✅ Embeddings generated successfully")

    logger.info(
        "[PREPROCESS] STEP 6: Completed total_extracted=%s valid_clauses=%s filtered_out=%s duplicates_skipped=%s final_stored=%s",
        total_extracted,
        valid_clauses,
        filtered_out,
        duplicates_skipped,
        len(all_clauses),
    )
    logger.info("[PREPROCESS] Raw clauses: %s", total_extracted)
    logger.info("[PREPROCESS] After filtering: %s", valid_clauses)
    logger.info("[PREPROCESS] Removed noise: %s", filtered_out)
    logger.info("Total clauses extracted: %s", total_extracted)
    logger.info("Valid clauses: %s", valid_clauses)
    logger.info("Final stored: %s", len(all_clauses))
    final_clauses = all_clauses
    logger.info("🎉 ===== PREPROCESS COMPLETED =====")
    logger.info("📊 Final clauses stored: %s", len(final_clauses))
    logger.info("📉 Reduction: %s → %s", total_extracted, len(final_clauses))
    logger.info("📁 JSON saved successfully and ready for Layer 2")
    return all_clauses


def validate_pipeline_output(data: dict) -> bool:
    """Validate compact pipeline output schema."""
    domain = data.get("domain")
    title = data.get("title")
    clauses = data.get("clauses")

    if not isinstance(domain, str) or not domain.strip():
        return False

    if not isinstance(title, str) or not title.strip():
        return False

    if not isinstance(clauses, list) or not clauses:
        return False

    for clause in clauses:
        if not isinstance(clause, dict):
            return False
        if not isinstance(clause.get("text"), str) or not clause.get("text", "").strip():
            return False

    return True


def build_processed_document(
    title: str,
    text: str,
    domain: str | None = None,
    max_clauses: int = _DEFAULT_MAX_CLAUSES,
) -> dict:
    normalized_domain = (domain or _DEFAULT_DOMAIN).strip().upper() or _DEFAULT_DOMAIN
    normalized_title = Path(title).name.strip() or "Untitled"
    clauses = preprocess_text(text, max_clauses=max_clauses)
    return {
        "domain": normalized_domain,
        "title": normalized_title,
        "clauses": clauses,
    }


def preprocess_file(file_path: str) -> list[dict]:
    """Preprocess text from a file path using the legal pipeline."""
    path = Path(file_path)
    logger.info("Preprocessing file: %s", path)

    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")

    text = path.read_text(encoding="utf-8")
    return preprocess_text(text)
