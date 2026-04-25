import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

MONGO_DB_NAME = "lexisgraph"

_CLIENT: MongoClient | None = None


def _get_mongo_uri() -> str:
    return os.getenv("MONGO_URI", "mongodb://localhost:27017")


def _redact_mongo_uri(uri: str) -> str:
    """Hide credentials before logging URI."""
    try:
        parsed = urlsplit(uri)
        if "@" not in parsed.netloc:
            return uri

        _, host_part = parsed.netloc.rsplit("@", 1)
        redacted_netloc = f"***:***@{host_part}"
        return urlunsplit((parsed.scheme, redacted_netloc, parsed.path, parsed.query, parsed.fragment))
    except Exception:  # noqa: BLE001
        return "<invalid-mongo-uri>"


def _ensure_collections(db: Database) -> None:
    """Ensure all expected collections exist for Layer 1 storage."""
    required_collections = ("user_documents", "external_documents", "domain_documents")
    existing = set(db.list_collection_names())
    for collection_name in required_collections:
        if collection_name not in existing:
            db.create_collection(collection_name)

    db["user_documents"].create_index("hash", unique=True)
    db["external_documents"].create_index("hash", unique=True)
    db["domain_documents"].create_index("hash", unique=True)


def get_client() -> MongoClient:
    """Create/reuse MongoDB client for local community server."""
    global _CLIENT
    if _CLIENT is None:
        mongo_uri = _get_mongo_uri()
        logger.info("Mongo URI: %s", _redact_mongo_uri(mongo_uri))
        _CLIENT = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        _CLIENT.admin.command("ping")
        logger.info("MongoDB client initialized successfully")
    return _CLIENT


def get_database() -> Database:
    """Return lexisgraph database handle."""
    client = get_client()
    db = client[MONGO_DB_NAME]
    _ensure_collections(db)
    logger.info("MongoDB connection initialized for database=%s", MONGO_DB_NAME)
    return db


def close_client() -> None:
    """Close cached MongoDB client if initialized."""
    global _CLIENT
    if _CLIENT is not None:
        _CLIENT.close()
        logger.info("MongoDB client closed")
        _CLIENT = None


def get_user_documents_collection() -> Collection:
    """Return user_documents collection handle."""
    return get_database()["user_documents"]


def get_external_documents_collection() -> Collection:
    """Return external_documents collection handle."""
    return get_database()["external_documents"]


def get_collection(source: str) -> Collection:
    """Return source-specific collection handle."""
    db = get_database()
    if source == "user":
        return db["user_documents"]
    if source == "external":
        return db["external_documents"]
    if source == "domain":
        return db["domain_documents"]
    raise ValueError("source must be one of: 'user', 'external', 'domain'")


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
        "embedding": data.get("embedding", []),
        "created_at": datetime.now(timezone.utc),
        "hash": data.get("hash", ""),
    }

    try:
        logger.info("Saving to MongoDB...")
        logger.info("Clauses count: %s", len(document.get("clauses", [])))
        result = collection.insert_one(document)
        logger.info("Mongo Insert Success: %s", result.inserted_id)
        return str(result.inserted_id)
    except DuplicateKeyError as exc:
        logger.info(
            "Skipping duplicate %s document on insert race with hash=%s",
            source,
            content_hash,
        )
        return None
    except Exception:  # noqa: BLE001
        logger.exception("Mongo Insert Failed")
        raise
