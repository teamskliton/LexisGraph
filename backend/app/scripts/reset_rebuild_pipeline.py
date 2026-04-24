from datetime import datetime, timezone

from app.db.mongo import get_database
from app.db.neo4j import run_query
from app.services.graph_builder import build_graph, create_similarity_edges
from app.services.preprocessing import process_document
from app.utils.hash import generate_content_hash


def clear_mongo() -> dict:
    """Clear target MongoDB collections used by the pipeline."""
    db = get_database()
    user_deleted = db["user_documents"].delete_many({}).deleted_count
    external_deleted = db["external_documents"].delete_many({}).deleted_count
    return {
        "user_deleted": user_deleted,
        "external_deleted": external_deleted,
    }


def seed_data() -> dict:
    """Seed fresh documents and process clauses with current preprocessing logic."""
    db = get_database()

    user_docs = [
        {
            "title": "Data Protection Policy",
            "content": (
                "Employees must ensure that all personal data is stored securely.\n\n"
                "The company shall implement encryption for sensitive information.\n\n"
                "All access to confidential data must be logged and monitored.\n\n"
                "Failure to comply with data protection rules may result in penalties."
            ),
        },
        {
            "title": "Information Security Policy",
            "content": (
                "All systems must have proper authentication mechanisms.\n\n"
                "Users shall not share passwords with unauthorized individuals.\n\n"
                "Security incidents must be reported immediately.\n\n"
                "Violation of security policies may lead to disciplinary action."
            ),
        },
    ]

    external_docs = [
        {
            "title": "Data Protection Regulation",
            "content": (
                "Organizations must protect personal data against unauthorized access.\n\n"
                "Data controllers shall ensure appropriate security measures are implemented.\n\n"
                "Breach of data protection laws may result in fines and penalties.\n\n"
                "Audit logs must be maintained for all data access activities."
            ),
            "source_type": "regulation",
        }
    ]

    user_inserted = 0
    external_inserted = 0

    for doc in user_docs:
        raw_text = doc["content"].strip()
        clauses = process_document(raw_text, source="user")
        content_hash = generate_content_hash(raw_text.encode("utf-8"))

        db["user_documents"].insert_one(
            {
                "title": doc["title"],
                "source": "user",
                "source_type": "user",
                "url": "",
                "date": "",
                "priority": "",
                "raw_text": raw_text,
                "clauses": clauses,
                "hash": content_hash,
                "created_at": datetime.now(timezone.utc),
            }
        )
        user_inserted += 1

    for doc in external_docs:
        raw_text = doc["content"].strip()
        clauses = process_document(raw_text, source="external")
        content_hash = generate_content_hash(raw_text.encode("utf-8"))

        db["external_documents"].insert_one(
            {
                "title": doc["title"],
                "source": "external",
                "source_type": doc["source_type"],
                "url": "",
                "date": "",
                "priority": "",
                "raw_text": raw_text,
                "clauses": clauses,
                "hash": content_hash,
                "created_at": datetime.now(timezone.utc),
            }
        )
        external_inserted += 1

    return {
        "user_inserted": user_inserted,
        "external_inserted": external_inserted,
    }


def clear_neo4j() -> None:
    """Delete all nodes and relationships from Neo4j."""
    run_query("MATCH (n) DETACH DELETE n")


def run_pipeline() -> dict:
    print("Clearing MongoDB...")
    mongo_clear_result = clear_mongo()
    print(mongo_clear_result)

    print("Seeding fresh data...")
    seed_result = seed_data()
    print(seed_result)

    print("Clearing Neo4j...")
    clear_neo4j()

    print("Building graph...")
    graph_result = build_graph()
    print(graph_result)

    print("Building similarity edges...")
    similarity_result = create_similarity_edges()
    print(similarity_result)

    print("Pipeline completed successfully")
    return {
        "mongo_clear": mongo_clear_result,
        "seed": seed_result,
        "graph": graph_result,
        "similarity": similarity_result,
    }


if __name__ == "__main__":
    run_pipeline()
