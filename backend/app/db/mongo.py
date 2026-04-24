import logging
import os
from datetime import datetime, timezone

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)


MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = "lexisgraph"

_CLIENT: MongoClient | None = None


def get_client() -> MongoClient:
    """Create/reuse MongoDB client for local community server."""
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        _CLIENT.admin.command("ping")
        logger.info("MongoDB client initialized at %s", MONGO_URI)
    return _CLIENT


def get_database() -> Database:
    """Return lexisgraph database handle."""
    client = get_client()
    db = client[MONGO_DB_NAME]
    logger.info("MongoDB connection initialized for database=%s", MONGO_DB_NAME)
    return db


def close_client() -> None:
    """Close cached MongoDB client if initialized."""
    global _CLIENT
    if _CLIENT is not None:
        _CLIENT.close()
        logger.info("MongoDB client closed")
        _CLIENT = None


def get_collection(source: str) -> Collection:
    """Return source-specific collection handle."""
    db = get_database()
    if source == "user":
        collection = db["user_documents"]
        collection.create_index("hash", unique=True)
        return collection
    if source == "external":
        collection = db["external_documents"]
        collection.create_index("hash", unique=True)
        return collection
    raise ValueError("source must be either 'user' or 'external'")


def document_hash_exists(source: str, content_hash: str) -> bool:
    """Check whether a document hash already exists in a source collection."""
    if not content_hash:
        return False

    collection = get_collection(source)
    existing = collection.find_one({"hash": content_hash}, {"_id": 1})
    return existing is not None


def store_document(data: dict, source: str) -> str | None:
    """Store processed document in source-specific collection.

    Expected schema:
    {
        "source": "user/external",
        "source_type": "user/gazette/news/livelaw/barandbench",
        "domain": "IT",
        "title": "...",
        "url": "...",
        "date": "...",
        "priority": "high/medium/low",
        "clauses": [...],
        "created_at": timestamp,
        "hash": "..."
    }
    """
    collection = get_collection(source)
    content_hash = data.get("hash", "")

    if document_hash_exists(source, content_hash):
        logger.info(
            "Skipping duplicate %s document with hash=%s",
            source,
            content_hash,
        )
        return None

    document = {
        "source": source,
        "source_type": data.get("source_type", source),
        "domain": data.get("domain", "IT"),
        "title": data.get("title", "untitled"),
        "url": data.get("url", ""),
        "date": data.get("date", ""),
        "priority": data.get("priority", ""),
        "clauses": data.get("clauses", []),
        "created_at": datetime.now(timezone.utc),
        "hash": data.get("hash", ""),
    }

    try:
        result = collection.insert_one(document)
        return str(result.inserted_id)
    except DuplicateKeyError as exc:
        logger.info(
            "Skipping duplicate %s document on insert race with hash=%s",
            source,
            content_hash,
        )
        return None
