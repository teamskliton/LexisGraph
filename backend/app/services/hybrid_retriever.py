"""
Hybrid Retrieval Engine for LexisGraph (GraphRAG).

Pipeline:
1. Query Embedding Generation.
2. Qdrant Vector Search (Top 20 semantic matches filtered by organization_id).
3. Neo4j 2-Hop Graph Expansion (Traversing NEXT_CLAUSE, HAS_ENTITY, HAS_TOPIC, HAS_SECTION, REFERENCES, SIMILAR_TO, HAS_CLAUSE, BELONGS_TO).
4. Candidate Merging & Deduplication.
5. Hybrid Scoring: Final Score = (0.70 * Vector Similarity) + (0.30 * Graph Relevance).
6. Structured Ranking & Return (Top 10 candidates with score breakdowns & relationship metadata).

Requirements:
- Structured dataclass / Pydantic models.
- NO prompt generation inside retriever.
- Production-ready async and sync APIs.
- Configurable weights.
- Extensive logging.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Sequence

from qdrant_client.http.models import FieldCondition, Filter, MatchValue

from app.db.neo4j import run_query
from app.db.qdrant import get_client
from app.services.embedding_model import get_embedding_model
from app.services.vector_store import COLLECTION_USER

logger = logging.getLogger(__name__)

# Default Configuration Constants
DEFAULT_VECTOR_TOP_K = 20
DEFAULT_FINAL_TOP_N = 10
DEFAULT_VECTOR_WEIGHT = 0.70
DEFAULT_GRAPH_WEIGHT = 0.30
MAX_GRAPH_HOPS = 2


@dataclass
class HybridRetrieverConfig:
    """Configurable parameters for HybridRetriever."""

    vector_top_k: int = DEFAULT_VECTOR_TOP_K
    final_top_n: int = DEFAULT_FINAL_TOP_N
    vector_weight: float = DEFAULT_VECTOR_WEIGHT
    graph_weight: float = DEFAULT_GRAPH_WEIGHT
    max_hops: int = MAX_GRAPH_HOPS

    def __post_init__(self) -> None:
        # Normalize weights if their sum is close to 1.0
        total_weight = self.vector_weight + self.graph_weight
        if total_weight > 0 and abs(total_weight - 1.0) > 1e-5:
            self.vector_weight /= total_weight
            self.graph_weight /= total_weight


@dataclass
class RelationshipMetadata:
    """Metadata detailing Neo4j graph relationships for a retrieved candidate clause."""

    hop_distance: int = 0
    relationship_types: list[str] = field(default_factory=list)
    shared_entities: list[str] = field(default_factory=list)
    connection_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class HybridSearchResultItem:
    """Structured evidence item returned by HybridRetriever."""

    clause_id: str
    clause_text: str
    document_name: str | None
    document_id: str | None
    vector_score: float
    graph_score: float
    final_score: float
    relationship_metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class HybridRetrievalResult:
    """Structured container holding all retrieved and ranked evidence items."""

    query: str
    organization_id: str | None
    total_retrieved: int
    items: list[HybridSearchResultItem]

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "organization_id": self.organization_id,
            "total_retrieved": self.total_retrieved,
            "items": [item.to_dict() for item in self.items],
        }


class HybridRetriever:
    """Production-ready Hybrid GraphRAG Retriever (Qdrant + Neo4j)."""

    def __init__(self, config: HybridRetrieverConfig | None = None) -> None:
        self.config = config or HybridRetrieverConfig()

    def _generate_query_embedding(self, query: str) -> list[float]:
        """Step 1: Generate vector embedding for user query."""
        logger.debug("[HYBRID_RETRIEVER] Generating query embedding for query=%r", query)
        model = get_embedding_model()
        vector = model.encode(query)
        if hasattr(vector, "tolist"):
            return vector.tolist()
        return list(vector)

    def _search_qdrant(
        self,
        query_vector: list[float],
        organization_id: str | None = None,
        top_k: int = DEFAULT_VECTOR_TOP_K,
    ) -> list[dict[str, Any]]:
        """Step 2: Search Qdrant for Top K semantic matches across organization policies and global regulations."""
        logger.debug(
            "[HYBRID_RETRIEVER] Searching Qdrant: top_k=%d org_id=%s",
            top_k,
            organization_id,
        )
        client = get_client()
        points: list[Any] = []

        # 1. Organization & Global Regulation filtered search (if organization_id provided)
        if organization_id:
            try:
                org_filter = Filter(
                    should=[
                        FieldCondition(
                            key="organization_id",
                            match=MatchValue(value=str(organization_id)),
                        ),
                        FieldCondition(
                            key="domain",
                            match=MatchValue(value="regulation"),
                        ),
                        FieldCondition(
                            key="type",
                            match=MatchValue(value="regulation"),
                        ),
                        FieldCondition(
                            key="document_type",
                            match=MatchValue(value="regulation"),
                        ),
                        FieldCondition(
                            key="is_global",
                            match=MatchValue(value=True),
                        ),
                    ]
                )
                response = client.query_points(
                    collection_name=COLLECTION_USER,
                    query=query_vector,
                    query_filter=org_filter,
                    limit=top_k,
                )
                points.extend(response.points)
            except Exception as exc:
                logger.warning(
                    "[HYBRID_RETRIEVER] Qdrant org-filtered search failed: %s", exc
                )

        # 2. Supplementary search for global regulation clauses or unfiltered pool
        try:
            response = client.query_points(
                collection_name=COLLECTION_USER,
                query=query_vector,
                limit=top_k,
            )
            for point in response.points:
                payload = point.payload or {}
                p_org = payload.get("organization_id")
                p_domain = str(payload.get("domain", "")).lower()
                p_type = str(payload.get("type", "")).lower()
                is_global_reg = (
                    p_domain == "regulation"
                    or p_type == "regulation"
                    or not p_org
                    or payload.get("is_global") is True
                )
                # Include point if it's a regulation, matches org_id, or point pool is small
                if (
                    is_global_reg
                    or (organization_id and str(p_org) == str(organization_id))
                    or len(points) < top_k
                ):
                    points.append(point)
        except Exception as exc:
            logger.warning("[HYBRID_RETRIEVER] Qdrant global search failed: %s", exc)

        hits: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        for hit in points:
            payload = hit.payload or {}
            clause_id = payload.get("clause_id", str(hit.id))
            if clause_id not in seen_ids:
                seen_ids.add(clause_id)
                hits.append(
                    {
                        "clause_id": clause_id,
                        "text": payload.get("text", ""),
                        "score": float(hit.score),
                        "document_id": payload.get("document_id"),
                        "title": payload.get("title"),
                        "domain": payload.get("domain"),
                        "type": payload.get("type"),
                    }
                )

        hits.sort(key=lambda x: x["score"], reverse=True)
        logger.info("[HYBRID_RETRIEVER] Qdrant search returned %d hits", len(hits))
        return hits[:top_k]

    def _expand_neo4j_graph(
        self,
        clause_ids: Sequence[str],
        max_hops: int = MAX_GRAPH_HOPS,
    ) -> dict[str, dict[str, Any]]:
        """Step 3: 2-Hop Graph Expansion through Neo4j traversing policy & regulation relationships."""
        if not clause_ids:
            return {}

        logger.debug(
            "[HYBRID_RETRIEVER] Expanding Neo4j graph for %d seed clause IDs (max_hops=%d)",
            len(clause_ids),
            max_hops,
        )

        query = f"""
        UNWIND $clause_ids AS seed_id
        MATCH (seed) WHERE seed.id = seed_id
        MATCH path = (seed)-[r:MATCH|PARTIAL_MATCH|MISSING|NEXT_CLAUSE|HAS_ENTITY|HAS_TOPIC|HAS_SECTION|REFERENCES|SIMILAR_TO|HAS_CLAUSE|BELONGS_TO*1..{max_hops}]-(target)
        WHERE target:Clause OR target:PolicyClause OR target:RegulationClause OR target:Entity OR target:Topic OR target:Section OR target:Document OR target:UserDocument OR target:DomainDocument
        WITH seed_id, target, path, length(path) AS dist
        ORDER BY dist ASC
        RETURN 
            seed_id,
            labels(target) AS target_labels,
            target.id AS target_id,
            coalesce(target.text, target.name, target.title, '') AS target_text,
            target.name AS target_name,
            coalesce(target.title, target.name, target.text) AS target_title,
            dist,
            [rel IN relationships(path) | type(rel)] AS rel_types
        LIMIT 300
        """

        records = run_query(query, {"clause_ids": list(clause_ids)})
        graph_map: dict[str, dict[str, Any]] = {}

        for rec in records:
            seed_id = rec.get("seed_id")
            target_id = rec.get("target_id")
            target_labels = rec.get("target_labels") or []
            dist = int(rec.get("dist") or 1)
            rel_types = rec.get("rel_types") or []

            # If target is another Clause (PolicyClause or RegulationClause), add/update candidate clause entry
            if any(lbl in ("Clause", "PolicyClause", "RegulationClause") for lbl in target_labels) and target_id:
                cid = str(target_id)
                if cid not in graph_map:
                    graph_map[cid] = {
                        "clause_id": cid,
                        "text": rec.get("target_text") or "",
                        "title": rec.get("target_title"),
                        "hop_distance": dist,
                        "rel_types": set(rel_types),
                        "shared_entities": [],
                        "connection_count": 1,
                    }
                else:
                    entry = graph_map[cid]
                    entry["hop_distance"] = min(entry["hop_distance"], dist)
                    entry["rel_types"].update(rel_types)
                    entry["connection_count"] += 1

            # If target is an Entity or Topic, attribute shared entity to seed clause
            elif ("Entity" in target_labels or "Topic" in target_labels) and seed_id:
                sid = str(seed_id)
                entity_name = rec.get("target_name") or rec.get("target_title")
                if entity_name and sid in graph_map:
                    if entity_name not in graph_map[sid]["shared_entities"]:
                        graph_map[sid]["shared_entities"].append(str(entity_name))

        logger.info(
            "[HYBRID_RETRIEVER] Neo4j graph expansion discovered/enriched %d nodes",
            len(graph_map),
        )
        return graph_map

    def _calculate_graph_relevance(
        self,
        hop_distance: int,
        connection_count: int,
        rel_types: Sequence[str],
        shared_entities: Sequence[str],
    ) -> float:
        """Compute normalized graph relevance score (0.0 to 1.0)."""
        # Distance score: 1 hop = 1.0, 2 hops = 0.6, 0 hops (seed match) = 0.4
        if hop_distance == 1:
            dist_score = 1.0
        elif hop_distance == 2:
            dist_score = 0.6
        else:
            dist_score = 0.4

        # Connection strength & shared entities bonuses
        conn_bonus = min(connection_count * 0.1, 0.25)
        entity_bonus = min(len(shared_entities) * 0.1, 0.25)

        raw_score = (dist_score * 0.5) + conn_bonus + entity_bonus
        return min(max(raw_score, 0.0), 1.0)

    def _merge_and_rank(
        self,
        vector_hits: Sequence[dict[str, Any]],
        graph_nodes: dict[str, dict[str, Any]],
        query: str,
        organization_id: str | None = None,
        top_n: int = DEFAULT_FINAL_TOP_N,
        v_weight: float = DEFAULT_VECTOR_WEIGHT,
        g_weight: float = DEFAULT_GRAPH_WEIGHT,
    ) -> list[HybridSearchResultItem]:
        """Steps 4 & 5: Merge Results, Deduplicate, Compute Hybrid Scores & Rank."""
        candidates: dict[str, dict[str, Any]] = {}

        # 1. Populate candidates from Qdrant vector hits
        for hit in vector_hits:
            cid = hit["clause_id"]
            candidates[cid] = {
                "clause_id": cid,
                "clause_text": hit.get("text", ""),
                "document_name": hit.get("title") or "Document",
                "document_id": hit.get("document_id"),
                "vector_score": float(hit.get("score", 0.0)),
                "graph_score": 0.0,
                "hop_distance": 0,
                "rel_types": set(),
                "shared_entities": [],
                "connection_count": 1,
            }

        # 2. Enrich/add candidates from Neo4j graph nodes
        for cid, gnode in graph_nodes.items():
            if cid in candidates:
                # Seed or vector hit enriched by graph neighbors
                c = candidates[cid]
                c["hop_distance"] = gnode.get("hop_distance", c["hop_distance"])
                c["rel_types"].update(gnode.get("rel_types", []))
                c["shared_entities"].extend(
                    e for e in gnode.get("shared_entities", []) if e not in c["shared_entities"]
                )
                c["connection_count"] += gnode.get("connection_count", 1)
            else:
                # Graph-only discovered candidate clause
                candidates[cid] = {
                    "clause_id": cid,
                    "clause_text": gnode.get("text", ""),
                    "document_name": gnode.get("title") or "Document",
                    "document_id": None,
                    "vector_score": 0.0,  # Pure graph hit without vector match
                    "graph_score": 0.0,
                    "hop_distance": gnode.get("hop_distance", 2),
                    "rel_types": set(gnode.get("rel_types", [])),
                    "shared_entities": gnode.get("shared_entities", []),
                    "connection_count": gnode.get("connection_count", 1),
                }

        # 3. Compute graph score & final hybrid score for each candidate
        ranked_items: list[HybridSearchResultItem] = []

        for cid, cand in candidates.items():
            rel_types_list = sorted(list(cand["rel_types"]))
            g_score = self._calculate_graph_relevance(
                hop_distance=cand["hop_distance"],
                connection_count=cand["connection_count"],
                rel_types=rel_types_list,
                shared_entities=cand["shared_entities"],
            )
            cand["graph_score"] = round(g_score, 4)

            # Final Score = (Vector Weight * Vector Score) + (Graph Weight * Graph Score)
            v_score = cand["vector_score"]
            final_score = round((v_weight * v_score) + (g_weight * g_score), 4)

            rel_meta = RelationshipMetadata(
                hop_distance=cand["hop_distance"],
                relationship_types=rel_types_list,
                shared_entities=cand["shared_entities"],
                connection_count=cand["connection_count"],
            ).to_dict()

            item = HybridSearchResultItem(
                clause_id=cid,
                clause_text=cand["clause_text"],
                document_name=cand["document_name"],
                document_id=cand["document_id"],
                vector_score=round(v_score, 4),
                graph_score=round(g_score, 4),
                final_score=final_score,
                relationship_metadata=rel_meta,
            )
            ranked_items.append(item)

        # 4. Sort descending by final_score
        ranked_items.sort(key=lambda x: x.final_score, reverse=True)

        logger.info(
            "[HYBRID_RETRIEVER] Merged & ranked %d total candidates; returning Top %d",
            len(ranked_items),
            min(top_n, len(ranked_items)),
        )

        return ranked_items[:top_n]

    def retrieve_sync(
        self,
        query: str,
        organization_id: str | None = None,
        top_k_vector: int | None = None,
        top_n_final: int | None = None,
        vector_weight: float | None = None,
        graph_weight: float | None = None,
    ) -> HybridRetrievalResult:
        """
        Synchronous public API for hybrid retrieval.

        Parameters
        ----------
        query : str
            User query or question string.
        organization_id : str | None, optional
            UUID of organization scope.
        top_k_vector : int, optional
            Vector search candidate count (default: 20).
        top_n_final : int, optional
            Final top N returned items (default: 10).
        vector_weight : float, optional
            Vector score weight (default: 0.70).
        graph_weight : float, optional
            Graph score weight (default: 0.30).

        Returns
        -------
        HybridRetrievalResult
            Structured evidence container.
        """
        clean_query = query.strip()
        if not clean_query:
            return HybridRetrievalResult(
                query=clean_query,
                organization_id=organization_id,
                total_retrieved=0,
                items=[],
            )

        v_top_k = top_k_vector or self.config.vector_top_k
        f_top_n = top_n_final or self.config.final_top_n
        v_weight = vector_weight if vector_weight is not None else self.config.vector_weight
        g_weight = graph_weight if graph_weight is not None else self.config.graph_weight

        logger.info(
            "[HYBRID_RETRIEVER] Starting sync retrieval: org_id=%s query=%r top_k=%d top_n=%d",
            organization_id,
            clean_query,
            v_top_k,
            f_top_n,
        )

        # 1. Embed query
        query_vector = self._generate_query_embedding(clean_query)

        # 2. Vector search (Top 20)
        vector_hits = self._search_qdrant(
            query_vector,
            organization_id=organization_id,
            top_k=v_top_k,
        )

        # 3. 2-Hop Graph Expansion (Neo4j)
        seed_clause_ids = [h["clause_id"] for h in vector_hits if h.get("clause_id")]
        graph_nodes = self._expand_neo4j_graph(
            seed_clause_ids,
            max_hops=self.config.max_hops,
        )

        # 4 & 5. Merge, Score & Rank
        top_items = self._merge_and_rank(
            vector_hits=vector_hits,
            graph_nodes=graph_nodes,
            query=clean_query,
            organization_id=organization_id,
            top_n=f_top_n,
            v_weight=v_weight,
            g_weight=g_weight,
        )

        return HybridRetrievalResult(
            query=clean_query,
            organization_id=organization_id,
            total_retrieved=len(top_items),
            items=top_items,
        )

    async def retrieve(
        self,
        query: str,
        organization_id: str | None = None,
        top_k_vector: int | None = None,
        top_n_final: int | None = None,
        vector_weight: float | None = None,
        graph_weight: float | None = None,
    ) -> HybridRetrievalResult:
        """
        Asynchronous public API for hybrid retrieval.

        Delegates blocking I/O (embedding, Qdrant, Neo4j) to worker threads.
        """
        return await asyncio.to_thread(
            self.retrieve_sync,
            query,
            organization_id,
            top_k_vector,
            top_n_final,
            vector_weight,
            graph_weight,
        )


# Global default instance for convenience
_default_retriever = HybridRetriever()


def get_hybrid_retriever(config: HybridRetrieverConfig | None = None) -> HybridRetriever:
    """Factory function for retrieving or creating a HybridRetriever instance."""
    if config is not None:
        return HybridRetriever(config)
    return _default_retriever
