"""
Applicability Classification Layer for LexisGraph.

Problem this solves
-------------------
The current compliance pipeline evaluates every regulation clause — including
provisions governing the composition of the Data Protection Board, appointment of
government officials, appellate tribunal procedures, and government rule-making
powers — against an internal company policy.  These provisions are structurally
inapplicable to an internal Data Retention Policy; they impose obligations on
government bodies, not on Data Fiduciaries.  Evaluating them against the company
policy produces false NON_COMPLIANT verdicts and deflates the compliance score.

What this module does
---------------------
Given an AtomicRequirement and context about the policy being audited, this module
classifies each requirement as:

    APPLICABLE      — the requirement places an obligation the company must satisfy
                      via its internal policy
    NOT_APPLICABLE  — the requirement concerns government/regulatory administration
                      or is otherwise structurally irrelevant to this policy type
    UNCERTAIN       — genuinely ambiguous; should be evaluated by the LLM compliance
                      engine with a conservative framing

Classification Strategy
-----------------------
Two-stage pipeline (fast → thorough):

Stage 1 — Rule-based fast-path (zero LLM calls):
    Match the requirement's obligation_type, actor, topic, and requirement_text
    against NOT_APPLICABLE and APPLICABLE keyword patterns.  Covers ~70% of cases
    immediately.  Examples of NOT_APPLICABLE patterns:
      - actor contains "Central Government", "Parliament", "Ministry", "Data Protection Board"
      - obligation_type is "ADMINISTRATIVE" or "PROCEDURAL"
      - topic is "Board Administration", "Rule Making", "Appellate Procedure"
      - text contains "tribunal", "chairperson", "appellate authority"

    APPLICABLE fast-path:
      - actor is "Data Fiduciary", "Data Processor", "Consent Manager"
      - obligation_type is "MANDATORY" or "CONDITIONAL"
      - topic is in the CORPORATE_TOPICS set

Stage 2 — LLM classifier (invoked for UNCERTAIN cases only):
    Sends a targeted prompt with structured requirement + policy context to the LLM.
    Returns applicability_status, applicability_reason, applicability_confidence.
    Falls back to UNCERTAIN (pass-through) if LLM fails.

Design constraints
------------------
- Uses _resolve_reasoning() from llm_reasoning.py — no new HTTP clients.
- Rule-based path is synchronous, pure Python, zero I/O.
- LLM path is batched: up to _LLM_BATCH_SIZE requirements per call.
- Never raises: all errors produce UNCERTAIN so the clause still gets evaluated.
- UNCERTAIN requirements enter the compliance engine with a conservative framing note.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from app.services.atomic_extractor import AtomicRequirement

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_LLM_BATCH_SIZE = 10  # requirements per LLM applicability call

# Obligation types that are structurally inapplicable to company internal policies
_NOT_APPLICABLE_OBLIGATION_TYPES = {"ADMINISTRATIVE", "PROCEDURAL"}

# Actor keywords that indicate government/regulatory body — NOT a company obligation
_NOT_APPLICABLE_ACTOR_PATTERNS = re.compile(
    r"\b(central government|state government|parliament|ministry|minister|"
    r"data protection board|the board|dpb|chairperson|adjudicating officer|"
    r"appellate tribunal|high court|supreme court|secretary|official)\b",
    re.I,
)

# Topic buckets that are never applicable to internal company policies
_NOT_APPLICABLE_TOPICS = {
    "Board Administration",
    "Rule Making",
    "Appellate Procedure",
    "Government Administration",
    "Legislative Process",
}

# Text-level keywords that almost always indicate government-admin provisions
_NOT_APPLICABLE_TEXT_PATTERNS = re.compile(
    r"\b(constitute|composition of|appointment of|removal of|chairperson|"
    r"appellate tribunal|adjudicating officer|data protection board|"
    r"prescribe.*rules|rules.*prescribed|ministry of|government shall|"
    r"parliament|legislation|gazette|official gazette|schedule.*act|"
    r"section.*act.*shall|notif(y|ication) in the official)\b",
    re.I,
)

# Actor keywords that indicate corporate/fiduciary actors — likely APPLICABLE
_APPLICABLE_ACTOR_PATTERNS = re.compile(
    r"\b(data fiduciary|data processor|consent manager|organisation|organization|"
    r"company|employer|controller|processor)\b",
    re.I,
)

# Topic buckets that are almost always applicable to internal company policies
_APPLICABLE_TOPICS = {
    "Data Retention",
    "Consent",
    "Data Breach Notification",
    "Data Principal Rights",
    "Cross-Border Transfer",
    "Data Security",
    "Purpose Limitation",
    "Lawful Processing",
    "Fiduciary Classification",
    "General Compliance",
}

# Policy types and their applicable obligation actors for rule-based matching
_POLICY_TYPE_APPLICABLE_ACTORS: dict[str, set[str]] = {
    "DATA_RETENTION_POLICY": {"Data Fiduciary", "Data Processor", "Consent Manager"},
    "INFORMATION_SECURITY_POLICY": {"Data Fiduciary", "Data Processor"},
    "PRIVACY_POLICY": {"Data Fiduciary", "Data Processor", "Consent Manager"},
    "HR_POLICY": {"Data Fiduciary", "Employer"},
    "GENERIC": {"Data Fiduciary", "Data Processor"},
}


# ── Result model ──────────────────────────────────────────────────────────────

@dataclass
class ApplicabilityResult:
    """Classification outcome for a single AtomicRequirement."""

    requirement_id: str
    applicability_status: str          # APPLICABLE | NOT_APPLICABLE | UNCERTAIN
    applicability_reason: str          # human-readable explanation
    applicability_confidence: float    # 0.0 – 1.0
    classified_by: str                 # "RULE_BASED" | "LLM" | "LLM_FALLBACK"


# ── Policy context helper ─────────────────────────────────────────────────────

def _infer_policy_type(policy_title: str) -> str:
    """Infer a coarse policy type label from the policy document title."""
    t = policy_title.lower()
    if any(kw in t for kw in ("retention", "deletion", "archive", "storage")):
        return "DATA_RETENTION_POLICY"
    if any(kw in t for kw in ("security", "infosec", "information security", "isms")):
        return "INFORMATION_SECURITY_POLICY"
    if any(kw in t for kw in ("privacy", "data protection", "gdpr")):
        return "PRIVACY_POLICY"
    if any(kw in t for kw in ("hr", "human resource", "employee", "employment")):
        return "HR_POLICY"
    return "GENERIC"


# ── Stage 1: Rule-based classifier ───────────────────────────────────────────

def _classify_by_rules(
    requirement: AtomicRequirement,
    policy_type: str,
) -> ApplicabilityResult | None:
    """
    Fast-path rule-based classification.

    Returns an ApplicabilityResult when confidence is HIGH enough (>= 0.85).
    Returns None when the case is ambiguous and LLM should decide.
    """
    text = requirement.requirement_text
    actor = requirement.actor
    topic = requirement.topic
    obligation_type = requirement.obligation_type

    # ── NOT_APPLICABLE patterns ──────────────────────────────────────────────

    # Pattern 1: Obligation type is administrative or procedural
    if obligation_type in _NOT_APPLICABLE_OBLIGATION_TYPES:
        return ApplicabilityResult(
            requirement_id=requirement.requirement_id,
            applicability_status="NOT_APPLICABLE",
            applicability_reason=(
                f"This provision has obligation type '{obligation_type}', which indicates a "
                f"government/regulatory administrative or procedural provision rather than a "
                f"corporate compliance obligation. Internal company policies are not required "
                f"to implement or satisfy administrative provisions."
            ),
            applicability_confidence=0.92,
            classified_by="RULE_BASED",
        )

    # Pattern 2: Actor is a government body or regulatory authority
    if _NOT_APPLICABLE_ACTOR_PATTERNS.search(actor):
        return ApplicabilityResult(
            requirement_id=requirement.requirement_id,
            applicability_status="NOT_APPLICABLE",
            applicability_reason=(
                f"This provision places an obligation on '{actor}', which is a government, "
                f"regulatory body, or public official — not a Data Fiduciary or company. "
                f"Internal policies are not expected to satisfy obligations imposed on "
                f"government/regulatory actors."
            ),
            applicability_confidence=0.95,
            classified_by="RULE_BASED",
        )

    # Pattern 3: Topic bucket is in NOT_APPLICABLE set
    if topic in _NOT_APPLICABLE_TOPICS:
        return ApplicabilityResult(
            requirement_id=requirement.requirement_id,
            applicability_status="NOT_APPLICABLE",
            applicability_reason=(
                f"This provision belongs to the topic '{topic}', which governs "
                f"government/regulatory administration and is structurally inapplicable "
                f"to an internal company {policy_type.replace('_', ' ').title()}."
            ),
            applicability_confidence=0.90,
            classified_by="RULE_BASED",
        )

    # Pattern 4: Text-level government-admin keywords
    if _NOT_APPLICABLE_TEXT_PATTERNS.search(text):
        return ApplicabilityResult(
            requirement_id=requirement.requirement_id,
            applicability_status="NOT_APPLICABLE",
            applicability_reason=(
                "The requirement text contains language that indicates this is a "
                "government/regulatory administration provision (e.g. board composition, "
                "official gazette notification, appellate tribunal). Internal company "
                "policies are not expected to address such provisions."
            ),
            applicability_confidence=0.88,
            classified_by="RULE_BASED",
        )

    # ── APPLICABLE patterns ──────────────────────────────────────────────────

    applicable_actors = _POLICY_TYPE_APPLICABLE_ACTORS.get(policy_type, _POLICY_TYPE_APPLICABLE_ACTORS["GENERIC"])

    # Pattern 5: Actor is a corporate/fiduciary actor AND topic is in APPLICABLE set
    actor_is_corporate = _APPLICABLE_ACTOR_PATTERNS.search(actor) or any(a.lower() in actor.lower() for a in applicable_actors)
    topic_is_applicable = topic in _APPLICABLE_TOPICS

    if actor_is_corporate and topic_is_applicable and obligation_type == "MANDATORY":
        return ApplicabilityResult(
            requirement_id=requirement.requirement_id,
            applicability_status="APPLICABLE",
            applicability_reason=(
                f"This is a MANDATORY obligation on '{actor}' related to '{topic}', "
                f"which is directly within the scope of a company's internal "
                f"{policy_type.replace('_', ' ').title()}."
            ),
            applicability_confidence=0.93,
            classified_by="RULE_BASED",
        )

    # Pattern 6: Strong applicable topic alone (even without actor confirmation)
    if topic in {"Data Retention", "Data Security", "Data Breach Notification"} and obligation_type == "MANDATORY":
        return ApplicabilityResult(
            requirement_id=requirement.requirement_id,
            applicability_status="APPLICABLE",
            applicability_reason=(
                f"This mandatory provision concerns '{topic}', which is a core obligation "
                f"that companies must address in their internal compliance policies."
            ),
            applicability_confidence=0.87,
            classified_by="RULE_BASED",
        )

    # ── Ambiguous: let LLM decide ────────────────────────────────────────────
    return None


# ── Stage 2: LLM classifier ───────────────────────────────────────────────────

def _build_applicability_prompt(
    requirements: list[AtomicRequirement],
    policy_title: str,
    policy_type: str,
    policy_scope: str,
) -> str:
    """Build a batch LLM prompt to classify multiple requirements' applicability."""
    req_blocks: list[str] = []
    for i, req in enumerate(requirements, start=1):
        req_blocks.append(
            f"--- REQUIREMENT {i} (id={req.requirement_id}) ---\n"
            f"Text: \"{req.requirement_text}\"\n"
            f"Topic: {req.topic} | Actor: {req.actor} | Action: {req.action}\n"
            f"Obligation Type: {req.obligation_type} | Section: {req.source_reference}"
        )

    reqs_section = "\n\n".join(req_blocks)
    n = len(requirements)

    return (
        "You are a senior legal compliance analyst.\n"
        f"Policy under review: \"{policy_title}\"\n"
        f"Policy type: {policy_type.replace('_', ' ')}\n"
        f"Policy scope: {policy_scope}\n\n"
        f"Classify whether each of the {n} regulatory requirement(s) below is APPLICABLE, "
        f"NOT_APPLICABLE, or UNCERTAIN to this specific internal company policy.\n\n"
        "CLASSIFICATION RULES:\n"
        "1. APPLICABLE: The requirement places an obligation that the company (as a Data Fiduciary, "
        "Data Processor, or Employer) must satisfy through its internal policy. "
        "Examples: data erasure timelines, consent mechanisms, breach notification procedures, "
        "data security measures, data principal rights.\n"
        "2. NOT_APPLICABLE: The requirement governs government bodies, regulatory authorities, "
        "judicial/appellate bodies, or parliamentary processes. The company has no obligation "
        "to address these in its internal policies. "
        "Examples: composition of Data Protection Board, appointment of chairperson, "
        "government rule-making, appellate tribunal procedures, penalty collection by the Board.\n"
        "3. UNCERTAIN: The requirement is genuinely ambiguous — it could be interpreted as "
        "applying to the company but is not clearly required by the policy type specified. "
        "Use UNCERTAIN sparingly — only when you cannot confidently choose APPLICABLE or NOT_APPLICABLE.\n\n"
        f"{reqs_section}\n\n"
        f"Return ONLY a valid JSON array of exactly {n} objects (no markdown, no preamble):\n"
        "[\n"
        "  {\n"
        "    \"requirement_id\": \"string\",\n"
        "    \"applicability_status\": \"APPLICABLE | NOT_APPLICABLE | UNCERTAIN\",\n"
        "    \"applicability_reason\": \"one concise sentence explaining the classification\",\n"
        "    \"applicability_confidence\": 0.0\n"
        "  }\n"
        "]"
    )


def _parse_applicability_response(
    llm_response: str,
    requirements: list[AtomicRequirement],
) -> list[ApplicabilityResult] | None:
    """Parse LLM batch applicability response into ApplicabilityResult objects."""
    if not llm_response or not llm_response.strip():
        return None

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

    # Build lookup by requirement_id
    req_by_id: dict[str, AtomicRequirement] = {r.requirement_id: r for r in requirements}
    results: list[ApplicabilityResult] = []

    for entry in raw:
        if not isinstance(entry, dict):
            continue

        req_id = str(entry.get("requirement_id") or "")
        status_raw = str(entry.get("applicability_status") or "UNCERTAIN").upper()
        if status_raw not in {"APPLICABLE", "NOT_APPLICABLE", "UNCERTAIN"}:
            status_raw = "UNCERTAIN"

        try:
            confidence = float(entry.get("applicability_confidence") or 0.75)
            confidence = max(0.0, min(1.0, confidence))
        except (TypeError, ValueError):
            confidence = 0.75

        reason = str(entry.get("applicability_reason") or "No reason provided.").strip()

        # Resolve requirement_id — try direct match first, then positional
        if req_id not in req_by_id:
            idx = len(results)
            req_id = requirements[idx].requirement_id if idx < len(requirements) else req_id

        results.append(
            ApplicabilityResult(
                requirement_id=req_id,
                applicability_status=status_raw,
                applicability_reason=reason,
                applicability_confidence=confidence,
                classified_by="LLM",
            )
        )

    return results if results else None


def _llm_classify_batch(
    requirements: list[AtomicRequirement],
    policy_title: str,
    policy_type: str,
    policy_scope: str,
) -> list[ApplicabilityResult]:
    """Classify a batch of requirements using LLM; fall back to UNCERTAIN on failure."""
    try:
        from app.services.llm_reasoning import _resolve_reasoning
        prompt = _build_applicability_prompt(requirements, policy_title, policy_type, policy_scope)
        llm_response = _resolve_reasoning(prompt)
        if llm_response:
            parsed = _parse_applicability_response(llm_response, requirements)
            if parsed and len(parsed) >= len(requirements):
                return parsed[:len(requirements)]
            if parsed:
                # Partial parse — fill remainder with UNCERTAIN
                filled = list(parsed)
                for req in requirements[len(parsed):]:
                    filled.append(
                        ApplicabilityResult(
                            requirement_id=req.requirement_id,
                            applicability_status="UNCERTAIN",
                            applicability_reason="LLM returned partial response; classified as UNCERTAIN for safety.",
                            applicability_confidence=0.50,
                            classified_by="LLM_FALLBACK",
                        )
                    )
                return filled
        logger.warning("[APPLICABILITY] LLM returned empty/unparseable response for batch of %s requirements", len(requirements))
    except Exception as exc:  # noqa: BLE001
        logger.warning("[APPLICABILITY] LLM classification error: %s — returning UNCERTAIN", exc)

    # Full fallback: UNCERTAIN for all in batch
    return [
        ApplicabilityResult(
            requirement_id=req.requirement_id,
            applicability_status="UNCERTAIN",
            applicability_reason="LLM classification unavailable; requirement classified as UNCERTAIN and will be evaluated conservatively.",
            applicability_confidence=0.50,
            classified_by="LLM_FALLBACK",
        )
        for req in requirements
    ]


# ── Public API ────────────────────────────────────────────────────────────────

class ApplicabilityClassifier:
    """
    Two-stage applicability classifier for atomic regulatory requirements.

    Stage 1: Rule-based fast-path (no LLM calls)
    Stage 2: LLM batch classifier for ambiguous cases

    Usage
    -----
    classifier = ApplicabilityClassifier(
        policy_title="TechNova Data Retention & Deletion Policy",
        policy_scope="Governs retention periods and deletion procedures for personal data.",
    )
    results: dict[str, ApplicabilityResult] = classifier.classify(requirements)
    """

    def __init__(
        self,
        policy_title: str,
        policy_scope: str = "",
        llm_batch_size: int = _LLM_BATCH_SIZE,
    ) -> None:
        self.policy_title = policy_title
        self.policy_type = _infer_policy_type(policy_title)
        self.policy_scope = policy_scope or f"Internal company {self.policy_type.replace('_', ' ').lower()}"
        self.llm_batch_size = llm_batch_size

    def classify(
        self,
        requirements: list[AtomicRequirement],
    ) -> dict[str, ApplicabilityResult]:
        """
        Classify all requirements.

        Parameters
        ----------
        requirements:
            List of AtomicRequirement objects to classify.

        Returns
        -------
        dict[str, ApplicabilityResult]
            Mapping from requirement_id to ApplicabilityResult.
            Every input requirement has exactly one result entry.
        """
        if not requirements:
            return {}

        logger.info(
            "[APPLICABILITY] Classifying %s requirements — policy='%s' type=%s",
            len(requirements), self.policy_title, self.policy_type,
        )

        results: dict[str, ApplicabilityResult] = {}
        llm_queue: list[AtomicRequirement] = []

        # Stage 1: Rule-based fast-path
        for req in requirements:
            rule_result = _classify_by_rules(req, self.policy_type)
            if rule_result is not None:
                results[req.requirement_id] = rule_result
            else:
                llm_queue.append(req)

        rule_count = len(results)
        logger.info(
            "[APPLICABILITY] Rule-based classified %s/%s requirements (%s queued for LLM)",
            rule_count, len(requirements), len(llm_queue),
        )

        # Stage 2: LLM classification for ambiguous cases
        if llm_queue:
            total_llm_batches = -(-len(llm_queue) // self.llm_batch_size)  # ceil div
            for batch_start in range(0, len(llm_queue), self.llm_batch_size):
                batch = llm_queue[batch_start: batch_start + self.llm_batch_size]
                batch_num = batch_start // self.llm_batch_size + 1
                logger.info(
                    "[APPLICABILITY] LLM batch %s/%s: classifying %s requirements",
                    batch_num, total_llm_batches, len(batch),
                )
                batch_results = _llm_classify_batch(
                    batch, self.policy_title, self.policy_type, self.policy_scope
                )
                for res in batch_results:
                    results[res.requirement_id] = res

        # Log summary
        applicable = sum(1 for r in results.values() if r.applicability_status == "APPLICABLE")
        not_applicable = sum(1 for r in results.values() if r.applicability_status == "NOT_APPLICABLE")
        uncertain = sum(1 for r in results.values() if r.applicability_status == "UNCERTAIN")
        logger.info(
            "[APPLICABILITY] Classification complete: APPLICABLE=%s NOT_APPLICABLE=%s UNCERTAIN=%s",
            applicable, not_applicable, uncertain,
        )

        return results

    def classify_one(self, requirement: AtomicRequirement) -> ApplicabilityResult:
        """Classify a single requirement (convenience wrapper)."""
        result_map = self.classify([requirement])
        return result_map.get(
            requirement.requirement_id,
            ApplicabilityResult(
                requirement_id=requirement.requirement_id,
                applicability_status="UNCERTAIN",
                applicability_reason="Classification result not found; defaulting to UNCERTAIN.",
                applicability_confidence=0.50,
                classified_by="LLM_FALLBACK",
            ),
        )
