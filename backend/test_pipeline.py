from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.db.mongo import store_document
from app.services.preprocessing import preprocess_text, validate_pipeline_output
from app.services.scraper import fetch_and_process_external_data
from app.utils.file_handler import extract_text, save_processed_json, save_raw_file
from app.utils.hash import generate_content_hash


def _print_header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def _print_upload_result(result: dict) -> None:
    print(f"Stored in MongoDB: {result['stored_in_db']}")
    print(f"Document ID: {result.get('document_id') or 'N/A'}")
    print(f"Raw Path: {result['raw_path']}")
    print(f"Processed Path: {result['processed_path']}")
    print(f"Clauses Count: {result['clauses_count']}")

    if result["clauses"]:
        sample = result["clauses"][0]
        print("Sample Clause:")
        print(f"  text: {sample.get('text', '')}")
        print(f"  type: {sample.get('type', '')}")
    else:
        print("Sample Clause: N/A")


def run_sample_upload_test() -> dict:
    """Run upload-style pipeline using a sample legal TXT document."""
    _print_header("A) Upload Sample Document Test")

    sample_text = (
        "The licensee shall maintain compliance with all statutory requirements. "
        "If the licensee fails to submit quarterly reports, a penalty may be imposed. "
        "The organization is required to keep records for at least five years."
    )
    filename = "sample_legal_document.txt"
    file_bytes = sample_text.encode("utf-8")

    content_hash = generate_content_hash(file_bytes)
    raw_path = save_raw_file(file_bytes, filename, source="user", file_hash=content_hash)

    extracted_text = extract_text(file_bytes, filename)
    clauses = preprocess_text(extracted_text)

    payload = {
        "source": "user",
        "source_type": "user",
        "title": filename,
        "url": "",
        "date": datetime.now(timezone.utc).date().isoformat(),
        "raw_text": extracted_text,
        "clauses": clauses,
        "hash": content_hash,
    }

    processed_path = save_processed_json(payload, content_hash, source="user")

    is_valid = validate_pipeline_output({"text": extracted_text, "clauses": clauses})
    document_id = None
    if is_valid:
        document_id = store_document(payload, "user")

    result = {
        "stored_in_db": bool(document_id),
        "document_id": document_id,
        "raw_path": raw_path,
        "processed_path": processed_path,
        "clauses_count": len(clauses),
        "clauses": clauses,
    }

    _print_upload_result(result)
    return result


def _print_external_result(summary: dict) -> None:
    print(f"Total Stored: {summary.get('total_stored', 0)}")
    print(f"Total Duplicates: {summary.get('total_duplicates', 0)}")
    print(f"Total Errors: {summary.get('total_errors', 0)}")

    results = summary.get("results", {})
    for source_key in ("gazette", "news"):
        source_result = results.get(source_key)
        if not source_result:
            continue

        print(f"\nSource: {source_key}")
        print(f"  Stored Count: {source_result.get('stored_count', 0)}")
        print(f"  Duplicate Count: {source_result.get('duplicate_count', 0)}")
        print(f"  Error Count: {source_result.get('error_count', 0)}")

        stored_items = source_result.get("stored", [])
        if stored_items:
            first = stored_items[0]
            print("  Sample Stored Item:")
            print(f"    title: {first.get('title', 'N/A')}")
            print(f"    stored_in_mongodb: {bool(first.get('document_id'))}")
            print(f"    document_id: {first.get('document_id', 'N/A')}")


def run_external_fetch_test(max_items: int = 2) -> dict:
    """Run full external fetch and processing pipeline."""
    _print_header("B) Fetch External Data Test")

    summary = fetch_and_process_external_data(max_items=max_items)
    _print_external_result(summary)
    return summary


def main() -> None:
    _print_header("LexisGraph Layer 1 Pipeline Validation")
    print("Running standalone checks for upload and external ingestion pipelines...")
    print(f"Working directory: {Path.cwd()}")

    try:
        run_sample_upload_test()
    except Exception as exc:  # noqa: BLE001
        print(f"Upload sample test failed: {exc}")

    try:
        run_external_fetch_test(max_items=2)
    except Exception as exc:  # noqa: BLE001
        print(f"External fetch test failed: {exc}")
        print("Tip: Set NEWSAPI_KEY environment variable for news ingestion.")

    _print_header("Done")
    print("Run complete.")


if __name__ == "__main__":
    main()
