import sys
from datetime import datetime, timezone
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.db.mongo import get_database
from app.db.neo4j import run_query
from app.services.graph_builder import build_graph, create_similarity_edges
from app.services.preprocessing import process_document
from app.utils.hash import generate_content_hash


def check_mongo() -> bool:
    db = get_database()
    try:
        db.command("ping")
        print("MongoDB Atlas connected successfully")
        return True
    except Exception as exc:
        print("MongoDB connection failed:", str(exc))
        return False


def check_neo4j() -> bool:
    try:
        result = run_query("RETURN 'Neo4j Aura Connected' AS message")
        if result:
            print(result[0].get("message", "Neo4j Aura Connected"))
        else:
            print("Neo4j Aura Connected")
        return True
    except Exception as exc:
        print("Neo4j connection failed:", str(exc))
        return False


def clear_mongo() -> None:
    db = get_database()
    db["user_documents"].delete_many({})
    db["external_documents"].delete_many({})


def clear_neo4j() -> None:
    run_query("MATCH (n) DETACH DELETE n")


def seed_data() -> None:
    db = get_database()

    user_docs = [
        {
            "title": "Security Policy",
            "content": """
            Employees must protect user data at all times.
            Systems shall enforce authentication mechanisms.
            All access to sensitive data must be logged.
            Violation of policies may lead to disciplinary action.
            """,
        },
        {
            "title": "Access Control Policy",
            "content": """
            Access to systems must be restricted based on user roles.
            Users shall not access unauthorized data.
            Multi-factor authentication must be implemented.
            Violations may lead to disciplinary action.
            """,
        },
        {
            "title": "Data Retention Policy",
            "content": """
            Personal data must be retained only as long as necessary.
            Organizations shall delete outdated records securely.
            Retention policies must comply with regulations.
            Failure to follow retention rules may result in penalties.
            """,
        },
        {
            "title": "Incident Response Policy",
            "content": """
            Security incidents must be reported immediately.
            The organization shall investigate all breaches.
            Incident logs must be maintained.
            Failure to report incidents may lead to penalties.
            """,
        },
    ]

    external_docs = [
        {
            "title": "Data Regulation",
            "content": """
            Organizations must secure personal data.
            Data controllers shall implement safeguards.
            Breach of regulations may result in penalties.
            Logs must be maintained for audit purposes.
            """,
            "source_type": "regulation",
        },
        {
            "title": "Cybersecurity Regulation",
            "content": """
            Organizations must implement strong authentication mechanisms.
            Systems shall prevent unauthorized access.
            Security breaches must be reported to authorities.
            Failure to comply may result in fines.
            """,
            "source_type": "regulation",
        },
        {
            "title": "Data Privacy Regulation",
            "content": """
            Personal data must be processed lawfully.
            Users shall have rights over their data.
            Data controllers must ensure data protection.
            Violations may lead to penalties and legal action.
            """,
            "source_type": "regulation",
        },
    ]

    for doc in user_docs:
        raw_text = doc["content"].strip()
        processed = process_document(raw_text, source="user")
        content_hash = generate_content_hash(raw_text.encode("utf-8"))
        db["user_documents"].insert_one(
            {
                "title": doc["title"],
                "source": "user",
                "source_type": "user",
                "raw_text": raw_text,
                "clauses": processed,
                "hash": content_hash,
                "created_at": datetime.now(timezone.utc),
            }
        )

    for doc in external_docs:
        raw_text = doc["content"].strip()
        processed = process_document(raw_text, source="external")
        content_hash = generate_content_hash(raw_text.encode("utf-8"))
        db["external_documents"].insert_one(
            {
                "title": doc["title"],
                "source": "external",
                "source_type": doc["source_type"],
                "raw_text": raw_text,
                "clauses": processed,
                "hash": content_hash,
                "created_at": datetime.now(timezone.utc),
            }
        )


def run_pipeline() -> None:
    print("Checking connections...")
    if not check_mongo():
        return
    if not check_neo4j():
        return

    print("Clearing databases...")
    clear_mongo()
    clear_neo4j()

    print("Seeding data...")
    seed_data()

    print("Building graph...")
    build_graph()

    print("Building similarity edges...")
    create_similarity_edges()

    print("Cloud pipeline completed successfully")


if __name__ == "__main__":
    run_pipeline()
