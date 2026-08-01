"""
Compliance Background Job Worker — Asynchronous execution of compliance analysis pipelines with granular progress tracking.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from app.compliance.models import ComplianceJob, ComplianceJobStatus, ComplianceReport, ComplianceReportStatus
from app.db.models import Document, Organization, Regulation
from app.db.session import get_session
from app.services.activity_service import log_activity

logger = logging.getLogger(__name__)


def update_job_progress(
    db_session: Any,
    job_id: uuid.UUID,
    progress: int,
    current_step: str,
    status: ComplianceJobStatus | None = None,
    error_message: str | None = None,
) -> ComplianceJob | None:
    """
    Persists continuous progress updates (0-100%) and current_step in PostgreSQL.
    """
    job = db_session.get(ComplianceJob, job_id)
    if not job:
        return None

    # Check if job was cancelled by user
    if job.status == ComplianceJobStatus.CANCELLED and status != ComplianceJobStatus.CANCELLED:
        logger.info("Job execution cancelled: job_id=%s stage=%s", job_id, current_step)
        return job

    job.progress = progress
    job.current_step = current_step
    job.updated_at = datetime.now(timezone.utc)

    if status:
        job.status = status
    if error_message:
        job.error_message = error_message

    try:
        db_session.commit()
        db_session.refresh(job)
    except Exception:
        db_session.rollback()
        logger.warning("Failed updating job progress for job_id=%s", job_id)

    logger.info(
        "Stage completed: stage=%r progress=%s%% job_id=%s status=%s",
        current_step,
        progress,
        job_id,
        job.status.value if hasattr(job.status, "value") else str(job.status),
    )
    return job


def execute_compliance_job(job_id: uuid.UUID, db_session: Session | None = None) -> None:
    """
    Asynchronous worker task executing compliance analysis with continuous stage updates.
    Runs non-blockingly in a background task context.
    """
    from app.services.compliance_engine import (
        _QDRANT_TOP_K,
        _search_policy_clauses_in_qdrant,
        _get_structural_context,
        evaluate_batch_compliance_with_llm,
        retrieve_clauses_for_document,
    )

    should_close_db = False
    if db_session is not None:
        db = db_session
    else:
        db = get_session()
        should_close_db = True

    start_time = time.perf_counter()

    try:
        # Load job
        job = db.get(ComplianceJob, job_id)
        if not job:
            logger.error("ComplianceJob %s not found for execution", job_id)
            return

        if job.status == ComplianceJobStatus.CANCELLED:
            logger.info("Skipping execution for cancelled job_id=%s", job_id)
            return

        logger.info("Job started: job_id=%s user_id=%s", job_id, job.created_by)

        # Stage 1: 5% Loading report / Initializing
        job.status = ComplianceJobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        update_job_progress(db, job_id, 5, "Loading report", status=ComplianceJobStatus.RUNNING)

        org = db.get(Organization, job.organization_id)
        reg_doc = db.get(Regulation, job.regulation_id) or db.get(Document, job.regulation_id)
        policy_doc = db.get(Document, job.policy_document_id)

        if not org or not reg_doc or not policy_doc:
            raise ValueError("Invalid target organization, regulation, or policy document for job execution.")

        # Check cancellation
        job = db.get(ComplianceJob, job_id)
        if job and job.status == ComplianceJobStatus.CANCELLED:
            logger.info("Job cancelled at Stage 1: job_id=%s", job_id)
            return

        # Stage 2: 15% Fetching regulation clauses
        update_job_progress(db, job_id, 15, "Fetching regulation clauses")
        reg_clauses = retrieve_clauses_for_document(reg_doc)
        all_policy_clauses = retrieve_clauses_for_document(policy_doc)

        if not reg_clauses:
            # Handle empty regulation clauses gracefully
            result_payload = {
                "overall_score": 0.0,
                "status": "COMPLETED",
                "summary": "No clauses extracted from the regulation document.",
                "total_regulation_clauses": 0,
                "compliant_count": 0,
                "partially_compliant_count": 0,
                "non_compliant_count": 0,
                "failed_count": 0,
                "evaluated_clauses": [],
                "missing_clauses": [],
                "weak_clauses": [],
                "recommendations": ["Ensure regulation document contains readable text/clauses."],
            }
        else:
            # Stage 3: 30% Vector retrieval
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 3: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 30, "Vector retrieval")

            # Ensure regulation clause embeddings exist
            from app.services.embedding_model import get_embedding_model
            model = None
            for reg_item in reg_clauses:
                if not isinstance(reg_item.get("embedding"), list) or not reg_item["embedding"]:
                    if model is None:
                        try:
                            model = get_embedding_model()
                        except Exception as exc:  # noqa: BLE001
                            logger.warning("Embedding model load warning: %s", exc)
                            break
                    try:
                        vec = model.encode(reg_item["text"])
                        reg_item["embedding"] = vec.tolist() if hasattr(vec, "tolist") else list(vec)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Clause embedding warning: %s", exc)

            policy_doc_id_str = str(policy_doc.id)
            retrieval_items: list[dict[str, Any]] = []

            for clause_idx, reg_item in enumerate(reg_clauses):
                reg_text = reg_item["text"]
                reg_id = reg_item["clause_id"]
                reg_emb = reg_item.get("embedding")

                matched_policy_clauses: list[dict[str, Any]] = []
                if reg_emb and isinstance(reg_emb, list):
                    matched_policy_clauses = _search_policy_clauses_in_qdrant(
                        regulation_embedding=reg_emb,
                        policy_document_id=policy_doc_id_str,
                        top_k=_QDRANT_TOP_K,
                        all_policy_clauses=all_policy_clauses,
                    )

                retrieval_items.append({
                    "index": clause_idx + 1,
                    "reg_id": reg_id,
                    "regulation_clause": reg_text,
                    "matched_policy_clauses": matched_policy_clauses,
                    "structural_context": {"parent_document": None, "sibling_clauses": [], "entities": []},
                })

            # Stage 4: 45% Knowledge graph retrieval
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 4: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 45, "Knowledge graph retrieval")

            for item in retrieval_items:
                if item["matched_policy_clauses"]:
                    item["structural_context"] = _get_structural_context(item["matched_policy_clauses"][0]["clause_id"])

            # Stage 5: 60% Hybrid ranking
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 5: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 60, "Hybrid ranking")

            # Stage 6: 75% LLM reasoning
            update_job_progress(db, job_id, 75, "LLM reasoning")
            all_eval_results: list[dict[str, Any]] = []
            llm_batch_size = 8

            for batch_start in range(0, len(retrieval_items), llm_batch_size):
                job = db.get(ComplianceJob, job_id)
                if job and job.status == ComplianceJobStatus.CANCELLED:
                    logger.info("Job cancelled during Stage 6 batch evaluation: job_id=%s", job_id)
                    return

                batch = retrieval_items[batch_start : batch_start + llm_batch_size]
                batch_results = evaluate_batch_compliance_with_llm(batch)
                all_eval_results.extend(batch_results)

            # Stage 7: 90% Generating recommendations
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 7: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 90, "Generating recommendations")

            evaluated_clauses: list[dict[str, Any]] = []
            missing_clauses: list[dict[str, Any]] = []
            weak_clauses: list[dict[str, Any]] = []
            recommendations_set: list[str] = []

            compliant_count = 0
            partially_compliant_count = 0
            non_compliant_count = 0
            failed_count = 0

            for retrieval_item, eval_result in zip(retrieval_items, all_eval_results):
                reg_id = retrieval_item["reg_id"]
                reg_text = retrieval_item["regulation_clause"]
                matched_policy_clauses = retrieval_item["matched_policy_clauses"]
                structural_context = retrieval_item["structural_context"]

                status_val = eval_result["status"]
                reasoning = eval_result["reasoning"]
                rec = eval_result.get("recommendation")

                best_policy_text = matched_policy_clauses[0]["text"] if matched_policy_clauses else None
                best_policy_id = matched_policy_clauses[0]["clause_id"] if matched_policy_clauses else None
                best_sim_score = matched_policy_clauses[0]["score"] if matched_policy_clauses else 0.0

                clause_eval = {
                    "regulation_clause_id": reg_id,
                    "regulation_text": reg_text,
                    "matched_policy_clause_id": best_policy_id,
                    "matched_policy_text": best_policy_text,
                    "similarity_score": round(best_sim_score, 4),
                    "total_policy_matches": len(matched_policy_clauses),
                    "structural_context_available": bool(
                        structural_context.get("parent_document")
                        or structural_context.get("sibling_clauses")
                        or structural_context.get("entities")
                    ),
                    "status": status_val,
                    "reasoning": reasoning,
                    "recommendation": rec,
                }
                evaluated_clauses.append(clause_eval)

                if status_val == "COMPLIANT":
                    compliant_count += 1
                elif status_val == "PARTIALLY_COMPLIANT":
                    partially_compliant_count += 1
                    weak_clauses.append({
                        "regulation_clause_id": reg_id,
                        "regulation_text": reg_text,
                        "matched_policy_text": best_policy_text,
                        "similarity_score": round(best_sim_score, 4),
                        "reasoning": reasoning,
                        "recommendation": rec,
                    })
                    if rec and rec not in recommendations_set:
                        recommendations_set.append(rec)
                elif status_val == "FAILED":
                    failed_count += 1
                else:  # NON_COMPLIANT
                    non_compliant_count += 1
                    missing_clauses.append({
                        "regulation_clause_id": reg_id,
                        "regulation_text": reg_text,
                        "reasoning": reasoning,
                        "recommendation": rec,
                    })
                    if rec and rec not in recommendations_set:
                        recommendations_set.append(rec)

            total_reg = len(reg_clauses)
            scoreable_count = total_reg - failed_count
            raw_points = (compliant_count * 1.0) + (partially_compliant_count * 0.5)
            overall_score = round((raw_points / scoreable_count) * 100.0, 2) if scoreable_count > 0 else 0.0

            summary = (
                f"Evaluated {total_reg} regulation requirements against policy document "
                f"'{policy_doc.original_filename}'. Findings: {compliant_count} Compliant, "
                f"{partially_compliant_count} Partially Compliant, {non_compliant_count} Non-Compliant"
            )
            if failed_count > 0:
                summary += f", {failed_count} Failed (LLM unavailable)"
            summary += f". Overall compliance score: {overall_score:.1f}%."

            result_payload = {
                "overall_score": overall_score,
                "status": "COMPLETED",
                "summary": summary,
                "organization_id": str(org.id),
                "regulation_document_id": str(reg_doc.id),
                "policy_document_id": str(policy_doc.id),
                "total_regulation_clauses": total_reg,
                "compliant_count": compliant_count,
                "partially_compliant_count": partially_compliant_count,
                "non_compliant_count": non_compliant_count,
                "failed_count": failed_count,
                "evaluated_clauses": evaluated_clauses,
                "missing_clauses": missing_clauses,
                "weak_clauses": weak_clauses,
                "recommendations": recommendations_set,
            }

        # Stage 8: 100% Saving report
        update_job_progress(db, job_id, 98, "Saving report")

        elapsed_seconds = time.perf_counter() - start_time
        elapsed_ms = round(elapsed_seconds * 1000.0, 2)

        score_val = result_payload.get("overall_score") or 0.0
        if score_val >= 85.0:
            calculated_risk = "LOW"
        elif score_val >= 70.0:
            calculated_risk = "MEDIUM"
        elif score_val >= 50.0:
            calculated_risk = "HIGH"
        else:
            calculated_risk = "CRITICAL"

        policy_hash = policy_doc.checksum
        regulation_hash = getattr(reg_doc, "document_hash", None) or getattr(reg_doc, "checksum", None) or ""

        # Create ComplianceReport record
        report = ComplianceReport(
            organization_id=org.id,
            regulation_id=reg_doc.id,
            policy_document_id=policy_doc.id,
            policy_hash=policy_hash,
            regulation_hash=regulation_hash,
            overall_score=score_val,
            risk_level=calculated_risk,
            total_clauses=result_payload.get("total_regulation_clauses", 0),
            compliant_clauses=result_payload.get("compliant_count", 0),
            partial_clauses=result_payload.get("partially_compliant_count", 0),
            non_compliant_clauses=result_payload.get("non_compliant_count", 0),
            total_matches=result_payload.get("compliant_count", 0),
            total_partial_matches=result_payload.get("partially_compliant_count", 0),
            total_missing=result_payload.get("non_compliant_count", 0),
            executive_summary=result_payload.get("summary"),
            summary=json.dumps(result_payload, default=str),
            report_json=result_payload,
            recommendations=result_payload.get("recommendations", []),
            processing_time_seconds=round(elapsed_seconds, 2),
            processing_time_ms=elapsed_ms,
            status=ComplianceReportStatus.COMPLETED,
            created_by=job.created_by,
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        # Finalize ComplianceJob
        job = db.get(ComplianceJob, job_id)
        if job:
            job.report_id = report.id
            job.progress = 100
            job.current_step = "Completed"
            job.status = ComplianceJobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.processing_time_ms = elapsed_ms
            db.commit()

        logger.info(
            "Job completed: job_id=%s report_id=%s time=%.2fms",
            job_id,
            report.id,
            elapsed_ms,
        )

        log_activity(
            db,
            user_id=job.created_by,
            event_type="COMPLIANCE_COMPLETED",
            title="Generated Compliance Report",
            description=f"Completed compliance check for {org.name}",
            icon_type="report",
            extra_data={"job_id": str(job_id), "report_id": str(report.id), "overall_score": score_val},
        )

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        elapsed_seconds = time.perf_counter() - start_time
        elapsed_ms = round(elapsed_seconds * 1000.0, 2)
        err_str = str(exc)

        logger.error("Job failed: job_id=%s error=%s", job_id, err_str)
        try:
            failed_job = db.get(ComplianceJob, job_id)
            if failed_job:
                failed_job.status = ComplianceJobStatus.FAILED
                failed_job.error_message = err_str
                failed_job.processing_time_ms = elapsed_ms
                failed_job.completed_at = datetime.now(timezone.utc)
                failed_job.current_step = f"Failed: {err_str[:50]}"
                db.commit()
        except Exception as rollback_exc:
            db.rollback()
            logger.error("Failed setting FAILED status for job_id=%s: %s", job_id, rollback_exc)
    finally:
        if should_close_db:
            db.close()
