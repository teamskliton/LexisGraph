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
from app.services.job_manager import job_manager

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

    from app.services.job_manager import job_manager

    status_str = job.status.value if hasattr(job.status, "value") else str(job.status)
    job_manager.broadcast_job_progress(
        job_id,
        status=status_str,
        progress=progress,
        current_step=current_step,
        updated_at=job.updated_at.isoformat() if hasattr(job.updated_at, "isoformat") else str(job.updated_at),
    )

    logger.info(
        "Stage completed: stage=%r progress=%s%% job_id=%s status=%s",
        current_step,
        progress,
        job_id,
        status_str,
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
            # ---------------------------------------------------------------
            # Stage 3: 25% — Atomic Requirement Extraction
            # ---------------------------------------------------------------
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 3: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 25, "Extracting atomic requirements")

            regulation_name = getattr(reg_doc, "title", None) or getattr(reg_doc, "original_filename", None) or "Regulation"
            policy_title = getattr(policy_doc, "original_filename", None) or "Policy"

            try:
                from app.services.atomic_extractor import AtomicRequirementExtractor, _make_fallback_requirement
                extractor = AtomicRequirementExtractor(regulation_name=regulation_name)
                atomic_requirements = extractor.extract(reg_clauses)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[JOB_WORKER] AtomicRequirementExtractor failed (%s) — fallback to one-per-clause", exc)
                from app.services.atomic_extractor import _make_fallback_requirement
                atomic_requirements = [_make_fallback_requirement(c, regulation_name) for c in reg_clauses]

            logger.info("[JOB_WORKER] Atomic extraction: %s clauses → %s requirements", len(reg_clauses), len(atomic_requirements))

            # ---------------------------------------------------------------
            # Stage 4: 40% — Applicability Classification
            # ---------------------------------------------------------------
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 4: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 40, f"Classifying applicability of {len(atomic_requirements)} requirements")

            try:
                from app.services.applicability_classifier import ApplicabilityClassifier, ApplicabilityResult
                classifier = ApplicabilityClassifier(
                    policy_title=policy_title,
                    policy_scope=(
                        f"Internal policy document '{policy_title}' for organization '{getattr(org, 'name', str(org.id))}'"
                    ),
                )
                applicability_map = classifier.classify(atomic_requirements)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[JOB_WORKER] ApplicabilityClassifier failed (%s) — treating all as APPLICABLE", exc)
                from app.services.applicability_classifier import ApplicabilityResult
                applicability_map = {
                    req.requirement_id: ApplicabilityResult(
                        requirement_id=req.requirement_id,
                        applicability_status="APPLICABLE",
                        applicability_reason="Classifier unavailable; defaulting to APPLICABLE.",
                        applicability_confidence=0.50,
                        classified_by="LLM_FALLBACK",
                    )
                    for req in atomic_requirements
                }

            # Partition requirements
            applicable_reqs = []
            not_applicable_reqs = []
            uncertain_reqs = []

            for req in atomic_requirements:
                result = applicability_map.get(req.requirement_id)
                if result is None:
                    uncertain_reqs.append(req)
                elif result.applicability_status == "NOT_APPLICABLE":
                    not_applicable_reqs.append((req, result))
                elif result.applicability_status == "UNCERTAIN":
                    uncertain_reqs.append(req)
                else:
                    applicable_reqs.append(req)

            logger.info(
                "[JOB_WORKER] Applicability: APPLICABLE=%s UNCERTAIN=%s NOT_APPLICABLE=%s",
                len(applicable_reqs), len(uncertain_reqs), len(not_applicable_reqs),
            )

            requirements_to_evaluate = applicable_reqs + uncertain_reqs

            # ---------------------------------------------------------------
            # Stage 5: 55% — Vector Retrieval (APPLICABLE + UNCERTAIN only)
            # ---------------------------------------------------------------
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 5: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 55, f"Vector retrieval for {len(requirements_to_evaluate)} applicable requirements")

            # Ensure embeddings exist on atomic requirements (reuse clause embeddings)
            from app.services.embedding_model import get_embedding_model as _get_emb_model
            emb_model = None
            clause_emb_lookup = {
                str(c.get("clause_id") or ""): c.get("embedding") or []
                for c in reg_clauses
            }

            def _get_req_emb(req):
                if req.embedding and isinstance(req.embedding, list):
                    return req.embedding
                emb = clause_emb_lookup.get(req.clause_id)
                if emb and isinstance(emb, list):
                    return emb
                nonlocal emb_model
                try:
                    if emb_model is None:
                        emb_model = _get_emb_model()
                    vec = emb_model.encode(req.requirement_text)
                    return vec.tolist() if hasattr(vec, "tolist") else list(vec)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[JOB_WORKER] Embedding failed for req %s: %s", req.requirement_id, exc)
                    return None

            policy_doc_id_str = str(policy_doc.id)
            retrieval_items: list[dict[str, Any]] = []

            for req_idx, req in enumerate(requirements_to_evaluate):
                req_emb = _get_req_emb(req)
                is_uncertain = req in uncertain_reqs

                matched_policy_clauses: list[dict[str, Any]] = []
                if req_emb and isinstance(req_emb, list):
                    matched_policy_clauses = _search_policy_clauses_in_qdrant(
                        regulation_embedding=req_emb,
                        policy_document_id=policy_doc_id_str,
                        top_k=_QDRANT_TOP_K,
                        all_policy_clauses=all_policy_clauses,
                    )

                retrieval_items.append({
                    "index": req_idx + 1,
                    "req_id": req.requirement_id,
                    "clause_id": req.clause_id,
                    "regulation_clause": req.requirement_text,
                    "matched_policy_clauses": matched_policy_clauses,
                    "structural_context": {"parent_document": None, "sibling_clauses": [], "entities": []},
                    "applicability_status": "UNCERTAIN" if is_uncertain else "APPLICABLE",
                    "applicability_confidence": applicability_map.get(req.requirement_id, type("_", (), {"applicability_confidence": 0.9})()).applicability_confidence if req.requirement_id in applicability_map else 0.9,
                    "requirement_topic": req.topic,
                    "requirement_actor": req.actor,
                    "requirement_action": req.action,
                    "requirement_object": req.object,
                    "obligation_type": req.obligation_type,
                })

            # ---------------------------------------------------------------
            # Stage 6: 65% — Knowledge Graph Context
            # ---------------------------------------------------------------
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 6: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 65, "Knowledge graph retrieval")

            for item in retrieval_items:
                if item["matched_policy_clauses"]:
                    item["structural_context"] = _get_structural_context(item["matched_policy_clauses"][0]["clause_id"])

            # ---------------------------------------------------------------
            # Stage 7: 70% → 89% — Batched LLM Reasoning
            # ---------------------------------------------------------------
            all_eval_results: list[dict[str, Any]] = []
            llm_batch_size = 10
            total_items = len(retrieval_items)
            total_batches = (total_items + llm_batch_size - 1) // llm_batch_size if total_items > 0 else 1

            for batch_num, batch_start in enumerate(range(0, total_items, llm_batch_size), start=1):
                job = db.get(ComplianceJob, job_id)
                if job and job.status == ComplianceJobStatus.CANCELLED:
                    logger.info("Job cancelled during LLM evaluation: job_id=%s", job_id)
                    return

                batch = retrieval_items[batch_start: batch_start + llm_batch_size]
                processed_so_far = min(batch_start + len(batch), total_items)
                stage_progress = 70 + int(19 * (batch_num - 1) / max(total_batches, 1))
                update_job_progress(
                    db, job_id, stage_progress,
                    f"LLM reasoning: evaluating requirements ({processed_so_far}/{total_items})",
                )

                batch_results = evaluate_batch_compliance_with_llm(batch)
                all_eval_results.extend(batch_results)

                post_stage_progress = 70 + int(19 * batch_num / max(total_batches, 1))
                update_job_progress(
                    db, job_id, min(post_stage_progress, 89),
                    f"LLM reasoning: evaluated {processed_so_far}/{total_items} requirements",
                )

            # ---------------------------------------------------------------
            # Stage 8: 90% — Generating Recommendations & Aggregating
            # ---------------------------------------------------------------
            job = db.get(ComplianceJob, job_id)
            if job and job.status == ComplianceJobStatus.CANCELLED:
                logger.info("Job cancelled before Stage 8: job_id=%s", job_id)
                return

            update_job_progress(db, job_id, 90, "Generating recommendations")

            evaluated_clauses: list[dict[str, Any]] = []
            missing_clauses: list[dict[str, Any]] = []
            weak_clauses: list[dict[str, Any]] = []
            not_applicable_clauses: list[dict[str, Any]] = []
            recommendations_set: list[str] = []

            compliant_count = 0
            partially_compliant_count = 0
            non_compliant_count = 0
            failed_count = 0

            for retrieval_item, eval_result in zip(retrieval_items, all_eval_results):
                req_id = retrieval_item["req_id"]
                reg_text = retrieval_item["regulation_clause"]
                matched_policy_clauses = retrieval_item["matched_policy_clauses"]
                structural_context = retrieval_item["structural_context"]

                status_val = eval_result["status"]
                reasoning = eval_result["reasoning"]
                rec = eval_result.get("recommendation")
                confidence = eval_result.get("confidence", "HIGH")
                missing_aspects = eval_result.get("missing_aspects", [])
                conflicting_evidence = eval_result.get("conflicting_evidence", False)

                best_policy_text = matched_policy_clauses[0]["text"] if matched_policy_clauses else None
                best_policy_id = matched_policy_clauses[0]["clause_id"] if matched_policy_clauses else None
                best_sim_score = matched_policy_clauses[0]["score"] if matched_policy_clauses else 0.0

                clause_eval = {
                    "requirement_id": req_id,
                    "regulation_clause_id": retrieval_item.get("clause_id", req_id),
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
                    "confidence": confidence,
                    "missing_aspects": missing_aspects,
                    "conflicting_evidence": conflicting_evidence,
                    "reasoning": reasoning,
                    "recommendation": rec,
                    # Applicability fields
                    "applicability_status": retrieval_item.get("applicability_status"),
                    "applicability_confidence": retrieval_item.get("applicability_confidence"),
                    "requirement_topic": retrieval_item.get("requirement_topic"),
                    "requirement_actor": retrieval_item.get("requirement_actor"),
                    "requirement_action": retrieval_item.get("requirement_action"),
                    "requirement_object": retrieval_item.get("requirement_object"),
                    "obligation_type": retrieval_item.get("obligation_type"),
                }
                evaluated_clauses.append(clause_eval)

                if status_val == "COMPLIANT":
                    compliant_count += 1
                elif status_val == "PARTIALLY_COMPLIANT":
                    partially_compliant_count += 1
                    weak_clauses.append({
                        "regulation_clause_id": retrieval_item.get("clause_id", req_id),
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
                        "regulation_clause_id": retrieval_item.get("clause_id", req_id),
                        "regulation_text": reg_text,
                        "reasoning": reasoning,
                        "recommendation": rec,
                    })
                    if rec and rec not in recommendations_set:
                        recommendations_set.append(rec)

            # Build not_applicable_clauses for report
            for req, app_result in not_applicable_reqs:
                not_applicable_clauses.append({
                    "requirement_id": req.requirement_id,
                    "regulation_clause_id": req.clause_id,
                    "regulation_text": req.requirement_text,
                    "topic": req.topic,
                    "actor": req.actor,
                    "obligation_type": req.obligation_type,
                    "applicability_reason": app_result.applicability_reason,
                    "applicability_confidence": app_result.applicability_confidence,
                    "classified_by": app_result.classified_by,
                })

            # Corrected score: exclude NOT_APPLICABLE from denominator
            not_applicable_count = len(not_applicable_reqs)
            applicable_count = len(applicable_reqs)
            uncertain_count = len(uncertain_reqs)
            total_atomic = len(atomic_requirements)

            scoreable_count = (applicable_count + uncertain_count) - failed_count
            raw_points = (compliant_count * 1.0) + (partially_compliant_count * 0.5)
            overall_score = round((raw_points / scoreable_count) * 100.0, 2) if scoreable_count > 0 else 0.0

            summary = (
                f"Evaluated {applicable_count + uncertain_count} applicable regulatory requirements "
                f"(out of {total_atomic} total; {not_applicable_count} excluded as not applicable) "
                f"against policy '{policy_title}'. "
                f"Findings: {compliant_count} Compliant, "
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
                "total_regulation_clauses": applicable_count + uncertain_count,
                "total_atomic_requirements": total_atomic,
                "compliant_count": compliant_count,
                "partially_compliant_count": partially_compliant_count,
                "non_compliant_count": non_compliant_count,
                "failed_count": failed_count,
                "not_applicable_count": not_applicable_count,
                "applicable_count": applicable_count,
                "uncertain_count": uncertain_count,
                "evaluated_clauses": evaluated_clauses,
                "missing_clauses": missing_clauses,
                "weak_clauses": weak_clauses,
                "not_applicable_clauses": not_applicable_clauses,
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
            not_applicable_count=result_payload.get("not_applicable_count", 0),
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
        job_manager.broadcast_job_completed(job_id, report.id, elapsed_ms)

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
        job_manager.broadcast_job_failed(job_id, err_str)
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
