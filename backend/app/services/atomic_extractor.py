"""
Atomic Regulatory Requirement Extractor for LexisGraph.

Problem this solves
-------------------
The current preprocessing pipeline (preprocessing.py) uses spaCy's sentencizer to
split regulation text into sentence-level clauses.  That works well for semantic
embeddings but produces overly coarse chunks when a single section contains several
*distinct* obligations (e.g. Section 8 of the DPDP Act 2023 has at least 7 separate
requirements).  When those obligations are lumped together, the downstream
applicability classifier cannot make fine-grained decisions, and the LLM compliance
evaluator tries to satisfy *all* sub-obligations at once, which inflates NON_COMPLIANT
verdicts.

What this module does
---------------------
Given a list of raw clause dicts (as returned by retrieve_clauses_for_document), it:

1. Groups clauses into batches and calls the LLM once per batch, asking it to
   decompose each clause into one or more atomic requirements with structured metadata.
2. Returns a flat list of AtomicRequirement objects — each representing a single,
   independently assessable obligation.
3. Falls back gracefully (one requirement per clause, metadata inferred from text)
   when the LLM is unavailable or returns unparseable output.

AtomicRequirement schema
------------------------
{
    "requirement_id":   str   — unique id, e.g. "CLAUSE_ID_R1"
    "clause_id":        str   — source clause_id from the original storage layer
    "regulation":       str   — regulation name (propagated from document title)
    "section":          str   — section reference extracted from text or metadata
    "requirement_text": str   — the single distilled obligation sentence
    "topic":            str   — e.g. "Data Retention", "Consent", "Board Administration"
    "actor":            str   — who must act: "Data Fiduciary", "Central Government", …
    "action":           str   — what must be done: "Erase", "Notify", "Appoint", …
    "object":           str   — what is acted upon: "Personal Data", "Board Members", …
    "trigger":          str   — precondition/trigger for the obligation or ""
    "obligation_type":  str   — MANDATORY | CONDITIONAL | ADMINISTRATIVE | PROCEDURAL | INFORMATIONAL
    "source_reference": str   — human-readable reference, e.g. "Section 8(7)"
}

Design constraints
------------------
- Uses _resolve_reasoning() from llm_reasoning.py — no new HTTP clients.
- Batch size: 6 clauses per LLM call (generous context window, low latency).
- Rule-based fallback: each clause becomes exactly one requirement; metadata is
  inferred from keyword patterns (obligation_type classification already exists in
  preprocessing.py's classify_clause).
- Never raises: all errors are caught, logged, and fall back to the rule-based path.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# LLM batch size — how many clauses to send per extraction call
_EXTRACT_BATCH_SIZE = 6

# ── Obligation-type keyword mapping for rule-based fallback ─────────────────
_OBLIGATION_TYPE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(government|parliament|ministry|authority|board|tribunal|court|committee|chairperson|member|secretary)\b", re.I), "ADMINISTRATIVE"),
    (re.compile(r"\b(appeal|petition|adjudicat|penalty|fine|punish|prosecut)\b", re.I), "PROCEDURAL"),
    (re.compile(r"\b(shall|must|required to|obliged to|is bound to)\b", re.I), "MANDATORY"),
    (re.compile(r"\b(may|can|is permitted|at its discretion)\b", re.I), "CONDITIONAL"),
    (re.compile(r"\b(means|defined as|refers to|for the purposes of)\b", re.I), "INFORMATIONAL"),
]

_ACTOR_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(central government|state government|government)\b", re.I), "Central Government"),
    (re.compile(r"\b(data protection board|the board|dpb)\b", re.I), "Data Protection Board"),
    (re.compile(r"\b(data fiduciary|fiduciary)\b", re.I), "Data Fiduciary"),
    (re.compile(r"\b(data processor|processor)\b", re.I), "Data Processor"),
    (re.compile(r"\b(data principal|principal)\b", re.I), "Data Principal"),
    (re.compile(r"\b(consent manager)\b", re.I), "Consent Manager"),
]

_TOPIC_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(retain|retention|storage period|store|kept|deletion|erase|erasure|purge)\b", re.I), "Data Retention"),
    (re.compile(r"\b(consent|withdraw|opt.?out|affirmative)\b", re.I), "Consent"),
    (re.compile(r"\b(breach|incident|notify|notification|report.*breach)\b", re.I), "Data Breach Notification"),
    (re.compile(r"\b(access|portability|correct|nomination|grievance|right)\b", re.I), "Data Principal Rights"),
    (re.compile(r"\b(transfer|cross.?border|internationally|recipient country)\b", re.I), "Cross-Border Transfer"),
    (re.compile(r"\b(security|safeguard|protect.*data|technical measure|organizational measure)\b", re.I), "Data Security"),
    (re.compile(r"\b(purpose limitation|specified purpose|beyond.*purpose)\b", re.I), "Purpose Limitation"),
    (re.compile(r"\b(board|tribunal|appeal|adjudication|penalty|fine|chairperson|member|appoint)\b", re.I), "Board Administration"),
    (re.compile(r"\b(rule.*prescribe|notify.*rule|schedule|regulation.*made by)\b", re.I), "Rule Making"),
    (re.compile(r"\b(registration|significant.*fiduciary|blacklist)\b", re.I), "Fiduciary Classification"),
    (re.compile(r"\b(processing.*personal data|lawful.*basis|legitimate use)\b", re.I), "Lawful Processing"),
]


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class AtomicRequirement:
    """Single, independently assessable regulatory obligation extracted from a clause."""

    requirement_id: str
    clause_id: str           # source clause_id from storage layer
    regulation: str          # regulation document name
    section: str             # e.g. "Section 8(7)"
    requirement_text: str    # the single distilled obligation sentence
    topic: str               # semantic topic bucket
    actor: str               # who must act
    action: str              # what must be done
    object: str              # what is acted upon
    trigger: str             # precondition / trigger or ""
    obligation_type: str     # MANDATORY | CONDITIONAL | ADMINISTRATIVE | PROCEDURAL | INFORMATIONAL
    source_reference: str    # human-readable reference for audit trail

    # Carry-forward embedding from the source clause for Qdrant search reuse
    embedding: list[float] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Rule-based helpers ────────────────────────────────────────────────────────

def _infer_obligation_type(text: str) -> str:
    for pattern, label in _OBLIGATION_TYPE_PATTERNS:
        if pattern.search(text):
            return label
    return "MANDATORY"


def _infer_actor(text: str) -> str:
    for pattern, label in _ACTOR_PATTERNS:
        if pattern.search(text):
            return label
    return "Data Fiduciary"


def _infer_topic(text: str) -> str:
    for pattern, label in _TOPIC_PATTERNS:
        if pattern.search(text):
            return label
    return "General Compliance"


def _infer_section(text: str, clause_id: str) -> str:
    """Extract section reference from clause text or fall back to clause_id."""
    m = re.search(r"\b(section|clause|article|sub-section|subsection|schedule|rule)\s+(\d+[\w()\-\.]*)", text, re.I)
    if m:
        return m.group(0).strip()
    return clause_id


def _make_fallback_requirement(clause: dict[str, Any], regulation_name: str) -> AtomicRequirement:
    """Create one AtomicRequirement directly from a clause dict (rule-based, no LLM)."""
    text = str(clause.get("text") or "").strip()
    clause_id = str(clause.get("clause_id") or clause.get("id") or str(uuid.uuid4()))
    words = text.split()
    action_guess = words[1] if len(words) > 1 else "comply"
    object_guess = " ".join(words[2:6]) if len(words) > 2 else "requirement"

    return AtomicRequirement(
        requirement_id=f"{clause_id}_R1",
        clause_id=clause_id,
        regulation=regulation_name,
        section=_infer_section(text, clause_id),
        requirement_text=text,
        topic=_infer_topic(text),
        actor=_infer_actor(text),
        action=action_guess,
        object=object_guess,
        trigger="",
        obligation_type=_infer_obligation_type(text),
        source_reference=_infer_section(text, clause_id),
        embedding=clause.get("embedding") or [],
    )


# ── LLM extraction helpers ────────────────────────────────────────────────────

def _build_extraction_prompt(clauses: list[dict[str, Any]], regulation_name: str) -> str:
    """Build a structured prompt that asks the LLM to decompose clauses into atomic requirements."""
    clause_blocks: list[str] = []
    for i, clause in enumerate(clauses, start=1):
        text = str(clause.get("text") or "").strip()
        cid = str(clause.get("clause_id") or clause.get("id") or f"C{i}")
        clause_blocks.append(f"--- CLAUSE {i} (id={cid}) ---\n{text}")

    clauses_section = "\n\n".join(clause_blocks)
    n = len(clauses)

    return (
        f"You are a legal analyst working on the regulation: \"{regulation_name}\".\n"
        f"Below are {n} regulation clause(s). For each clause, extract ALL distinct atomic obligations.\n"
        "Each atomic requirement must be a single, independently verifiable legal obligation.\n\n"
        "EXTRACTION RULES:\n"
        "1. One requirement = one obligation that can be satisfied or violated independently.\n"
        "2. If a clause contains multiple obligations, extract each as a separate requirement.\n"
        "3. Do NOT invent obligations not present in the clause text.\n"
        "4. obligation_type must be one of: MANDATORY | CONDITIONAL | ADMINISTRATIVE | PROCEDURAL | INFORMATIONAL\n"
        "   - ADMINISTRATIVE: concerns government bodies, boards, tribunals, appointments, rule-making\n"
        "   - PROCEDURAL: concerns legal processes, appeals, penalties, enforcement\n"
        "   - MANDATORY: 'shall', 'must', direct corporate/fiduciary obligation\n"
        "   - CONDITIONAL: 'may', 'if', 'where', permission-based or trigger-based\n"
        "   - INFORMATIONAL: definitions, clarifications, scope statements\n\n"
        f"{clauses_section}\n\n"
        f"Return ONLY a valid JSON array with ALL requirements from ALL {n} clauses.\n"
        "Required schema (no markdown fences, no preamble):\n"
        "[\n"
        "  {\n"
        "    \"clause_id\": \"original clause id string\",\n"
        "    \"requirement_text\": \"single obligation sentence\",\n"
        "    \"topic\": \"e.g. Data Retention | Consent | Board Administration | Cross-Border Transfer | ...\",\n"
        "    \"actor\": \"who must act, e.g. Data Fiduciary | Central Government | Data Principal\",\n"
        "    \"action\": \"verb phrase, e.g. Erase | Notify | Appoint | Maintain\",\n"
        "    \"object\": \"what is acted upon, e.g. Personal Data | Board Members\",\n"
        "    \"trigger\": \"precondition or empty string\",\n"
        "    \"obligation_type\": \"MANDATORY | CONDITIONAL | ADMINISTRATIVE | PROCEDURAL | INFORMATIONAL\",\n"
        "    \"source_reference\": \"section/clause reference if determinable from text, or empty string\"\n"
        "  }\n"
        "]"
    )


def _parse_extraction_response(
    llm_response: str,
    clauses: list[dict[str, Any]],
    regulation_name: str,
) -> list[AtomicRequirement] | None:
    """Parse the LLM response JSON array into AtomicRequirement objects."""
    if not llm_response or not llm_response.strip():
        return None

    # Extract JSON array robustly (handle markdown fences)
    cleaned = llm_response.strip()
    raw: list | None = None

    try:
        raw = json.loads(cleaned)
    except Exception:
        pass

    if raw is None:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
        if m:
            try:
                raw = json.loads(m.group(1).strip())
            except Exception:
                pass

    if raw is None:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end > start:
            try:
                raw = json.loads(cleaned[start: end + 1])
            except Exception:
                pass

    if not isinstance(raw, list):
        return None

    # Build a lookup for embeddings by clause_id
    embedding_by_id: dict[str, list[float]] = {
        str(c.get("clause_id") or c.get("id") or ""): c.get("embedding") or []
        for c in clauses
    }

    results: list[AtomicRequirement] = []
    req_counter: dict[str, int] = {}

    for entry in raw:
        if not isinstance(entry, dict):
            continue
        req_text = str(entry.get("requirement_text") or "").strip()
        if not req_text or len(req_text) < 20:
            continue

        cid = str(entry.get("clause_id") or "UNKNOWN")
        req_counter[cid] = req_counter.get(cid, 0) + 1
        req_id = f"{cid}_R{req_counter[cid]}"

        obligation_type = str(entry.get("obligation_type") or "MANDATORY").upper()
        if obligation_type not in {"MANDATORY", "CONDITIONAL", "ADMINISTRATIVE", "PROCEDURAL", "INFORMATIONAL"}:
            obligation_type = "MANDATORY"

        results.append(
            AtomicRequirement(
                requirement_id=req_id,
                clause_id=cid,
                regulation=regulation_name,
                section=str(entry.get("source_reference") or ""),
                requirement_text=req_text,
                topic=str(entry.get("topic") or _infer_topic(req_text)),
                actor=str(entry.get("actor") or _infer_actor(req_text)),
                action=str(entry.get("action") or "comply"),
                object=str(entry.get("object") or "requirement"),
                trigger=str(entry.get("trigger") or ""),
                obligation_type=obligation_type,
                source_reference=str(entry.get("source_reference") or ""),
                embedding=embedding_by_id.get(cid) or [],
            )
        )

    return results if results else None


# ── Public API ────────────────────────────────────────────────────────────────

class AtomicRequirementExtractor:
    """
    Extracts atomic regulatory requirements from raw clause dicts.

    Usage
    -----
    extractor = AtomicRequirementExtractor(regulation_name="DPDP Act 2023")
    requirements = extractor.extract(clauses)  # list[AtomicRequirement]
    """

    def __init__(self, regulation_name: str = "Regulation", batch_size: int = _EXTRACT_BATCH_SIZE) -> None:
        self.regulation_name = regulation_name
        self.batch_size = batch_size

    # ── Per-batch helpers ────────────────────────────────────────────────────

    def _extract_batch(self, batch: list[dict[str, Any]]) -> list[AtomicRequirement]:
        """Call LLM on one batch; fall back to rule-based on any failure."""
        try:
            from app.services.llm_reasoning import _resolve_reasoning
            prompt = _build_extraction_prompt(batch, self.regulation_name)
            llm_response = _resolve_reasoning(prompt)
            if llm_response:
                parsed = _parse_extraction_response(llm_response, batch, self.regulation_name)
                if parsed:
                    logger.debug(
                        "[ATOMIC_EXTRACTOR] LLM extracted %s requirements from %s clauses",
                        len(parsed), len(batch),
                    )
                    return parsed
                logger.warning(
                    "[ATOMIC_EXTRACTOR] LLM parse failed for batch of %s clauses, using fallback",
                    len(batch),
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("[ATOMIC_EXTRACTOR] LLM extraction error: %s — using rule-based fallback", exc)

        # Rule-based fallback: one requirement per clause
        return [_make_fallback_requirement(c, self.regulation_name) for c in batch]

    # ── Public method ────────────────────────────────────────────────────────

    def extract(self, clauses: list[dict[str, Any]]) -> list[AtomicRequirement]:
        """
        Extract atomic requirements from all clauses.

        Parameters
        ----------
        clauses:
            List of clause dicts as returned by retrieve_clauses_for_document().
            Each dict must have at least "text" and optionally "clause_id", "embedding".

        Returns
        -------
        list[AtomicRequirement]
            Flat list of all atomic requirements across all clauses.
            Always non-empty when clauses is non-empty (fallback guarantees at least
            one requirement per clause).
        """
        if not clauses:
            return []

        # Filter out clauses with no text before sending to LLM
        valid_clauses = [c for c in clauses if str(c.get("text") or "").strip()]
        if not valid_clauses:
            return []

        logger.info(
            "[ATOMIC_EXTRACTOR] Starting atomic extraction: %s clauses → regulation='%s' batch_size=%s",
            len(valid_clauses), self.regulation_name, self.batch_size,
        )

        all_requirements: list[AtomicRequirement] = []
        total_batches = -(-len(valid_clauses) // self.batch_size)  # ceil div

        for batch_idx in range(0, len(valid_clauses), self.batch_size):
            batch = valid_clauses[batch_idx: batch_idx + self.batch_size]
            batch_num = batch_idx // self.batch_size + 1
            logger.info(
                "[ATOMIC_EXTRACTOR] Batch %s/%s: extracting from %s clauses",
                batch_num, total_batches, len(batch),
            )
            batch_requirements = self._extract_batch(batch)
            all_requirements.extend(batch_requirements)

        logger.info(
            "[ATOMIC_EXTRACTOR] Extraction complete: %s clauses → %s atomic requirements",
            len(valid_clauses), len(all_requirements),
        )
        return all_requirements
