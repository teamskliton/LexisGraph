from datetime import datetime, timezone

from app.db.mongo import get_database
from app.services.preprocessing import process_document
from app.utils.hash import generate_content_hash


def clear_database() -> None:
    """Delete all existing documents from seed target collections."""
    db = get_database()
    db["user_documents"].delete_many({})
    db["external_documents"].delete_many({})


def _user_docs() -> list[dict]:
    return [
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


def _external_docs() -> list[dict]:
    return [
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


def seed_data() -> dict:
    """Process and insert clean seed data into MongoDB."""
    db = get_database()

    user_inserted = 0
    external_inserted = 0

    for doc in _user_docs():
        raw_text = doc["content"].strip()
        clauses = process_document(raw_text, source="user")

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
                "hash": generate_content_hash(raw_text.encode("utf-8")),
                "created_at": datetime.now(timezone.utc),
            }
        )
        user_inserted += 1

    for doc in _external_docs():
        raw_text = doc["content"].strip()
        clauses = process_document(raw_text, source="external")

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
                "hash": generate_content_hash(raw_text.encode("utf-8")),
                "created_at": datetime.now(timezone.utc),
            }
        )
        external_inserted += 1

    return {
        "user_inserted": user_inserted,
        "external_inserted": external_inserted,
    }


if __name__ == "__main__":
    clear_database()
    result = seed_data()
    print("Database reset and seeded successfully")
    print(result)
