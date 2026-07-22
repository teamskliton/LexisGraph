import logging

from app.services.graph_builder import create_similarity_edges

logger = logging.getLogger(__name__)


def build_similarity_graph(
    similarity_threshold: float = 0.75,
    top_k: int = 3,
    max_clauses: int = 20,
) -> dict:
    """Build semantic similarity links between clause nodes in Neo4j."""
    logger.info(
        "[GRAPH] Building similarity edges threshold=%s top_k=%s max_clauses=%s",
        similarity_threshold,
        top_k,
        max_clauses,
    )
    return create_similarity_edges(
        similarity_threshold=similarity_threshold,
        top_k=top_k,
        max_clauses=max_clauses,
    )
