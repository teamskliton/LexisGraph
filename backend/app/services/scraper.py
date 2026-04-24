import logging
import os
from pathlib import Path
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from app.db.mongo import store_document
from app.services.preprocessing import preprocess_text, validate_pipeline_output
from app.utils.file_handler import file_exists_with_hash, save_processed_json, save_raw_file
from app.utils.hash import generate_content_hash

logger = logging.getLogger(__name__)


GAZETTE_LATEST_URL = "https://egazette.gov.in/"
LIVELAW_URL = "https://www.livelaw.in/"
BARANDBENCH_URL = "https://www.barandbench.com/"
NEWS_API_URL = "https://newsapi.org/v2/everything"
NEWS_QUERY = "law OR regulation OR policy India"
REQUEST_TIMEOUT = 20
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}
PRIORITY_BY_SOURCE = {
    "gazette": "high",
    "livelaw": "medium",
    "barandbench": "medium",
    "news": "low",
}


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _extract_date(value: str | None) -> str:
    text = _clean_text(value)
    if not text:
        return ""

    patterns = [
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{2}[/-]\d{2}[/-]\d{4}\b",
        r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return ""


def _safe_filename(title: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9-_ ]", "", title).strip().replace(" ", "_")
    if not cleaned:
        cleaned = fallback
    return f"{cleaned[:80]}.txt"


def _extract_page_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    paragraphs = [
        _clean_text(p.get_text(" ", strip=True))
        for p in soup.find_all("p")
        if _clean_text(p.get_text(" ", strip=True))
    ]
    if paragraphs:
        return "\n".join(paragraphs)

    return _clean_text(soup.get_text(" ", strip=True))


def _extract_published_date(soup: BeautifulSoup) -> str:
    date_candidates = [
        soup.find("meta", attrs={"property": "article:published_time"}),
        soup.find("meta", attrs={"name": "publish-date"}),
        soup.find("meta", attrs={"name": "pubdate"}),
        soup.find("meta", attrs={"name": "date"}),
        soup.find("meta", attrs={"itemprop": "datePublished"}),
    ]

    for meta in date_candidates:
        if meta and meta.get("content"):
            return _extract_date(meta.get("content")) or _clean_text(meta.get("content"))

    time_tag = soup.find("time")
    if time_tag:
        value = time_tag.get("datetime") or time_tag.get_text(" ", strip=True)
        return _extract_date(value) or _clean_text(value)

    return ""


def _extract_main_content(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "form"]):
        tag.decompose()

    candidate_selectors = [
        "article",
        "main",
        "div[itemprop='articleBody']",
        "div.post-content",
        "div.entry-content",
        "div.story-content",
        "div.article-content",
    ]

    best_text = ""
    for selector in candidate_selectors:
        for container in soup.select(selector):
            for noisy in container.find_all(
                attrs={
                    "class": re.compile(r"related|share|social|advert|sidebar|menu|comment|newsletter", re.IGNORECASE)
                }
            ):
                noisy.decompose()
            for noisy in container.find_all(
                attrs={
                    "id": re.compile(r"related|share|social|advert|sidebar|menu|comment|newsletter", re.IGNORECASE)
                }
            ):
                noisy.decompose()

            chunks = [
                _clean_text(node.get_text(" ", strip=True))
                for node in container.find_all(["p", "li"])
                if _clean_text(node.get_text(" ", strip=True))
            ]
            text = "\n".join(chunks)
            if len(text) > len(best_text):
                best_text = text

    if best_text:
        return best_text

    return _extract_page_text(str(soup))


def _collect_article_links(home_url: str, html: str, max_links: int = 20) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[dict] = []
    seen_urls: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = _clean_text(anchor.get("href"))
        title = _clean_text(anchor.get_text(" ", strip=True))
        if not href or href.startswith("#") or len(title) < 18:
            continue
        if re.search(r"privacy|terms|subscribe|advertise|contact", title, flags=re.IGNORECASE):
            continue

        full_url = urljoin(home_url, href)
        if full_url in seen_urls:
            continue
        if not full_url.startswith("http"):
            continue

        seen_urls.add(full_url)
        context_text = _clean_text(anchor.parent.get_text(" ", strip=True))
        links.append(
            {
                "title": title,
                "url": full_url,
                "date": _extract_date(context_text),
            }
        )

        if len(links) >= max_links:
            break

    return links


def _normalize_record(source_type: str, title: str, content: str, url: str, date: str, priority: str | None = None) -> dict:
    return {
        "source_type": source_type,
        "title": _clean_text(title) or "Untitled",
        "content": _clean_text(content),
        "url": _clean_text(url),
        "date": _clean_text(date),
        "priority": priority or PRIORITY_BY_SOURCE.get(source_type, "low"),
    }


def fetch_gazette_data(max_items: int = 10) -> list[dict]:
    """Fetch latest entries from e-Gazette with resilient parsing."""
    logger.info("Fetching gazette data from %s", GAZETTE_LATEST_URL)

    response = requests.get(GAZETTE_LATEST_URL, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    candidates: list[dict] = []
    seen_urls: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        title = _clean_text(anchor.get_text(" ", strip=True))
        href = _clean_text(anchor["href"])
        if len(title) < 12 or not href:
            continue

        full_url = urljoin(GAZETTE_LATEST_URL, href)
        if full_url in seen_urls:
            continue

        seen_urls.add(full_url)
        context_text = _clean_text(anchor.parent.get_text(" ", strip=True))
        date_hint = _extract_date(context_text)

        content = context_text
        try:
            detail_response = requests.get(full_url, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
            detail_response.raise_for_status()
            content = _extract_page_text(detail_response.text) or context_text
            date_hint = _extract_date(content) or date_hint
        except Exception:  # noqa: BLE001
            logger.debug("Unable to fetch detail page for gazette URL: %s", full_url)

        normalized = _normalize_record(
            "gazette",
            title,
            content,
            full_url,
            date_hint,
            PRIORITY_BY_SOURCE["gazette"],
        )
        if normalized["content"]:
            candidates.append(normalized)

        if len(candidates) >= max_items:
            break

    logger.info("Fetched %s gazette records", len(candidates))
    return candidates


def fetch_livelaw_data(max_items: int = 10) -> list[dict]:
    """Fetch latest legal articles from LiveLaw."""
    logger.info("Fetching LiveLaw data from %s", LIVELAW_URL)

    response = requests.get(LIVELAW_URL, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
    response.raise_for_status()

    article_links = _collect_article_links(LIVELAW_URL, response.text, max_links=max_items * 3)
    records: list[dict] = []

    for link in article_links:
        if len(records) >= max_items:
            break

        try:
            detail_response = requests.get(link["url"], timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
            detail_response.raise_for_status()
            detail_soup = BeautifulSoup(detail_response.text, "html.parser")
            content = _extract_main_content(detail_soup)
            date_value = _extract_published_date(detail_soup) or link.get("date", "")

            normalized = _normalize_record(
                "livelaw",
                link.get("title", "Untitled"),
                content,
                link["url"],
                date_value,
                PRIORITY_BY_SOURCE["livelaw"],
            )
            if normalized["content"]:
                records.append(normalized)
        except Exception:  # noqa: BLE001
            logger.debug("Unable to fetch LiveLaw detail URL: %s", link.get("url", ""))

    logger.info("Fetched %s LiveLaw records", len(records))
    return records


def fetch_barandbench_data(max_items: int = 10) -> list[dict]:
    """Fetch latest legal articles from Bar & Bench."""
    logger.info("Fetching Bar & Bench data from %s", BARANDBENCH_URL)

    response = requests.get(BARANDBENCH_URL, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
    response.raise_for_status()

    article_links = _collect_article_links(BARANDBENCH_URL, response.text, max_links=max_items * 3)
    records: list[dict] = []

    for link in article_links:
        if len(records) >= max_items:
            break

        try:
            detail_response = requests.get(link["url"], timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
            detail_response.raise_for_status()
            detail_soup = BeautifulSoup(detail_response.text, "html.parser")
            content = _extract_main_content(detail_soup)
            date_value = _extract_published_date(detail_soup) or link.get("date", "")

            normalized = _normalize_record(
                "barandbench",
                link.get("title", "Untitled"),
                content,
                link["url"],
                date_value,
                PRIORITY_BY_SOURCE["barandbench"],
            )
            if normalized["content"]:
                records.append(normalized)
        except Exception:  # noqa: BLE001
            logger.debug("Unable to fetch Bar & Bench detail URL: %s", link.get("url", ""))

    logger.info("Fetched %s Bar & Bench records", len(records))
    return records


def fetch_news_data(max_items: int = 10) -> list[dict]:
    """Fetch legal/regulatory updates from NewsAPI."""
    api_key = os.getenv("NEWSAPI_KEY", "").strip()
    if not api_key:
        raise ValueError("NEWSAPI_KEY is not set")

    logger.info("Fetching news data from NewsAPI")

    params = {
        "q": NEWS_QUERY,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": max_items,
        "apiKey": api_key,
    }
    response = requests.get(NEWS_API_URL, params=params, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)
    response.raise_for_status()
    payload = response.json()

    articles = payload.get("articles", [])
    normalized_articles: list[dict] = []
    for article in articles:
        title = _clean_text(article.get("title"))
        description = _clean_text(article.get("description"))
        article_content = _clean_text(article.get("content"))
        content = description if description else article_content

        if not title or not content:
            continue

        normalized_articles.append(
            _normalize_record(
                "news",
                title,
                content,
                article.get("url", ""),
                article.get("publishedAt", ""),
                PRIORITY_BY_SOURCE["news"],
            )
        )

    logger.info("Fetched %s news records", len(normalized_articles))
    return normalized_articles


def ingest_external_records(records: list[dict], source_type: str) -> dict:
    """Deduplicate, preprocess, and persist external records."""
    stored: list[dict] = []
    duplicates = 0
    errors: list[str] = []

    for index, record in enumerate(records, start=1):
        record_source_type = _clean_text(record.get("source_type")) or source_type
        content = _clean_text(record.get("content"))
        if not content:
            continue

        content_hash = generate_content_hash(content.encode("utf-8"))
        if file_exists_with_hash(content_hash, "external"):
            duplicates += 1
            continue

        filename = _safe_filename(record.get("title", ""), f"{record_source_type}_{index}")
        raw_path = save_raw_file(
            content.encode("utf-8"),
            filename,
            source="external",
            file_hash=content_hash,
        )
        raw_path_obj = Path(raw_path)
        if not raw_path_obj.exists() or raw_path_obj.parent != Path("data/raw/external"):
            errors.append("Raw file validation failed")
            logger.warning("Raw file validation failed for external record hash=%s", content_hash)
            continue

        clauses = preprocess_text(content)
        payload = {
            "source": "external",
            "source_type": record_source_type,
            "title": record.get("title", "Untitled"),
            "url": record.get("url", ""),
            "date": record.get("date", ""),
            "priority": record.get("priority", PRIORITY_BY_SOURCE.get(record_source_type, "low")),
            "raw_text": content,
            "clauses": clauses,
            "hash": content_hash,
        }

        processed_path = save_processed_json(payload, content_hash, "external")
        processed_path_obj = Path(processed_path)
        if not processed_path_obj.exists() or processed_path_obj.parent != Path("data/processed/external"):
            errors.append("Processed file validation failed")
            logger.warning("Processed file validation failed for external record hash=%s", content_hash)
            continue

        is_valid = validate_pipeline_output({"text": content, "clauses": clauses})
        if not is_valid:
            logger.warning(
                "Pipeline validation failed for external record title=%s hash=%s; skipping DB store",
                payload["title"],
                content_hash,
            )
            continue

        try:
            document_id = store_document(payload, "external")
            if not document_id:
                duplicates += 1
                logger.info("Skipping duplicate external document in MongoDB for hash=%s", content_hash)
                continue

            logger.info(
                "External record stored: raw_path=%s processed_path=%s hash=%s clauses=%s source_type=%s",
                raw_path,
                processed_path,
                content_hash,
                len(clauses),
                record_source_type,
            )
            stored.append(
                {
                    "document_id": document_id,
                    "hash": content_hash,
                    "title": payload["title"],
                    "url": record.get("url", ""),
                    "date": record.get("date", ""),
                    "path": raw_path,
                    "processed_path": processed_path,
                    "source_type": record_source_type,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed storing external record: %s", record.get("title", "Untitled"))
            errors.append(str(exc))

    return {
        "source_type": source_type,
        "stored_count": len(stored),
        "duplicate_count": duplicates,
        "error_count": len(errors),
        "stored": stored,
        "errors": errors,
    }


def fetch_and_process_external_data(max_items: int = 10) -> dict:
    """Fetch external sources, preprocess content, and store in MongoDB."""
    logger.info("Starting external data ingestion pipeline")

    results: dict[str, dict] = {}
    total_stored = 0
    total_duplicates = 0
    total_errors = 0

    source_steps = [
        ("gazette", fetch_gazette_data),
        ("news", fetch_news_data),
        ("livelaw", fetch_livelaw_data),
        ("barandbench", fetch_barandbench_data),
    ]

    for source_name, fetcher in source_steps:
        try:
            source_records = fetcher(max_items=max_items)
            source_result = ingest_external_records(source_records, source_name)
            source_result["fetched_count"] = len(source_records)
            results[source_name] = source_result

            total_stored += source_result.get("stored_count", 0)
            total_duplicates += source_result.get("duplicate_count", 0)
            total_errors += source_result.get("error_count", 0)

            logger.info(
                "[%s] Fetched %s articles, stored %s (%s duplicates skipped)",
                source_name.upper(),
                len(source_records),
                source_result.get("stored_count", 0),
                source_result.get("duplicate_count", 0),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("%s ingestion failed", source_name)
            total_errors += 1
            results[source_name] = {
                "source_type": source_name,
                "fetched_count": 0,
                "stored_count": 0,
                "duplicate_count": 0,
                "error_count": 1,
                "stored": [],
                "errors": [str(exc)],
            }

    summary = {
        "message": "External ingestion pipeline completed",
        "total_stored": total_stored,
        "total_duplicates": total_duplicates,
        "total_errors": total_errors,
        "results": results,
    }
    logger.info(
        "External ingestion completed: stored=%s duplicates=%s errors=%s",
        total_stored,
        total_duplicates,
        total_errors,
    )
    return summary
