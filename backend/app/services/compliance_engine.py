"""
Compliance Engine Service — Hybrid GraphRAG & LLM-Powered Compliance Analysis.

Compares a Regulation document against a Policy document for an Organization,
evaluating compliance clause-by-clause using Hybrid GraphRAG retrieval and LLM
reasoning (Gemini / OpenRouter).

Architecture:
    - Qdrant: ONLY source for semantic similarity (vector search)
    - Neo4j: ONLY for structural context (HAS_CLAUSE, BELONGS_TO, HAS_ENTITY)
    - Neo4j is NEVER used for semantic similarity (no SIMILAR_TO queries)
    - Complexity: O(N × K) where N = regulation clauses, K = top vector matches

Pipeline per regulation clause:
    1. Embed regulation clause → Qdrant query_points (Top-K policy clauses)
    2. For each match → Neo4j structural context (hierarchy, neighbors, entities)
    3. Merge Qdrant + Neo4j context → single LLM prompt
    4. LLM verdict → COMPLIANT / PARTIALLY_COMPLIANT / NON_COMPLIANT
    5. On LLM failure → retry once → still failing → mark clause FAILED, continue

Error handling:
    - Qdrant returns nothing → continue (NON_COMPLIANT, "no policy match found")
    - Neo4j has no relationships → continue using vector context only
    - LLM fails → retry once → mark only that clause as failed
    - Never crash the entire report for a single clause failure
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.db.mongo import get_database
from app.db.neo4j import run_query as run_neo4j_query
from app.db.qdrant import get_client as get_qdrant_client
from app.db.models import Document, Organization
from app.services.embedding_model import get_embedding_model
from app.services.graph_builder import generate_clause_id
from app.services.llm_reasoning import _resolve_reasoning
from app.services.preprocessing import preprocess_text
from app.services.vector_store import COLLECTION_USER
from qdrant_client.http.models import FieldCondition, Filter, MatchValue

logger = logging.getLogger(__name__)

# Configuration
_QDRANT_TOP_K = 5            # Top-K policy clause matches per regulation clause
_MIN_VECTOR_SCORE = 0.15     # Minimum vector score to consider a match
_COMPLIANT_THRESHOLD = 0.70  # Fallback heuristic threshold
_PARTIAL_THRESHOLD = 0.45    # Fallback heuristic threshold
_LLM_MAX_RETRIES = 1         # Retry once on LLM failure (applies to each batch)
_LLM_BATCH_SIZE = 8          # How many clauses to evaluate per LLM call (5–10 recommended)


# ---------------------------------------------------------------------------
# Step 1: Clause Retrieval Helpers (MongoDB, Qdrant scroll, Neo4j, Fallback)
# ---------------------------------------------------------------------------

def retrieve_clauses_for_document(doc: Document) -> list[dict[str, Any]]:
    """
    Retrieve clauses for a given document across existing storage layers:
    1. MongoDB document store (using mongo_document_id or doc.id)
    2. Qdrant vector store (using document_id filter — scroll, not search)
    3. Neo4j knowledge graph (using Document-[:HAS_CLAUSE]->Clause nodes)
    4. Fallback: On-disk file text preprocessing
    """
    clauses_by_id: dict[str, dict[str, Any]] = {}
    doc_id_str = str(doc.id)

    # 1. MongoDB check
    try:
        database = get_database()
        mongo_id = doc.mongo_document_id or doc_id_str
        for collection_name in ("user_documents", "external_documents", "domain_documents"):
            collection = database[collection_name]
            mongo_doc = collection.find_one({"$or": [{"_id": mongo_id}, {"mongo_document_id": mongo_id}]})
            if mongo_doc and mongo_doc.get("clauses"):
                for clause in mongo_doc["clauses"]:
                    if isinstance(clause, dict):
                        text = str(clause.get("text") or "").strip()
                        if text:
                            cid = str(clause.get("id") or clause.get("clause_id") or generate_clause_id(text))
                            clauses_by_id[cid] = {
                                "clause_id": cid,
                                "text": text,
                                "type": str(clause.get("type") or "general"),
                                "embedding": clause.get("embedding"),
                            }
    except Exception as exc:  # noqa: BLE001
        logger.warning("MongoDB clause retrieval notice for doc_id=%s: %s", doc_id_str, exc)

    # 2. Qdrant check if Mongo found nothing
    if not clauses_by_id:
        try:
            qclient = get_qdrant_client()
            qfilter = Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=doc_id_str))])
            scroll_res, _ = qclient.scroll(
                collection_name=COLLECTION_USER,
                scroll_filter=qfilter,
                limit=500,
                with_payload=True,
                with_vectors=True,
            )
            for point in scroll_res:
                payload = point.payload or {}
                text = str(payload.get("text") or "").strip()
                if text:
                    cid = str(payload.get("clause_id") or generate_clause_id(text))
                    clauses_by_id[cid] = {
                        "clause_id": cid,
                        "text": text,
                        "type": str(payload.get("type") or "general"),
                        "embedding": point.vector if isinstance(point.vector, list) else None,
                    }
        except Exception as exc:  # noqa: BLE001
            logger.warning("Qdrant clause retrieval notice for doc_id=%s: %s", doc_id_str, exc)

    # 3. Neo4j check if still empty
    if not clauses_by_id:
        try:
            cypher = """
            MATCH (d:Document {id: $doc_id})-[r:HAS_CLAUSE]->(c:Clause)
            RETURN c.id AS clause_id, c.text AS text, c.type AS type
            """
            records = run_neo4j_query(cypher, {"doc_id": doc_id_str})
            for rec in records:
                text = str(rec.get("text") or "").strip()
                if text:
                    cid = str(rec.get("clause_id") or generate_clause_id(text))
                    clauses_by_id[cid] = {
                        "clause_id": cid,
                        "text": text,
                        "type": str(rec.get("type") or "general"),
                        "embedding": None,
                    }
        except Exception as exc:  # noqa: BLE001
            logger.warning("Neo4j clause retrieval notice for doc_id=%s: %s", doc_id_str, exc)

    # 4. Fallback to file reading & preprocessing
    if not clauses_by_id and doc.file_path:
        try:
            from pathlib import Path
            file_path_obj = Path(doc.file_path)
            if file_path_obj.exists():
                text_content = file_path_obj.read_text(encoding="utf-8", errors="ignore")
                processed = preprocess_text(text_content, doc.original_filename, doc.document_type.value)
                for item in processed.get("clauses", []):
                    text = str(item.get("text") or "").strip()
                    if text:
                        cid = generate_clause_id(text)
                        clauses_by_id[cid] = {
                            "clause_id": cid,
                            "text": text,
                            "type": str(item.get("type") or "general"),
                            "embedding": item.get("embedding"),
                        }
        except Exception as exc:  # noqa: BLE001
            logger.warning("File preprocessing fallback notice for doc_id=%s: %s", doc_id_str, exc)

    clauses_list = list(clauses_by_id.values())

    # Ensure embeddings exist for all retrieved clauses
    missing_emb = [item for item in clauses_list if not isinstance(item.get("embedding"), list) or not item["embedding"]]
    if missing_emb:
        try:
            model = get_embedding_model()
            vectors = model.encode([item["text"] for item in missing_emb])
            for item, vec in zip(missing_emb, vectors):
                item["embedding"] = vec.tolist() if hasattr(vec, "tolist") else list(vec)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Embedding generation notice during clause retrieval: %s", exc)

    return clauses_list


# ---------------------------------------------------------------------------
# Step 2: Qdrant Semantic Search — Per-Clause Policy Matching
# ---------------------------------------------------------------------------

def _search_policy_clauses_in_qdrant(
    regulation_embedding: list[float],
    policy_document_id: str,
    top_k: int = _QDRANT_TOP_K,
    all_policy_clauses: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Search Qdrant for Top-K policy clauses matching a regulation clause embedding.

    Uses query_points() with a document_id filter to restrict results to the
    specific policy document. This is O(1) per call (indexed vector search).

    Returns list of dicts with: clause_id, text, score, type
    """
    results: list[dict[str, Any]] = []
    try:
        client = get_qdrant_client()
        query_filter = Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=policy_document_id),
                )
            ]
        )

        response = client.query_points(
            collection_name=COLLECTION_USER,
            query=regulation_embedding,
            query_filter=query_filter,
            limit=top_k,
        )

        for hit in response.points:
            payload = hit.payload or {}
            text = str(payload.get("text") or "").strip()
            if text and float(hit.score) >= _MIN_VECTOR_SCORE:
                results.append({
                    "clause_id": payload.get("clause_id", str(hit.id)),
                    "text": text,
                    "score": float(hit.score),
                    "type": str(payload.get("type") or "general"),
                })

        logger.debug(
            "[COMPLIANCE] Qdrant search: policy_doc=%s hits=%s",
            policy_document_id, len(results),
        )

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Qdrant policy clause search failed for policy_doc=%s: %s",
            policy_document_id, exc,
        )

    if not results and all_policy_clauses:
        def _cosine_sim(v1: list[float], v2: list[float]) -> float:
            dot = sum(a * b for a, b in zip(v1, v2))
            mag1 = sum(a * a for a in v1) ** 0.5
            mag2 = sum(b * b for b in v2) ** 0.5
            return (dot / (mag1 * mag2)) if (mag1 > 0 and mag2 > 0) else 0.0

        for pclause in all_policy_clauses:
            p_emb = pclause.get("embedding")
            if p_emb and isinstance(p_emb, list) and len(p_emb) == len(regulation_embedding):
                sim = _cosine_sim(regulation_embedding, p_emb)
                if sim >= _MIN_VECTOR_SCORE:
                    results.append({
                        "clause_id": pclause.get("clause_id", str(uuid.uuid4())),
                        "text": pclause["text"],
                        "score": float(sim),
                        "type": str(pclause.get("type") or "general"),
                    })
        results.sort(key=lambda x: x["score"], reverse=True)
        results = results[:top_k]

    return results


def _deduplicate_policy_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Sprint 8.2: Deduplicate near-identical policy chunks to avoid showing redundant
    paragraphs in the GraphRAG context or evidence presentation.
    """
    if not matches:
        return []

    unique_matches: list[dict[str, Any]] = []
    seen_token_sets: list[set[str]] = []
    seen_raw_norms: list[str] = []

    for m in matches:
        text = str(m.get("text") or "").strip()
        if not text:
            continue
        cleaned = re.sub(r"[^\w\s]", " ", text.lower())
        norm = re.sub(r"\s+", " ", cleaned).strip()
        tokens = set(norm.split())

        if not tokens:
            continue

        # Check for exact normalized match, substring match, or high token overlap (>= 75%)
        is_dup = False
        for seen_tokens, seen_norm in zip(seen_token_sets, seen_raw_norms):
            if norm == seen_norm or (len(norm) > 30 and len(seen_norm) > 30 and (norm in seen_norm or seen_norm in norm)):
                is_dup = True
                break
            intersection = len(tokens & seen_tokens)
            union = len(tokens | seen_tokens)
            if union > 0 and (intersection / union) >= 0.75:
                is_dup = True
                break

        if not is_dup:
            seen_token_sets.append(tokens)
            seen_raw_norms.append(norm)
            unique_matches.append(m)

    return unique_matches



def _get_graph_similarity_score(reg_clause: str, pol_clause: str) -> float:
    """Return graph similarity score between two clauses."""
    return 0.0



# ---------------------------------------------------------------------------
# Step 3: Neo4j Structural Context Expansion (NO SIMILAR_TO)
# ---------------------------------------------------------------------------

def _get_structural_context(clause_id: str) -> dict[str, Any]:
    """
    Retrieve structural context from Neo4j for a clause.

    Uses ONLY structural relationships:
    - HAS_CLAUSE: find parent document and sibling clauses
    - BELONGS_TO: find domain document
    - HAS_ENTITY: find named entities

    NEVER uses SIMILAR_TO or any semantic similarity relationship.

    Returns dict with: parent_document, sibling_clauses, entities
    """
    context: dict[str, Any] = {
        "parent_document": None,
        "sibling_clauses": [],
        "entities": [],
    }

    try:
        # Get parent document and sibling clauses via HAS_CLAUSE.
        # Documents may use either a plain Clause label (document_processor pipeline)
        # or PolicyClause / RegulationClause (knowledge_graph pipeline).
        doc_query = """
        MATCH (d)-[:HAS_CLAUSE]->(c)
        WHERE (c:Clause OR c:PolicyClause OR c:RegulationClause) AND c.id = $clause_id
        OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(sibling)
        WHERE (sibling:Clause OR sibling:PolicyClause OR sibling:RegulationClause)
          AND sibling.id <> $clause_id
        RETURN
            d.id AS doc_id,
            d.title AS doc_title,
            d.domain AS doc_domain,
            collect(DISTINCT {
                id: sibling.id,
                text: sibling.text,
                type: sibling.type
            })[0..5] AS siblings
        LIMIT 1
        """
        doc_records = run_neo4j_query(doc_query, {"clause_id": clause_id})

        if doc_records:
            rec = doc_records[0]
            if rec.get("doc_id"):
                context["parent_document"] = {
                    "id": rec["doc_id"],
                    "title": rec.get("doc_title") or "Untitled",
                    "domain": rec.get("doc_domain") or "",
                }
            siblings = rec.get("siblings") or []
            context["sibling_clauses"] = [
                s for s in siblings
                if s.get("id") and s.get("text")
            ]

    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j structural context (doc/siblings) notice for clause=%s: %s", clause_id, exc)

    try:
        # Get entities via HAS_ENTITY.
        # Entity nodes are labeled KnowledgeGraphNode:Entity in the knowledge graph pipeline.
        # The Clause node may be a generic Clause or a PolicyClause/RegulationClause.
        entity_query = """
        MATCH (c)-[:HAS_ENTITY]->(e)
        WHERE (c:Clause OR c:PolicyClause OR c:RegulationClause) AND c.id = $clause_id
          AND (e:Entity OR e:KnowledgeGraphNode)
        RETURN e.id AS id, e.name AS name
        LIMIT 5
        """
        entity_records = run_neo4j_query(entity_query, {"clause_id": clause_id})
        context["entities"] = [
            {"id": rec["id"], "name": rec.get("name") or ""}
            for rec in entity_records
            if rec.get("id")
        ]

    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j structural context (entities) notice for clause=%s: %s", clause_id, exc)

    return context


# ---------------------------------------------------------------------------
# Step 4: LLM Compliance Evaluation — Batched (5–10 clauses per LLM call)
# ---------------------------------------------------------------------------

def _format_single_clause_block(
    index: int,
    regulation_clause: str,
    matched_policy_clauses: list[dict[str, Any]],
    structural_context: dict[str, Any],
) -> str:
    """Format one regulation clause + its context as a numbered block for the batch prompt."""
    # Policy matches from Qdrant
    if matched_policy_clauses:
        policy_lines = [
            f"    [{i}] (Sim: {m['score']:.3f}, Type: {m.get('type', 'general')}) \"{m['text'][:300]}\""
            for i, m in enumerate(matched_policy_clauses, 1)
        ]
        policy_section = "\n".join(policy_lines)
    else:
        policy_section = "    [NONE] No matching policy clauses found."

    # Structural context from Neo4j
    ctx_parts = []
    parent = structural_context.get("parent_document")
    if parent:
        ctx_parts.append(f"Doc: {parent.get('title', 'Unknown')} (Domain: {parent.get('domain', 'N/A')})")
    siblings = structural_context.get("sibling_clauses", [])
    if siblings:
        sib_texts = "; ".join(str(s.get("text") or "")[:80] for s in siblings[:2])
        ctx_parts.append(f"Neighbors: {sib_texts}")
    entities = structural_context.get("entities", [])
    if entities:
        names = ", ".join(e.get("name", "") for e in entities if e.get("name"))
        if names:
            ctx_parts.append(f"Entities: {names}")
    structural_section = " | ".join(ctx_parts) if ctx_parts else "No graph context."

    return (
        f"--- CLAUSE {index} ---\n"
        f"REGULATION: \"{regulation_clause[:500]}\"\n"
        f"POLICY MATCHES:\n{policy_section}\n"
        f"GRAPH CONTEXT: {structural_section}"
    )


def _build_batch_prompt(batch_items: list[dict[str, Any]]) -> str:
    """
    Build a single LLM prompt that evaluates multiple regulation clauses at once.
    Enforces strict evidence grounding, 4 distinct outcomes, missing aspects enumeration,
    and conflicting evidence detection.
    """
    clause_blocks = []
    for item in batch_items:
        clause_blocks.append(
            _format_single_clause_block(
                item["index"],
                item["regulation_clause"],
                item["matched_policy_clauses"],
                item["structural_context"],
            )
        )

    clauses_section = "\n\n".join(clause_blocks)
    n = len(batch_items)

    return (
        "You are LexisGraph AI Senior Legal & Regulatory Compliance Auditor.\n"
        f"Evaluate the following {n} regulation requirement(s) against their matched policy clauses with strict evidence grounding.\n\n"
        "STRICT EVALUATION RULES:\n"
        "1. COMPLIANT / COVERED: The policy provides clear, affirmative evidence satisfying ALL mandatory aspects of the regulatory obligation. "
        "High keyword overlap or similarity alone is NOT sufficient (e.g. 'complaints email' does NOT satisfy 'Internal Complaints Committee'). "
        "Conversely, if different words convey the exact same requirement (e.g. 'yearly conduct education' vs 'annual awareness training'), recognize semantic equivalence and mark COMPLIANT.\n"
        "2. PARTIALLY_COMPLIANT: The policy addresses some aspects of the requirement, but one or more critical obligations are missing, ambiguous, or incomplete. "
        "You MUST explicitly list each missing aspect in 'missing_aspects'.\n"
        "3. NON_COMPLIANT / GAP: The policy does not adequately address the requirement. Do NOT create a gap merely due to synonym usage if meaning is satisfied.\n"
        "4. UNABLE_TO_DETERMINE: Policy evidence contains contradictory/conflicting statements (e.g. different sections specify different numbers/rules) or evidence is unparseable. Set 'conflicting_evidence': true if contradictory.\n"
        "5. STRICT EVIDENCE RULE: Base your reasoning ONLY on the quoted policy matches. Do NOT assume, invent, or extrapolate unstated policy terms.\n"
        "6. CONFIDENCE: Set 'confidence' to 'HIGH' (clear evidence or clear gap), 'MEDIUM' (inferred meaning / minor ambiguity), or 'LOW' (sparse / uncertain evidence).\n\n"
        f"{clauses_section}\n\n"
        f"Return ONLY a valid JSON array of exactly {n} objects, in the same order as the clauses above.\n"
        "Required output schema (JSON array, no markdown fences):\n"
        "[\n"
        "  {\n"
        "    \"clause_index\": 1,\n"
        "    \"status\": \"COMPLIANT|PARTIALLY_COMPLIANT|NON_COMPLIANT|UNABLE_TO_DETERMINE\",\n"
        "    \"confidence\": \"HIGH|MEDIUM|LOW\",\n"
        "    \"missing_aspects\": [\"string\"],\n"
        "    \"conflicting_evidence\": false,\n"
        "    \"reasoning\": \"string grounded strictly in evidence\",\n"
        "    \"recommendation\": \"string or null\"\n"
        "  },\n"
        f"  ... ({n} total items)\n"
        "]"
    )


def _normalise_status(raw: str) -> str | None:
    """Normalise a raw status string to one of the canonical engine values."""
    s = raw.upper()
    if "UNABLE" in s or "CONFLICT" in s:
        return "UNABLE_TO_DETERMINE"
    if "PARTIAL" in s:
        return "PARTIALLY_COMPLIANT"
    if "NON" in s or "GAP" in s:
        return "NON_COMPLIANT"
    if "COMPLIANT" in s or "COVERED" in s:
        return "COMPLIANT"
    return None


def _heuristic_fallback(regulation_clause: str, matched_policy_clauses: list[dict[str, Any]]) -> dict[str, Any]:
    """Score-based fallback used when LLM is unavailable for a single clause."""
    if not matched_policy_clauses:
        return {
            "status": "NON_COMPLIANT",
            "confidence": "HIGH",
            "missing_aspects": [f"No policy section addresses: '{regulation_clause[:100]}'"],
            "conflicting_evidence": False,
            "reasoning": "No corresponding policy clause was found addressing this regulation requirement.",
            "recommendation": f"Add a new policy clause specifically addressing: '{regulation_clause[:120]}...'",
        }
    best_score = max(m["score"] for m in matched_policy_clauses)
    if best_score >= _COMPLIANT_THRESHOLD:
        return {
            "status": "COMPLIANT",
            "confidence": "MEDIUM",
            "missing_aspects": [],
            "conflicting_evidence": False,
            "reasoning": f"Policy clause aligns strongly with the regulation requirement (Vector Similarity: {best_score:.2f}). [Heuristic fallback — LLM unavailable]",
            "recommendation": None,
        }
    if best_score >= _PARTIAL_THRESHOLD:
        return {
            "status": "PARTIALLY_COMPLIANT",
            "confidence": "LOW",
            "missing_aspects": [f"Potential missing details for: '{regulation_clause[:100]}'"],
            "conflicting_evidence": False,
            "reasoning": f"Policy clause shows partial coverage (Vector Similarity: {best_score:.2f}). [Heuristic fallback — LLM unavailable]",
            "recommendation": f"Update policy wording to explicitly mandate: '{regulation_clause[:100]}...'",
        }
    return {
        "status": "NON_COMPLIANT",
        "confidence": "MEDIUM",
        "missing_aspects": [f"Policy evidence has insufficient alignment for: '{regulation_clause[:100]}'"],
        "conflicting_evidence": False,
        "reasoning": f"Policy clause has insufficient alignment (Vector Similarity: {best_score:.2f}). [Heuristic fallback — LLM unavailable]",
        "recommendation": f"Draft an explicit policy section covering: '{regulation_clause[:100]}...'",
    }


def _parse_batch_llm_response(
    llm_response: str,
    batch_items: list[dict[str, Any]],
) -> list[dict[str, Any]] | None:
    """
    Parse the LLM batch response — a JSON array of evaluation results.
    Extracts status, confidence, missing_aspects, conflicting_evidence, reasoning, and recommendation.
    """
    try:
        cleaned = re.sub(r"^```(?:json)?\s*", "", llm_response.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        raw_list = json.loads(cleaned)
        if isinstance(raw_list, dict):
            raw_list = [raw_list]
        elif not isinstance(raw_list, list):
            return None
    except Exception:  # noqa: BLE001
        return None

    results: list[dict[str, Any]] = []

    for item_idx, item in enumerate(batch_items):
        raw_entry: dict | None = None
        expected_idx = item["index"]
        for candidate in raw_list:
            if isinstance(candidate, dict) and candidate.get("clause_index") == expected_idx:
                raw_entry = candidate
                break
        if raw_entry is None and item_idx < len(raw_list):
            raw_entry = raw_list[item_idx] if isinstance(raw_list[item_idx], dict) else None

        if raw_entry:
            status = _normalise_status(str(raw_entry.get("status") or ""))
            if status:
                confidence = str(raw_entry.get("confidence") or "HIGH").upper()
                if confidence not in {"HIGH", "MEDIUM", "LOW"}:
                    confidence = "MEDIUM"

                raw_missing = raw_entry.get("missing_aspects") or []
                missing_aspects = [str(a) for a in raw_missing if a] if isinstance(raw_missing, list) else []

                conflicting_evidence = bool(raw_entry.get("conflicting_evidence", False))
                if conflicting_evidence and status != "UNABLE_TO_DETERMINE":
                    status = "UNABLE_TO_DETERMINE"

                results.append({
                    "status": status,
                    "confidence": confidence,
                    "missing_aspects": missing_aspects,
                    "conflicting_evidence": conflicting_evidence,
                    "reasoning": str(raw_entry.get("reasoning") or "").strip() or "No reasoning provided.",
                    "recommendation": raw_entry.get("recommendation") or None,
                })
                continue

        # Per-item fallback — don't fail the whole batch
        logger.warning(
            "[COMPLIANCE_ENGINE] Batch item %s/%s: could not parse LLM entry, using heuristic fallback",
            item_idx + 1, len(batch_items),
        )
        results.append(
            _heuristic_fallback(item["regulation_clause"], item["matched_policy_clauses"])
        )

    return results



def evaluate_batch_compliance_with_llm(
    batch_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Evaluate a batch of regulation clauses in a SINGLE LLM call.

    Each item in batch_items:
        {
            "index":                  int,   # 1-based position for LLM reference
            "regulation_clause":      str,
            "matched_policy_clauses": list,  # from Qdrant
            "structural_context":     dict,  # from Neo4j
        }

    Returns a list of evaluation dicts (same length as batch_items), each:
        {
            "status":         "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT",
            "reasoning":      str,
            "recommendation": str | None,
        }

    Retry-once on failure. If still failing, all items in the batch fall back
    to per-clause heuristics so no results are lost.
    """
    # Short-circuit: clauses with no policy matches don't need LLM
    results: list[dict[str, Any] | None] = [None] * len(batch_items)
    llm_batch: list[tuple[int, dict[str, Any]]] = []  # (original_index, item)

    for i, item in enumerate(batch_items):
        if not item["matched_policy_clauses"]:
            results[i] = {
                "status": "NON_COMPLIANT",
                "reasoning": "No corresponding policy clause was found addressing this regulation requirement.",
                "recommendation": (
                    f"Add a new policy clause specifically addressing: "
                    f"'{item['regulation_clause'][:120]}...'"
                ),
            }
        else:
            llm_batch.append((i, item))

    if not llm_batch:
        return [r for r in results if r is not None]  # type: ignore[misc]

    llm_items = [item for _, item in llm_batch]
    prompt = _build_batch_prompt(llm_items)

    # Try LLM with retry-once
    parsed_results: list[dict[str, Any]] | None = None
    for attempt in range(_LLM_MAX_RETRIES + 1):
        try:
            llm_response = _resolve_reasoning(prompt)
            if llm_response:
                parsed_results = _parse_batch_llm_response(llm_response, llm_items)
                if parsed_results is not None:
                    logger.info(
                        "[COMPLIANCE_ENGINE] Batch LLM call OK: %s clauses evaluated (attempt %s)",
                        len(llm_items), attempt + 1,
                    )
                    break
                logger.warning(
                    "[COMPLIANCE_ENGINE] Batch LLM parse failed (attempt %s/%s), raw=%s",
                    attempt + 1, _LLM_MAX_RETRIES + 1, llm_response[:300],
                )
            else:
                logger.warning(
                    "[COMPLIANCE_ENGINE] Batch LLM returned empty (attempt %s/%s)",
                    attempt + 1, _LLM_MAX_RETRIES + 1,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[COMPLIANCE_ENGINE] Batch LLM call failed (attempt %s/%s): %s",
                attempt + 1, _LLM_MAX_RETRIES + 1, exc,
            )

    # Fill LLM results (or heuristic fallbacks) back into the original positions
    for list_idx, (original_idx, item) in enumerate(llm_batch):
        if parsed_results is not None and list_idx < len(parsed_results):
            results[original_idx] = parsed_results[list_idx]
        else:
            # All retries exhausted — heuristic fallback per clause
            results[original_idx] = _heuristic_fallback(
                item["regulation_clause"], item["matched_policy_clauses"]
            )

    return [r for r in results if r is not None]  # type: ignore[misc]


def evaluate_clause_compliance_with_llm(
    regulation_clause: str,
    matched_policy_clause: str | None = None,
    similarity_score: float = 0.0,
    matched_policy_clauses: list[dict[str, Any]] | None = None,
    structural_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Evaluate a single regulation clause against matched policy clause(s) using LLM.
    Provides backwards compatibility for single-clause evaluation.
    """
    if matched_policy_clauses is None:
        matched_policy_clauses = []
        if matched_policy_clause:
            matched_policy_clauses.append({
                "text": matched_policy_clause,
                "score": similarity_score,
            })

    batch_item = {
        "index": 1,
        "regulation_clause": regulation_clause,
        "matched_policy_clauses": matched_policy_clauses,
        "structural_context": structural_context or {},
    }
    results = evaluate_batch_compliance_with_llm([batch_item])
    return results[0] if results else _heuristic_fallback(regulation_clause, matched_policy_clauses)


# ---------------------------------------------------------------------------
# Main Compliance Analysis Engine — Hybrid GraphRAG Pipeline (Batched LLM)
# ---------------------------------------------------------------------------

def analyze_compliance_engine(
    organization: Organization,
    regulation_document: Document,
    policy_document: Document,
    *,
    llm_batch_size: int = _LLM_BATCH_SIZE,
) -> dict[str, Any]:
    """
    Execute Hybrid GraphRAG compliance evaluation for an Organization.

    Pipeline:
        Phase 1 — Retrieval (per clause, O(N × K)):
            For each regulation clause (N):
              a. Embed → Qdrant query_points (Top-K policy matches)
              b. Neo4j structural context for the best policy match

        Phase 2 — LLM Evaluation (batched, O(⌈N/B⌉) LLM calls):
            Group clauses into batches of B (default 8).
            One LLM call per batch → JSON array response.
            Per-item heuristic fallback if a batch entry fails to parse.
            Retry-once per batch on full LLM failure.

    Parameters
    ----------
    organization : Organization
        The target organization.
    regulation_document : Document
        The reference regulation document.
    policy_document : Document
        The target policy document being audited.
    llm_batch_size : int
        Number of clauses per LLM batch call (default: _LLM_BATCH_SIZE).

    Returns
    -------
    dict[str, Any]
        Structured compliance findings JSON payload.
    """
    logger.info(
        "[COMPLIANCE_ENGINE] Starting Hybrid GraphRAG analysis org=%s reg_doc=%s policy_doc=%s batch_size=%s",
        organization.id,
        regulation_document.id,
        policy_document.id,
        llm_batch_size,
    )

    policy_doc_id_str = str(policy_document.id)

    # Step 1: Retrieve all regulation clauses
    reg_clauses = retrieve_clauses_for_document(regulation_document)

    if not reg_clauses:
        return {
            "overall_score": 0.0,
            "status": "COMPLETED",
            "summary": "No clauses extracted from the regulation document.",
            "total_regulation_clauses": 0,
            "compliant_count": 0,
            "partially_compliant_count": 0,
            "non_compliant_count": 0,
            "failed_count": 0,
            "evaluated_clauses": [],
            "missing_clauses": [],
            "weak_clauses": [],
            "recommendations": ["Ensure regulation document contains readable text/clauses."],
        }

    # Ensure all regulation clauses have embeddings for Qdrant search
    model = None
    for reg_item in reg_clauses:
        if not isinstance(reg_item.get("embedding"), list) or not reg_item["embedding"]:
            if model is None:
                try:
                    model = get_embedding_model()
                except Exception as exc:  # noqa: BLE001
                    logger.error("Cannot load embedding model: %s", exc)
                    break
            try:
                vec = model.encode(reg_item["text"])
                reg_item["embedding"] = vec.tolist() if hasattr(vec, "tolist") else list(vec)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Embedding failed for clause %s: %s", reg_item["clause_id"], exc)

    evaluated_clauses: list[dict[str, Any]] = []
    missing_clauses: list[dict[str, Any]] = []
    weak_clauses: list[dict[str, Any]] = []
    recommendations_set: list[str] = []

    compliant_count = 0
    partially_compliant_count = 0
    non_compliant_count = 0
    failed_count = 0

    # -----------------------------------------------------------------------
    # Phase 1: Retrieval — Qdrant vector search + Neo4j structural context
    #          This is per-clause but fast (indexed searches, no LLM calls).
    # -----------------------------------------------------------------------
    # Retrieve all policy clauses (used as in-memory fallback if Qdrant is empty/mocked)
    all_policy_clauses = retrieve_clauses_for_document(policy_document)

    retrieval_items: list[dict[str, Any]] = []

    for clause_idx, reg_item in enumerate(reg_clauses):
        reg_text = reg_item["text"]
        reg_id = reg_item["clause_id"]
        reg_emb = reg_item.get("embedding")

        # Qdrant: semantic search for matching policy clauses
        matched_policy_clauses: list[dict[str, Any]] = []
        if reg_emb and isinstance(reg_emb, list):
            raw_matches = _search_policy_clauses_in_qdrant(
                regulation_embedding=reg_emb,
                policy_document_id=policy_doc_id_str,
                top_k=_QDRANT_TOP_K,
                all_policy_clauses=all_policy_clauses,
            )
            matched_policy_clauses = _deduplicate_policy_matches(raw_matches)

        # Neo4j: structural context for the best policy match
        structural_context: dict[str, Any] = {
            "parent_document": None,
            "sibling_clauses": [],
            "entities": [],
        }
        if matched_policy_clauses:
            structural_context = _get_structural_context(matched_policy_clauses[0]["clause_id"])

        retrieval_items.append({
            "index": clause_idx + 1,      # 1-based for LLM readability
            "reg_id": reg_id,
            "regulation_clause": reg_text,
            "matched_policy_clauses": matched_policy_clauses,
            "structural_context": structural_context,
        })

    logger.info(
        "[COMPLIANCE_ENGINE] Retrieval phase complete: %s clauses. Starting batched LLM evaluation (batch_size=%s).",
        len(retrieval_items), llm_batch_size,
    )

    # -----------------------------------------------------------------------
    # Phase 2: Batched LLM Evaluation — ⌈N / B⌉ LLM calls instead of N
    # -----------------------------------------------------------------------
    all_eval_results: list[dict[str, Any]] = []

    for batch_start in range(0, len(retrieval_items), llm_batch_size):
        batch = retrieval_items[batch_start : batch_start + llm_batch_size]
        batch_num = batch_start // llm_batch_size + 1
        total_batches = -(-len(retrieval_items) // llm_batch_size)  # ceiling div

        logger.info(
            "[COMPLIANCE_ENGINE] LLM batch %s/%s: evaluating %s clauses",
            batch_num, total_batches, len(batch),
        )

        batch_results = evaluate_batch_compliance_with_llm(batch)
        all_eval_results.extend(batch_results)

    # -----------------------------------------------------------------------
    # Phase 3: Aggregate results
    # -----------------------------------------------------------------------
    for retrieval_item, eval_result in zip(retrieval_items, all_eval_results):
        reg_id = retrieval_item["reg_id"]
        reg_text = retrieval_item["regulation_clause"]
        matched_policy_clauses = retrieval_item["matched_policy_clauses"]
        structural_context = retrieval_item["structural_context"]

        status_val = eval_result["status"]
        reasoning = eval_result["reasoning"]
        rec = eval_result.get("recommendation")
        confidence = eval_result.get("confidence", "HIGH")
        missing_aspects = eval_result.get("missing_aspects", [])
        conflicting_evidence = eval_result.get("conflicting_evidence", False)

        best_policy_text = matched_policy_clauses[0]["text"] if matched_policy_clauses else None
        best_policy_id = matched_policy_clauses[0]["clause_id"] if matched_policy_clauses else None
        best_sim_score = matched_policy_clauses[0]["score"] if matched_policy_clauses else 0.0

        clause_eval = {
            "regulation_clause_id": reg_id,
            "regulation_text": reg_text,
            "matched_policy_clause_id": best_policy_id,
            "matched_policy_text": best_policy_text,
            "similarity_score": round(best_sim_score, 4),
            "total_policy_matches": len(matched_policy_clauses),
            "structural_context_available": bool(
                structural_context.get("parent_document")
                or structural_context.get("sibling_clauses")
                or structural_context.get("entities")
            ),
            "status": status_val,
            "confidence": confidence,
            "missing_aspects": missing_aspects,
            "conflicting_evidence": conflicting_evidence,
            "reasoning": reasoning,
            "recommendation": rec,
        }
        evaluated_clauses.append(clause_eval)


        if status_val == "COMPLIANT":
            compliant_count += 1
        elif status_val == "PARTIALLY_COMPLIANT":
            partially_compliant_count += 1
            weak_clauses.append({
                "regulation_clause_id": reg_id,
                "regulation_text": reg_text,
                "matched_policy_text": best_policy_text,
                "similarity_score": round(best_sim_score, 4),
                "reasoning": reasoning,
                "recommendation": rec,
            })
            if rec and rec not in recommendations_set:
                recommendations_set.append(rec)
        elif status_val == "FAILED":
            failed_count += 1
        else:  # NON_COMPLIANT
            non_compliant_count += 1
            missing_clauses.append({
                "regulation_clause_id": reg_id,
                "regulation_text": reg_text,
                "reasoning": reasoning,
                "recommendation": rec,
            })
            if rec and rec not in recommendations_set:
                recommendations_set.append(rec)

    # Step 6: Generate Overall Compliance Score & Summary
    total_reg = len(reg_clauses)
    scoreable_count = total_reg - failed_count
    raw_points = (compliant_count * 1.0) + (partially_compliant_count * 0.5)
    overall_score = round((raw_points / scoreable_count) * 100.0, 2) if scoreable_count > 0 else 0.0

    summary = (
        f"Evaluated {total_reg} regulation requirements against policy document "
        f"'{policy_document.original_filename}'. Findings: {compliant_count} Compliant, "
        f"{partially_compliant_count} Partially Compliant, {non_compliant_count} Non-Compliant"
    )
    if failed_count > 0:
        summary += f", {failed_count} Failed (LLM unavailable)"
    summary += f". Overall compliance score: {overall_score:.1f}%."

    result_payload = {
        "overall_score": overall_score,
        "status": "COMPLETED",
        "summary": summary,
        "organization_id": str(organization.id),
        "regulation_document_id": str(regulation_document.id),
        "policy_document_id": str(policy_document.id),
        "total_regulation_clauses": total_reg,
        "compliant_count": compliant_count,
        "partially_compliant_count": partially_compliant_count,
        "non_compliant_count": non_compliant_count,
        "failed_count": failed_count,
        "evaluated_clauses": evaluated_clauses,
        "missing_clauses": missing_clauses,
        "weak_clauses": weak_clauses,
        "recommendations": recommendations_set,
    }

    logger.info(
        "[COMPLIANCE_ENGINE] Hybrid GraphRAG analysis complete org=%s score=%.2f "
        "compliant=%s partial=%s non_compliant=%s failed=%s",
        organization.id,
        overall_score,
        compliant_count,
        partially_compliant_count,
        non_compliant_count,
        failed_count,
    )

    return result_payload


def execute_report_compliance_analysis(db: Session, report_id: uuid.UUID) -> dict[str, Any]:
    """
    Load a ComplianceReport from PostgreSQL, run full Hybrid GraphRAG compliance
    engine analysis, and persist results back to the database.
    """
    import time
    from datetime import datetime, timezone
    from app.compliance.models import ComplianceReport, ComplianceReportStatus

    logger.info("Updating report... report_id=%s status=PROCESSING", report_id)

    report = db.get(ComplianceReport, report_id)
    if not report:
        raise ValueError(f"ComplianceReport {report_id} not found")

    report.status = ComplianceReportStatus.PROCESSING
    report.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    start_time = time.perf_counter()

    try:
        org = report.organization
        reg_doc = report.regulation
        policy_doc = report.policy_document

        result = analyze_compliance_engine(org, reg_doc, policy_doc)

        elapsed_seconds = time.perf_counter() - start_time
        return store_compliance_report(db, report_id, result, elapsed_seconds=elapsed_seconds)
    except Exception as exc:
        db.rollback()
        logger.error("Report failed... report_id=%s status=FAILED error=%s", report_id, exc)
        try:
            failed_report = db.get(ComplianceReport, report_id)
            if failed_report:
                failed_report.status = ComplianceReportStatus.FAILED
                failed_report.summary = str(exc)
                failed_report.updated_at = datetime.now(timezone.utc)
                db.commit()
                # Sprint 8.1: Audit event for analysis failure
                try:
                    from app.services.audit_service import log_audit_event
                    log_audit_event(
                        db,
                        user_id=failed_report.created_by,
                        action="COMPLIANCE_ANALYSIS_FAILED",
                        organization_id=failed_report.organization_id,
                        entity="ComplianceReport",
                        entity_id=str(report_id),
                    )
                except Exception:  # noqa: BLE001
                    logger.warning("Failed to write audit event COMPLIANCE_ANALYSIS_FAILED report_id=%s", report_id)
        except Exception as rollback_exc:
            db.rollback()
            logger.error("Failed setting FAILED status for report_id=%s: %s", report_id, rollback_exc)
        raise



def store_compliance_report(
    db: Session,
    report_id: uuid.UUID,
    result: dict[str, Any],
    elapsed_seconds: float = 0.0,
) -> dict[str, Any]:
    """
    Persist compliance analysis evaluation results to ComplianceReport and ReportFinding models,
    handling reassessment triggers for previously resolved findings and activity logging.
    """
    from datetime import datetime, timezone
    from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding
    from app.db.models import Document
    from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
    from app.db.models.notification import Notification

    report = db.get(ComplianceReport, report_id)
    if not report:
        raise ValueError(f"ComplianceReport {report_id} not found")

    score_val = result.get("overall_score") or 0.0
    if score_val >= 85.0:
        calculated_risk = "LOW"
    elif score_val >= 70.0:
        calculated_risk = "MEDIUM"
    elif score_val >= 50.0:
        calculated_risk = "HIGH"
    else:
        calculated_risk = "CRITICAL"

    report.overall_score = score_val
    report.risk_level = calculated_risk
    report.total_clauses = result.get("total_regulation_clauses", 0)
    report.compliant_clauses = result.get("compliant_count", 0)
    report.partial_clauses = result.get("partially_compliant_count", 0)
    report.non_compliant_clauses = result.get("non_compliant_count", 0)

    report.total_matches = result.get("compliant_count", 0)
    report.total_partial_matches = result.get("partially_compliant_count", 0)
    report.total_missing = result.get("non_compliant_count", 0)

    report.executive_summary = result.get("summary")
    report.summary = json.dumps(result, default=str)
    report.report_json = result
    report.recommendations = result.get("recommendations", [])
    report.processing_time_seconds = round(elapsed_seconds, 2)
    report.processing_time_ms = round(elapsed_seconds * 1000.0, 2)
    report.status = ComplianceReportStatus.COMPLETED
    report.updated_at = datetime.now(timezone.utc)

    policy_doc = db.get(Document, report.policy_document_id) if report.policy_document_id else None
    policy_doc_name = policy_doc.original_filename if policy_doc else None

    evaluated_clauses = result.get("evaluated_clauses", [])
    for c in evaluated_clauses:
        st = (c.get("status") or "NON_COMPLIANT").upper()
        sev = "HIGH" if st == "NON_COMPLIANT" else ("MEDIUM" if st == "PARTIALLY_COMPLIANT" else "LOW")
        reg_clause = c.get("regulation_clause_id") or "REG-CLAUSE"
        pol_clause = c.get("matched_policy_clause_id") or c.get("policy_clause_id") or "POL-CLAUSE"

        # Check if there is an existing RESOLVED finding in this org for the same regulation clause
        existing_resolved_finding = None
        if st != "COMPLIANT":
            existing_resolved_finding = (
                db.query(ReportFinding)
                .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
                .filter(
                    ComplianceReport.organization_id == report.organization_id,
                    ComplianceReport.id != report.id,
                    ReportFinding.regulation_clause_id == reg_clause,
                    ReportFinding.lifecycle_status.in_(["RESOLVED", "REASSESSMENT_REQUIRED"]),
                    (ComplianceReport.is_deleted == False) | (ComplianceReport.is_deleted.is_(None)),
                )
                .order_by(ReportFinding.created_at.desc())
                .first()
            )

        if existing_resolved_finding:
            # SPRINT 7.9: Mark existing resolved finding as REASSESSMENT_REQUIRED
            # Do NOT create duplicate finding, do NOT automatically reopen!
            if existing_resolved_finding.lifecycle_status == "RESOLVED":
                existing_resolved_finding.lifecycle_status = "REASSESSMENT_REQUIRED"
                existing_resolved_finding.reassessment_trigger = "NEW_ANALYSIS"
                existing_resolved_finding.reassessment_reason = (
                    f"New compliance analysis detected potential compliance gap for clause {reg_clause} "
                    f"in policy {policy_doc_name or 'document'}."
                )
                existing_resolved_finding.reassessment_document_id = report.policy_document_id
                existing_resolved_finding.reassessment_document_name = policy_doc_name
                existing_resolved_finding.reassessment_report_id = report.id
                existing_resolved_finding.reassessment_detected_at = datetime.now(timezone.utc)
                existing_resolved_finding.updated_at = datetime.now(timezone.utc)

                # Log exactly ONE Activity event for this reassessment
                from app.services.activity_service import log_activity
                log_activity(
                    db,
                    user_id=report.created_by,
                    event_type="FINDING_REASSESSMENT_REQUIRED",
                    title="Finding Reassessment Required",
                    description=f"New compliance analysis detected gap in clause {reg_clause}. Admin reassessment required.",
                    icon_type="alert",
                    extra_data={
                        "finding_id": str(existing_resolved_finding.id),
                        "report_id": str(report.id),
                        "trigger": "NEW_ANALYSIS",
                        "document_name": policy_doc_name,
                    },
                )

                # Send exactly ONE notification to org admin / assignee
                org_admins = (
                    db.query(OrganizationMember)
                    .filter(
                        OrganizationMember.organization_id == report.organization_id,
                        OrganizationMember.role == UserRole.ADMIN,
                        OrganizationMember.status == MemberStatus.ACTIVE,
                    )
                    .all()
                )
                recipient_user_ids = {m.user_id for m in org_admins}
                if existing_resolved_finding.assigned_to:
                    recipient_user_ids.add(existing_resolved_finding.assigned_to)

                for rec_id in recipient_user_ids:
                    db.add(
                        Notification(
                            user_id=rec_id,
                            organization_id=report.organization_id,
                            type="FINDING_REASSESSMENT_REQUIRED",
                            title="Finding Reassessment Required",
                            message=f"Finding #{str(existing_resolved_finding.id)[:8]} requires reassessment because an associated policy was updated or analyzed.",
                            finding_id=existing_resolved_finding.id,
                            report_id=report.id,
                        )
                    )
        else:
            lifecycle_st = "RESOLVED" if st == "COMPLIANT" else "OPEN"
            rf = ReportFinding(
                id=uuid.uuid4(),
                report_id=report.id,
                policy_clause_id=pol_clause,
                regulation_clause_id=reg_clause,
                status=st,
                lifecycle_status=lifecycle_st,
                confidence=float(c.get("similarity_score") or 0.85),
                severity=sev,
                reasoning=c.get("reasoning"),
                recommendation=c.get("recommendation"),
                citation=c.get("regulation_text"),
            )
            db.add(rf)

    db.commit()
    db.refresh(report)

    logger.info(
        "New report stored: report_id=%s status=COMPLETED score=%s time=%.2fs risk=%s",
        report.id,
        report.overall_score,
        elapsed_seconds,
        report.risk_level,
    )

    from app.services.activity_service import log_activity
    org = report.organization
    log_activity(
        db,
        user_id=report.created_by,
        event_type="COMPLIANCE_COMPLETED",
        title="Generated Compliance Report",
        description=f"Completed compliance check for {org.name if org else 'Organization'}",
        icon_type="report",
        extra_data={"report_id": str(report.id), "overall_score": report.overall_score},
    )

    # Sprint 8.1: Audit event for analysis completion
    try:
        from app.services.audit_service import log_audit_event
        log_audit_event(
            db,
            user_id=report.created_by,
            action="COMPLIANCE_ANALYSIS_COMPLETED",
            organization_id=report.organization_id,
            entity="ComplianceReport",
            entity_id=str(report.id),
        )
    except Exception:  # noqa: BLE001
        logger.warning("Failed to write audit event COMPLIANCE_ANALYSIS_COMPLETED report_id=%s", report.id)

    return result


