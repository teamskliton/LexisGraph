from app.services import compliance
from app.services.clause_utils import generate_clause_id


def test_best_graph_neighbor_score_queries_by_clause_id(monkeypatch):
    captured = {}

    def _fake_run_query(_query: str, params: dict):
        captured.update(params)
        return [{"score": 0.91}]

    monkeypatch.setattr(compliance, "run_query", _fake_run_query)

    clause_text = "The organization shall retain records for five years."
    score = compliance._best_graph_neighbor_score(clause_text)

    assert score == 0.91
    assert captured["id"] == generate_clause_id(clause_text)
