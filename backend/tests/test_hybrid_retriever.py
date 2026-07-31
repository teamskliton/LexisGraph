"""
Unit tests for Hybrid Retrieval Engine (Qdrant + Neo4j GraphRAG).
"""
import asyncio
import unittest
import uuid
from unittest.mock import MagicMock, patch

from app.services.hybrid_retriever import (
    HybridRetriever,
    HybridRetrieverConfig,
    HybridSearchResultItem,
    get_hybrid_retriever,
)
from app.services.retrieval_orchestrator import retrieve_context


class HybridRetrieverTest(unittest.TestCase):
    def test_config_initialization_and_normalization(self):
        config = HybridRetrieverConfig(
            vector_top_k=20,
            final_top_n=10,
            vector_weight=0.70,
            graph_weight=0.30,
            max_hops=2,
        )
        self.assertEqual(config.vector_top_k, 20)
        self.assertEqual(config.final_top_n, 10)
        self.assertAlmostEqual(config.vector_weight, 0.70)
        self.assertAlmostEqual(config.graph_weight, 0.30)
        self.assertEqual(config.max_hops, 2)

        # Weight normalization test
        unnormalized = HybridRetrieverConfig(vector_weight=1.4, graph_weight=0.6)
        self.assertAlmostEqual(unnormalized.vector_weight, 0.70)
        self.assertAlmostEqual(unnormalized.graph_weight, 0.30)

    @patch("app.services.hybrid_retriever.run_query")
    @patch("app.services.hybrid_retriever.get_client")
    @patch("app.services.hybrid_retriever.get_embedding_model")
    def test_retrieve_sync_full_pipeline(self, mock_model, mock_qdrant, mock_neo4j):
        # 1. Mock embedding model
        mock_encoder = MagicMock()
        mock_encoder.encode.return_value = [0.1] * 384
        mock_model.return_value = mock_encoder

        # 2. Mock Qdrant top 20 hits
        mock_points = []
        for i in range(1, 21):
            point = MagicMock()
            point.id = f"clause-{i}"
            point.score = round(0.95 - (i * 0.02), 4)
            point.payload = {
                "clause_id": f"clause-{i}",
                "text": f"Clause text {i}",
                "document_id": "doc-uuid-1",
                "title": "Master Service Agreement",
            }
            mock_points.append(point)

        mock_qdrant_client = MagicMock()
        mock_qdrant_client.query_points.return_value.points = mock_points
        mock_qdrant.return_value = mock_qdrant_client

        # 3. Mock Neo4j 2-hop graph expansion records
        mock_neo4j_records = [
            {
                "seed_id": "clause-1",
                "target_labels": ["Clause"],
                "target_id": "clause-21",  # Graph-discovered clause
                "target_text": "Graph connected clause 21",
                "target_title": "Security Policy",
                "dist": 2,
                "rel_types": ["NEXT_CLAUSE", "REFERENCES"],
            },
            {
                "seed_id": "clause-1",
                "target_labels": ["Entity"],
                "target_id": "entity-gdpr",
                "target_name": "GDPR Compliance",
                "dist": 1,
                "rel_types": ["HAS_ENTITY"],
            },
        ]
        mock_neo4j.return_value = mock_neo4j_records

        retriever = HybridRetriever()
        org_id = str(uuid.uuid4())
        result = retriever.retrieve_sync(
            query="What is the data security requirement?",
            organization_id=org_id,
            top_k_vector=20,
            top_n_final=10,
        )

        self.assertEqual(result.query, "What is the data security requirement?")
        self.assertEqual(result.organization_id, org_id)
        self.assertEqual(len(result.items), 10)  # Top 10 returned

        top_item = result.items[0]
        self.assertIsInstance(top_item, HybridSearchResultItem)
        self.assertEqual(top_item.clause_id, "clause-1")
        self.assertEqual(top_item.document_name, "Master Service Agreement")
        self.assertGreater(top_item.final_score, 0.0)
        self.assertIn("hop_distance", top_item.relationship_metadata)

    @patch.object(HybridRetriever, "retrieve_sync")
    def test_retrieve_async(self, mock_sync):
        mock_sync.return_value = MagicMock(total_retrieved=5)
        retriever = HybridRetriever()

        async def _run():
            return await retriever.retrieve("test query", organization_id="org-1")

        res = asyncio.run(_run())
        self.assertEqual(res.total_retrieved, 5)
        mock_sync.assert_called_once_with("test query", "org-1", None, None, None, None)

    @patch("app.services.retrieval_orchestrator.get_hybrid_retriever")
    def test_retrieval_orchestrator_compatibility(self, mock_get_retriever):
        mock_item = HybridSearchResultItem(
            clause_id="c-1",
            clause_text="Text of clause 1",
            document_name="Doc 1",
            document_id="doc-1",
            vector_score=0.9,
            graph_score=0.5,
            final_score=0.78,
            relationship_metadata={"shared_entities": ["Entity A"]},
        )
        mock_res = MagicMock()
        mock_res.items = [mock_item]

        mock_instance = MagicMock()
        mock_instance.retrieve_sync.return_value = mock_res
        mock_get_retriever.return_value = mock_instance

        context = retrieve_context(organization_id="org-uuid", question="Data retention")

        self.assertEqual(context.total_clauses, 1)
        self.assertEqual(context.clauses[0].clause_id, "c-1")
        self.assertEqual(context.clauses[0].score, 0.78)
        self.assertIn("Clause c-1", context.formatted_prompt_context)


if __name__ == "__main__":
    unittest.main()
