from app.services import explainer


def test_explanation_cache_respects_max_size(monkeypatch):
    monkeypatch.setattr(explainer, "_EXPLANATION_CACHE_MAX_SIZE", 2)
    explainer._EXPLANATION_CACHE.clear()

    explainer.set_cached_explanation(("p1", "m1", "gap"), "e1")
    explainer.set_cached_explanation(("p2", "m2", "gap"), "e2")
    explainer.set_cached_explanation(("p3", "m3", "gap"), "e3")

    assert len(explainer._EXPLANATION_CACHE) == 2
    assert ("p1", "m1", "gap") not in explainer._EXPLANATION_CACHE
    assert ("p2", "m2", "gap") in explainer._EXPLANATION_CACHE
    assert ("p3", "m3", "gap") in explainer._EXPLANATION_CACHE
