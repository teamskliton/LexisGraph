"""
Seed script to insert test documents and clauses directly into Neo4j Aura
to verify the connection and graph writes are working correctly.

Run with:
cd backend
python -m app.scripts.seed_test_graph
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
from dotenv import load_dotenv

load_dotenv(dotenv_path=_env_path, override=True)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.db.neo4j import is_neo4j_available, run_query

_TEST_DOC_IDS = ("test_doc_001", "test_doc_002")
_TEST_CLAUSE_IDS = (
    "clause_001",
    "clause_002",
    "clause_003",
    "clause_ext_001",
    "clause_ext_002",
    "clause_ext_003",
)


def clear_test_data() -> None:
    print("[SEED] Clearing seed test nodes (by id)...")
    run_query(
        "MATCH (d:Document) WHERE d.id IN $ids DETACH DELETE d",
        {"ids": list(_TEST_DOC_IDS)},
        write=True,
    )
    run_query(
        "MATCH (c:Clause) WHERE c.id IN $ids DETACH DELETE c",
        {"ids": list(_TEST_CLAUSE_IDS)},
        write=True,
    )
    result = run_query("MATCH (n) RETURN count(n) AS total")
    print(f"[SEED] Total nodes currently in DB: {result}")


def seed_documents() -> None:
    print("[SEED] Creating test Document nodes...")
    docs = [
        {
            "id": "test_doc_001",
            "title": "GDPR_Policy_Test.pdf",
            "source_type": "user",
            "clause_count": 3,
        },
        {
            "id": "test_doc_002",
            "title": "EU_Regulation_2016_679.pdf",
            "source_type": "external",
            "clause_count": 3,
        },
    ]

    result = run_query(
        """
    UNWIND $docs AS doc
    MERGE (d:Document {id: doc.id})
    ON CREATE SET
        d.title = doc.title,
        d.source_type = doc.source_type,
        d.clause_count = doc.clause_count,
        d.created_at = datetime()
    RETURN count(d) AS created
    """,
        {"docs": docs},
        write=True,
    )

    print(f"[SEED] Document creation result: {result}")


def seed_clauses() -> None:
    print("[SEED] Creating test Clause nodes...")
    clauses = [
        {
            "id": "clause_001",
            "text": "Personal data shall be processed lawfully, fairly, and transparently.",
            "doc_id": "test_doc_001",
            "source_type": "user",
            "compliance_status": "compliant",
        },
        {
            "id": "clause_002",
            "text": "Data subjects have the right to erasure of their personal data.",
            "doc_id": "test_doc_001",
            "source_type": "user",
            "compliance_status": "gap",
        },
        {
            "id": "clause_003",
            "text": "The organization shall appoint a Data Protection Officer.",
            "doc_id": "test_doc_001",
            "source_type": "user",
            "compliance_status": "gap",
        },
        {
            "id": "clause_ext_001",
            "text": "Controllers must implement appropriate technical and organisational measures.",
            "doc_id": "test_doc_002",
            "source_type": "external",
            "compliance_status": "compliant",
        },
        {
            "id": "clause_ext_002",
            "text": "The right to be forgotten applies when data is no longer necessary.",
            "doc_id": "test_doc_002",
            "source_type": "external",
            "compliance_status": "compliant",
        },
        {
            "id": "clause_ext_003",
            "text": "Data breach notification must occur within 72 hours of discovery.",
            "doc_id": "test_doc_002",
            "source_type": "external",
            "compliance_status": "compliant",
        },
    ]

    result = run_query(
        """
    UNWIND $clauses AS clause
    MERGE (c:Clause {id: clause.id})
    ON CREATE SET
        c.text = clause.text,
        c.doc_id = clause.doc_id,
        c.source_type = clause.source_type,
        c.compliance_status = clause.compliance_status,
        c.created_at = datetime()
    RETURN count(c) AS created
    """,
        {"clauses": clauses},
        write=True,
    )

    print(f"[SEED] Clause creation result: {result}")


def seed_has_clause_edges() -> None:
    print("[SEED] Creating HAS_CLAUSE edges...")
    edges = [
        {"doc_id": "test_doc_001", "clause_id": "clause_001"},
        {"doc_id": "test_doc_001", "clause_id": "clause_002"},
        {"doc_id": "test_doc_001", "clause_id": "clause_003"},
        {"doc_id": "test_doc_002", "clause_id": "clause_ext_001"},
        {"doc_id": "test_doc_002", "clause_id": "clause_ext_002"},
        {"doc_id": "test_doc_002", "clause_id": "clause_ext_003"},
    ]

    result = run_query(
        """
    UNWIND $edges AS edge
    MATCH (d:Document {id: edge.doc_id})
    MATCH (c:Clause {id: edge.clause_id})
    MERGE (d)-[:HAS_CLAUSE]->(c)
    RETURN count(*) AS edges_created
    """,
        {"edges": edges},
        write=True,
    )

    print(f"[SEED] HAS_CLAUSE edges result: {result}")


def seed_similar_to_edges() -> None:
    print("[SEED] Creating SIMILAR_TO edges...")
    similarities = [
        {"from_id": "clause_002", "to_id": "clause_ext_002", "score": 0.91},
        {"from_id": "clause_001", "to_id": "clause_ext_001", "score": 0.87},
        {"from_id": "clause_003", "to_id": "clause_ext_003", "score": 0.72},
    ]

    result = run_query(
        """
    UNWIND $sims AS sim
    MATCH (a:Clause {id: sim.from_id})
    MATCH (b:Clause {id: sim.to_id})
    MERGE (a)-[r:SIMILAR_TO]->(b)
    ON CREATE SET r.score = sim.score
    RETURN count(r) AS edges_created
    """,
        {"sims": similarities},
        write=True,
    )

    print(f"[SEED] SIMILAR_TO edges result: {result}")


def verify_final_state() -> None:
    print("\n[SEED] ===== FINAL VERIFICATION =====")

    checks = [
        ("Total nodes", "MATCH (n) RETURN count(n) AS cnt"),
        ("Document nodes", "MATCH (d:Document) RETURN count(d) AS cnt"),
        ("Clause nodes", "MATCH (c:Clause) RETURN count(c) AS cnt"),
        ("HAS_CLAUSE edges", "MATCH ()-[:HAS_CLAUSE]->() RETURN count(*) AS cnt"),
        ("SIMILAR_TO edges", "MATCH ()-[:SIMILAR_TO]->() RETURN count(*) AS cnt"),
    ]

    all_passed = True
    for label, query in checks:
        result = run_query(query)
        count = result[0]["cnt"] if result else "ERROR"
        status = "OK" if isinstance(count, int) and count > 0 else "FAIL"
        print(f"  [{status}] {label}: {count}")
        if not isinstance(count, int) or count == 0:
            all_passed = False

    print("\n[SEED] Sample document query:")
    docs = run_query(
        "MATCH (d:Document) RETURN d.id AS id, d.title AS title, d.source_type AS source_type LIMIT 5",
    )
    for row in docs or []:
        print(f"  -> {row}")

    print("\n[SEED] Sample clause query:")
    clauses = run_query(
        "MATCH (c:Clause) RETURN c.id AS id, c.text AS text, c.compliance_status AS compliance_status LIMIT 3",
    )
    for row in clauses or []:
        print(f"  -> {row}")

    print("\n[SEED] Graph path query:")
    paths = run_query(
        """
    MATCH (d:Document)-[:HAS_CLAUSE]->(c:Clause)-[:SIMILAR_TO]->(c2:Clause)
    RETURN d.title AS title, c.text AS c1, c2.text AS c2 LIMIT 3
    """,
    )
    for row in paths or []:
        print(f"  -> {row}")

    if all_passed:
        print("\nSEED COMPLETE — Neo4j Aura graph is working correctly.")
        print("   Open your Aura browser and run: MATCH (n) RETURN n LIMIT 25")
    else:
        print("\nSEED FAILED — Check the errors above")
        print("   Verify NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in backend/.env")


def main() -> None:
    print("[SEED] ===== LexisGraph Neo4j Test Data Seeder =====")
    uri = os.getenv("NEO4J_URI", "NOT SET")
    print(f"[SEED] Connecting to: {uri[:35]}...")

    if not is_neo4j_available():
        print("[SEED] Neo4j is not reachable. Check .env credentials.")
        sys.exit(1)

    print("[SEED] Neo4j connection confirmed")

    clear_test_data()
    seed_documents()
    seed_clauses()
    seed_has_clause_edges()
    seed_similar_to_edges()
    verify_final_state()


if __name__ == "__main__":
    main()
