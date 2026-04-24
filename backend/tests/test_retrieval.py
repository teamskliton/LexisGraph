import pytest

from app.services import retrieval


class _ModelStub:
    def encode(self, _query: str):
        return [0.1, 0.2, 0.3]


def test_retrieve_relevant_clauses_raises_on_dimension_mismatch(monkeypatch):
    monkeypatch.setattr(retrieval, "_get_model", lambda: _ModelStub())
    monkeypatch.setattr(
        retrieval,
        "_collect_clauses",
        lambda: [
            {"clause_id": "c1", "text": "Clause 1", "embedding": [0.1, 0.2]},
            {"clause_id": "c2", "text": "Clause 2", "embedding": [0.3, 0.4]},
        ],
    )

    with pytest.raises(ValueError, match="Embedding dimension mismatch"):
        retrieval.retrieve_relevant_clauses("sample query")
