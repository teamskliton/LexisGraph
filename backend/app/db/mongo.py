import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

logger = logging.getLogger(__name__)

if load_dotenv is not None:
    _DOTENV_PATH = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(dotenv_path=_DOTENV_PATH)


MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "lexisgraph")

_CLIENT: MongoClient | None = None


def _redact_mongo_uri(uri: str) -> str:
    """Mask credentials in Mongo URI before logging."""
    return re.sub(
        r"(mongodb(?:\+srv)?://[^:\s]+:)([^@\s]+)(@)",
        r"\1***\3",
        uri,
    )


def get_client() -> MongoClient:
    """Create/reuse MongoDB client for local community server."""
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        _CLIENT.admin.command("ping")
        logger.info("MongoDB client initialized at %s", _redact_mongo_uri(MONGO_URI))
    return _CLIENT


def get_database() -> Database:
    """Return lexisgraph database handle."""
    client = get_client()
    db = client[MONGO_DB_NAME]
    logger.info("MongoDB connection initialized for database=%s", MONGO_DB_NAME)
    return db


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
        "title": "...",
        "url": "...",
        "date": "...",
        "priority": "high/medium/low",
        "raw_text": "...",
        "clauses": [...],
        "created_at": timestamp,
        "hash": "..."
    }
    """
    collection = get_collection(source)
    content_hash = data.get("hash", "")

    document = {
        "source": source,
        "source_type": data.get("source_type", source),
        "title": data.get("title", "untitled"),
        "url": data.get("url", ""),
        "date": data.get("date", ""),
        "priority": data.get("priority", ""),
        "raw_text": data.get("raw_text", ""),
        "clauses": data.get("clauses", []),
        "created_at": datetime.now(timezone.utc),
        "hash": data.get("hash", ""),
    }

    try:
        result = collection.update_one(
            {"hash": content_hash},
            {"$setOnInsert": document},
            upsert=True,
        )
        if result.upserted_id is None:
            logger.info(
                "Skipping duplicate %s document with hash=%s",
                source,
                content_hash,
            )
            return None
        return str(result.upserted_id)
    except DuplicateKeyError as exc:
        logger.info(
            "Skipping duplicate %s document on insert race with hash=%s",
            source,
            content_hash,
        )
        return None


def close_client() -> None:
    """Close cached MongoDB client if initialized."""
    global _CLIENT

    if _CLIENT is not None:
        _CLIENT.close()
        logger.info("MongoDB client closed")
        _CLIENT = None
