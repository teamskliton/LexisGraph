import logging
from threading import Lock

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
_MODEL: SentenceTransformer | None = None
_MODEL_LOCK = Lock()


def get_embedding_model() -> SentenceTransformer:
    """Return shared singleton embedding model for all layers."""
    global _MODEL
    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                logger.info("Loading shared embedding model: %s", _EMBEDDING_MODEL_NAME)
                _MODEL = SentenceTransformer(_EMBEDDING_MODEL_NAME)
    return _MODEL


def is_model_loaded() -> bool:
    return _MODEL is not None


def preload_model() -> None:
    get_embedding_model()
