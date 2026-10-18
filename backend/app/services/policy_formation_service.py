"""
Policy Formation: Regulatory Discovery & Policy Needs Analysis Service.

Produces evidence-backed statutory discovery, policy needs recommendations,
existing workspace policy coverage evaluations, and prioritized policy plans.
Strictly tenant-isolated, avoids fabricating citations or false coverage,
and maintains historical version snapshots for full auditability.
"""
from __future__ import annotations

import copy
import hashlib
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import BackgroundTasks
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.workspace_context import WorkspaceContext
from app.db.models.document import Document, DocumentType, ProcessingStatus
from app.db.models.policy_formation import (
    OrganizationAssessment,
    PolicyNeedsAnalysis,
    PolicyDraft,
    PolicyApprovalAudit,
)
from app.db.models.organization import Organization
from app.db.models.regulation import OrganizationRegulation, Regulation
from app.db.models.user import User
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.services.llm_reasoning import _resolve_reasoning
from app.services.storage import store_published_policy_content, delete_stored_file
from app.services.document_processor import process_document

logger = logging.getLogger(__name__)



# ---------------------------------------------------------------------------
# Verified Statutory Metadata Registry & Legal Provision Mapping
# ---------------------------------------------------------------------------

STATUTORY_INSTRUMENTS_METADATA: Dict[str, Dict[str, Any]] = {
    "DPDP Act": {
        "title": "Digital Personal Data Protection Act, 2023",
        "act_name": "DPDP Act",
        "legal_instrument_type": "Statutory Act of Parliament (Act No. 22 of 2023)",
        "jurisdiction": "India (National)",
        "issuing_authority": "Parliament of India / Ministry of Electronics and Information Technology (MeitY)",
        "act_year": 2023,
        "enactment_date": "August 11, 2023",
        "commencement_status": "Enacted by Parliament; substantive operational rules, Data Protection Board, and phased enforcement dates are pending notification by the Central Government under Section 1(2).",
        "applicability_thresholds": "Applies to digital personal data processed within India, or outside India if offering goods/services to Indian data principals. Mandatory statutory compliance obligations depend on notified rules.",
        "source_domain": "Data Privacy & Protection",
        "official_citation": "The Gazette of India, Extraordinary, Part II, Section 1, No. 22 of 2023",
        "verified_provisions": [
            "Section 4: Grounds for processing personal data",
            "Section 6: Notice and consent requirements",
            "Section 8: General obligations of Data Fiduciary (security safeguards, breach notice, data erasure)",
            "Section 9: Processing of personal data of children",
            "Section 11: Rights of Data Principal (access, correction, grievance redressal)",
        ],
    },
    "GDPR": {
        "title": "General Data Protection Regulation (EU) 2016/679",
        "act_name": "GDPR",
        "legal_instrument_type": "European Union Regulation",
        "jurisdiction": "European Union / EEA",
        "issuing_authority": "European Parliament and Council of the European Union",
        "act_year": 2016,
        "enactment_date": "April 27, 2016",
        "commencement_status": "Fully in force across all EU/EEA member states since May 25, 2018.",
        "applicability_thresholds": "Article 3 (Territorial Scope): Directly applies to organizations established in the EU, or extraterritorially to organizations outside the EU offering goods/services to or monitoring behavior of EU data subjects.",
        "source_domain": "Data Protection & Privacy",
        "official_citation": "Official Journal of the European Union, OJ L 119, 4.5.2016, p. 1–88",
        "verified_provisions": [
            "Article 5: Principles relating to processing of personal data",
            "Article 6: Lawfulness of processing",
            "Article 13-14: Information to be provided to data subjects",
            "Article 32: Security of processing",
            "Article 33-34: Notification of personal data breach to supervisory authority and data subjects",
        ],
    },
    "Information Technology Act": {
        "title": "Information Technology Act, 2000",
        "act_name": "Information Technology Act",
        "legal_instrument_type": "Statutory Act of Parliament & Subordinate Rules",
        "jurisdiction": "India (National)",
        "issuing_authority": "Parliament of India / Ministry of Electronics and Information Technology (MeitY)",
        "act_year": 2000,
        "enactment_date": "June 9, 2000",
        "commencement_status": "In force (October 17, 2000; Section 43A and SPDI Rules in force since April 11, 2011).",
        "applicability_thresholds": "Section 43A applies to body corporates possessing, dealing, or handling sensitive personal data or information (SPDI) in a computer resource located in India.",
        "source_domain": "Cybersecurity & Electronic Commerce",
        "official_citation": "The Gazette of India, Extraordinary, Part II, Section 1, No. 21 of 2000",
        "verified_provisions": [
            "Section 43A: Compensation for failure to protect sensitive personal data or information",
            "Section 72A: Punishment for disclosure of information in breach of lawful contract",
            "Section 79: Exemption from liability of intermediary in certain cases and due diligence",
            "Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data) Rules, 2011",
        ],
    },
    "POSH Act": {
        "title": "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
        "act_name": "POSH Act",
        "legal_instrument_type": "Statutory Act of Parliament",
        "jurisdiction": "India (National)",
        "issuing_authority": "Parliament of India / Ministry of Women and Child Development",
        "act_year": 2013,
        "enactment_date": "April 22, 2013",
        "commencement_status": "Fully in force since December 9, 2013.",
        "applicability_thresholds": "Applies to all employers in India. Mandatory constitution of an Internal Complaints Committee (ICC) applies exclusively to workplaces with 10 or more workers (Section 4). Workplaces with fewer than 10 workers refer complaints to District Local Complaints Committee (LCC) under Section 6.",
        "source_domain": "Employment & Workplace Safety",
        "official_citation": "The Gazette of India, Extraordinary, Part II, Section 1, No. 14 of 2013",
        "verified_provisions": [
            "Section 4: Constitution of Internal Complaints Committee (mandatory for workplaces with 10+ workers)",
            "Section 6: Complaint to Local Complaints Committee (for workplaces with fewer than 10 workers)",
            "Section 19: Duties of employer (formulate policy, organize sensitization, display penal consequences)",
            "Section 21: Annual report submission by Internal Committee to employer and District Officer",
        ],
    },
    "Companies Act": {
        "title": "Companies Act, 2013",
        "act_name": "Companies Act",
        "legal_instrument_type": "Statutory Act of Parliament",
        "jurisdiction": "India (National)",
        "issuing_authority": "Parliament of India / Ministry of Corporate Affairs (MCA)",
        "act_year": 2013,
        "enactment_date": "August 29, 2013",
        "commencement_status": "In force (Phased commencement between September 2013 and April 2014).",
        "applicability_thresholds": "Applies exclusively to incorporated companies in India. Section 177 vigil mechanism applies to listed entities, public deposit companies, or entities with borrowings exceeding Rs 50 Crore.",
        "source_domain": "Corporate Governance & Financial Compliance",
        "official_citation": "The Gazette of India, Extraordinary, Part II, Section 1, No. 18 of 2013",
        "verified_provisions": [
            "Section 134: Financial statements, board report and internal financial controls reporting",
            "Section 166: Statutory duties of company directors",
            "Section 177: Audit committee and vigil mechanism / whistleblower policy (for eligible incorporated entities)",
        ],
    },
    "Factories Act": {
        "title": "Factories Act, 1948",
        "act_name": "Factories Act",
        "legal_instrument_type": "Statutory Act of Parliament",
        "jurisdiction": "India (National / State-Administered)",
        "issuing_authority": "Parliament of India / Ministry of Labour and Employment",
        "act_year": 1948,
        "enactment_date": "September 23, 1948",
        "commencement_status": "In force since April 1, 1949.",
        "applicability_thresholds": "Section 2(m): Applies exclusively to manufacturing premises employing 10 or more workers (with power) or 20 or more workers (without power). Commercial software/IT offices are NOT factories and are governed instead by State Shops & Establishments Acts.",
        "source_domain": "Occupational Health & Industrial Safety",
        "official_citation": "Act No. 63 of 1948",
        "verified_provisions": [
            "Section 2(m): Definition of factory (manufacturing process threshold)",
            "Section 7A: General duties of occupier regarding health and safety of workers",
            "Section 11-20: Cleanliness, ventilation, and physical safety standards in manufacturing premises",
        ],
    },
    "ISO/IEC 27001": {
        "title": "ISO/IEC 27001:2022 Information Security Management",
        "act_name": "ISO/IEC 27001",
        "legal_instrument_type": "Voluntary International Management Standard",
        "jurisdiction": "International",
        "issuing_authority": "International Organization for Standardization (ISO) and International Electrotechnical Commission (IEC)",
        "act_year": 2022,
        "enactment_date": "October 2022",
        "commencement_status": "Published Standard (October 2022; replaces ISO/IEC 27001:2013 with 3-year transition cadence).",
        "applicability_thresholds": "Voluntary risk benchmark; becomes contractually binding when required by client Master Service Agreements (MSAs), RFPs, or regulatory licensing criteria.",
        "source_domain": "Information Security & Risk Management",
        "official_citation": "ISO/IEC 27001:2022 (ISO/IEC Standards Directory)",
        "verified_provisions": [
            "Clause 5: Leadership commitment and information security policies",
            "Clause 6: Risk assessment and treatment planning",
            "Annex A.5: Organizational controls (policies, roles, inventory of information assets)",
            "Annex A.8: Technological controls (access rights, cryptography, data leakage prevention)",
        ],
    },
    "Code on Wages": {
        "title": "Code on Wages, 2019",
        "act_name": "Code on Wages",
        "legal_instrument_type": "Statutory Code of Parliament",
        "jurisdiction": "India (National)",
        "issuing_authority": "Parliament of India / Ministry of Labour and Employment",
        "act_year": 2019,
        "enactment_date": "August 8, 2019",
        "commencement_status": "Passed by Parliament (Act No. 29 of 2019); nationwide enforcement date and subordinate state rules are pending notification. In the interim, legacy wage acts remain operative.",
        "applicability_thresholds": "Consolidates Payment of Wages Act 1936, Minimum Wages Act 1948, Payment of Bonus Act 1965, and Equal Remuneration Act 1976 once formally notified.",
        "source_domain": "Labour & Wage Standards",
        "official_citation": "The Gazette of India, Extraordinary, Part II, Section 1, No. 29 of 2019",
        "verified_provisions": [
            "Section 6-9: Minimum wages calculation, floor wage, and payment cadences",
            "Section 15-20: Deductions from wages and compliance maintenance registers",
        ],
    },
    "FEMA": {
        "title": "Foreign Exchange Management Act, 1999",
        "act_name": "FEMA",
        "legal_instrument_type": "Statutory Act of Parliament & RBI Master Directions",
        "jurisdiction": "India (National)",
        "issuing_authority": "Parliament of India / Reserve Bank of India (RBI) & Ministry of Finance",
        "act_year": 1999,
        "enactment_date": "December 29, 1999",
        "commencement_status": "In force since June 1, 2000.",
        "applicability_thresholds": "Applies to Indian entities engaging in cross-border foreign exchange transactions, export/import of software services, receipt of foreign inward remittances, or overseas investments.",
        "source_domain": "Foreign Exchange & Trade Compliance",
        "official_citation": "Act No. 42 of 1999",
        "verified_provisions": [
            "Section 3: Prohibitions on dealings in foreign exchange without authorized dealer",
            "Section 7-8: Export of goods and services declarations (Softex forms) and realization of foreign exchange",
        ],
    },
}


class PolicyFormationAnalysisService:
    """
    Core engine for Stage 3 Regulatory Discovery & Policy Needs Analysis.
    """

    @classmethod
    def run_analysis(
        cls,
        assessment: OrganizationAssessment,
        db: Session,
        ws: WorkspaceContext,
        existing_decisions: Optional[Dict[str, Any]] = None,
        analysis_id: Optional[uuid.UUID] = None,
    ) -> PolicyNeedsAnalysis:
        """
        Execute full regulatory discovery, policy needs generation, coverage gap analysis,
        and user review decisions preservation.
        """
        logger.info(
            "Starting Policy Needs Analysis for assessment %s (workspace %s)",
            assessment.id,
            ws.organization_id,
        )

        answers: Dict[str, Any] = assessment.answers or {}
        profile: Dict[str, Any] = answers.get("profile", {})
        jurisdiction: Dict[str, Any] = answers.get("jurisdiction", {})
        activities: Dict[str, Any] = answers.get("activities", {})
        scope: Dict[str, Any] = answers.get("scope", {})
        existing_policies: Dict[str, Any] = answers.get("existing_policies", {})

        # Step 1: Regulatory Discovery
        discoveries = cls._discover_regulations(
            profile=profile,
            jurisdiction=jurisdiction,
            activities=activities,
            scope=scope,
            existing_policies=existing_policies,
            db=db,
            ws=ws,
        )

        # Step 2: Policy Needs Identification
        policy_needs = cls._generate_policy_needs(
            profile=profile,
            jurisdiction=jurisdiction,
            activities=activities,
            scope=scope,
            existing_policies=existing_policies,
            discoveries=discoveries,
        )

        # Step 3: Existing Policy Coverage Evaluation
        coverage_findings = cls._evaluate_policy_coverage(
            policy_needs=policy_needs,
            existing_policies=existing_policies,
            db=db,
            ws=ws,
        )

        # Step 4: Merge Human Review Decisions (Safe association, no stale overrides)
        user_decisions = cls._merge_user_decisions(
            policy_needs=policy_needs,
            existing_decisions=existing_decisions or {},
        )

        # Step 5: Summary Metrics
        summary = cls._compute_summary(
            assessment=assessment,
            discoveries=discoveries,
            policy_needs=policy_needs,
            coverage_findings=coverage_findings,
            user_decisions=user_decisions,
        )

        now = datetime.now(timezone.utc)

        # Retrieve existing record if updating or rerunning
        analysis = None
        if analysis_id:
            analysis = db.get(PolicyNeedsAnalysis, analysis_id)

        if not analysis:
            analysis = db.execute(
                select(PolicyNeedsAnalysis)
                .where(
                    and_(
                        PolicyNeedsAnalysis.organization_id == ws.organization_id,
                        PolicyNeedsAnalysis.assessment_id == assessment.id,
                    )
                )
                .order_by(desc(PolicyNeedsAnalysis.version))
            ).scalars().first()

        if analysis:
            # Capture previous snapshot so earlier results remain 100% recoverable
            previous_snapshot = {
                "version": analysis.version,
                "summary": copy.deepcopy(analysis.summary or {}),
                "regulatory_discoveries": copy.deepcopy(analysis.regulatory_discoveries or []),
                "policy_needs": copy.deepcopy(analysis.policy_needs or []),
                "coverage_findings": copy.deepcopy(analysis.coverage_findings or []),
                "user_decisions": copy.deepcopy(analysis.user_decisions or {}),
                "completed_at": analysis.completed_at.isoformat() if analysis.completed_at else None,
                "archived_at": now.isoformat(),
            }
            existing_history = list(analysis.history or [])
            existing_history.append(previous_snapshot)
            analysis.history = existing_history
            flag_modified(analysis, "history")

            # Update existing record and increment version
            analysis.version += 1
            analysis.status = "COMPLETED"
            analysis.summary = summary
            analysis.regulatory_discoveries = discoveries
            analysis.policy_needs = policy_needs
            analysis.coverage_findings = coverage_findings
            analysis.user_decisions = user_decisions
            analysis.completed_at = now
            analysis.updated_at = now
            flag_modified(analysis, "summary")
            flag_modified(analysis, "regulatory_discoveries")
            flag_modified(analysis, "policy_needs")
            flag_modified(analysis, "coverage_findings")
            flag_modified(analysis, "user_decisions")
        else:
            analysis = PolicyNeedsAnalysis(
                id=uuid.uuid4(),
                organization_id=ws.organization_id,
                assessment_id=assessment.id,
                created_by=ws.user.id,
                status="COMPLETED",
                version=1,
                summary=summary,
                regulatory_discoveries=discoveries,
                policy_needs=policy_needs,
                coverage_findings=coverage_findings,
                user_decisions=user_decisions,
                history=[],
                completed_at=now,
                created_at=now,
                updated_at=now,
            )
            db.add(analysis)

        db.commit()
        db.refresh(analysis)

        logger.info(
            "Policy Needs Analysis %s completed (v%d, %d discoveries, %d needs) for assessment %s",
            analysis.id,
            analysis.version,
            len(discoveries),
            len(policy_needs),
            assessment.id,
        )
        return analysis

    @classmethod
    def _discover_regulations(
        cls,
        profile: Dict[str, Any],
        jurisdiction: Dict[str, Any],
        activities: Dict[str, Any],
        scope: Dict[str, Any],
        existing_policies: Dict[str, Any],
        db: Session,
        ws: WorkspaceContext,
    ) -> List[Dict[str, Any]]:
        """
        Identify applicable statutory legislation and standards with traceable evidence,
        differentiating uploaded documents from canonical registry references.
        """
        discoveries: List[Dict[str, Any]] = []
        retrieved_at = datetime.now(timezone.utc).isoformat()

        # Normalize jurisdiction criteria
        primary_country = (jurisdiction.get("primary_country") or "").strip().lower()
        other_countries = [c.strip().lower() for c in jurisdiction.get("other_countries") or []]
        all_countries = [primary_country] + other_countries
        operating_locs = (jurisdiction.get("operating_locations") or "").lower()
        markets_served = (jurisdiction.get("markets_served") or "").lower()

        is_india = any(
            "india" in c for c in all_countries
        ) or "india" in operating_locs or "india" in markets_served or primary_country in ("", "india")

        is_eu = any(
            c in ["eu", "european union", "germany", "france", "ireland", "netherlands", "spain", "italy", "sweden"]
            for c in all_countries
        ) or "europe" in operating_locs or "eu" in markets_served

        is_us = any(
            c in ["us", "usa", "united states", "california", "new york", "texas"]
            for c in all_countries
        ) or "united states" in operating_locs or "us" in markets_served

        # Flags from activities
        has_personal_data = bool(activities.get("personal_data"))
        has_sensitive_data = bool(activities.get("sensitive_data"))
        has_cloud = bool(activities.get("cloud_services"))
        has_ai = bool(activities.get("ai_systems"))
        has_payments = bool(activities.get("payments"))
        has_vendors = bool(activities.get("vendors"))
        has_facilities = bool(activities.get("physical_facilities"))
        has_licenses = bool(activities.get("licensed_activities"))
        employment_types = activities.get("employment_types") or []
        employee_count = profile.get("employee_count", "1-10")
        has_employees = len(employment_types) > 0 or employee_count != "0"
        is_manufacturing = "manufacturing" in (profile.get("industry") or "").lower() or "manufacturing" in (profile.get("products_services") or "").lower()

        # Declared certifications / commitments
        certifications = [c.lower() for c in existing_policies.get("certifications") or []]

        # Inspect database regulations table (both global regulations and workspace-linked)
        db_regs = db.execute(
            select(Regulation)
            .where(
                or_(
                    Regulation.is_global == True,
                    Regulation.id.in_(
                        select(OrganizationRegulation.regulation_id).where(
                            and_(
                                OrganizationRegulation.organization_id == ws.organization_id,
                                OrganizationRegulation.enabled == True,
                            )
                        )
                    ),
                )
            )
        ).scalars().all()

        db_reg_by_act: Dict[str, Regulation] = {}
        for r in db_regs:
            key = (r.act_name or r.title or "").strip().lower()
            if key:
                db_reg_by_act[key] = r

        def add_statutory_finding(
            act_name: str,
            trigger_answers: List[str],
            relevance_explanation: str,
            evidence_status: str,
            threshold_override: Optional[str] = None,
        ):
            meta = STATUTORY_INSTRUMENTS_METADATA.get(act_name, {})
            if not meta:
                return

            # Check if an official uploaded document exists in the database
            db_match = None
            for key, reg in db_reg_by_act.items():
                if act_name.lower() in key:
                    db_match = reg
                    break

            is_uploaded = db_match is not None
            source_origin = "uploaded_document" if is_uploaded else "canonical_registry_reference"
            source_doc_id = str(db_match.id) if is_uploaded else None
            source_ref = getattr(db_match, "original_filename", None) if is_uploaded else meta.get("official_citation")

            # Verified source requirement is ONLY claimed if document is actually uploaded in database
            final_evidence_status = evidence_status
            if final_evidence_status == "verified_source_requirement" and not is_uploaded:
                final_evidence_status = "potentially_applicable"

            discovery = {
                "regulation_id": source_doc_id or f"canonical-{re.sub(r'[^a-zA-Z0-9]', '', act_name.lower())}",
                "title": db_match.title if is_uploaded else meta["title"],
                "act_name": act_name,
                "legal_instrument_type": meta["legal_instrument_type"],
                "jurisdiction": db_match.jurisdiction if (is_uploaded and db_match.jurisdiction) else meta["jurisdiction"],
                "issuing_authority": getattr(db_match, "issuing_authority", None) or meta["issuing_authority"],
                "act_year": getattr(db_match, "act_year", None) or meta["act_year"],
                "effective_date": meta["enactment_date"],
                "commencement_status": meta["commencement_status"],
                "applicability_thresholds": threshold_override or meta["applicability_thresholds"],
                "version": getattr(db_match, "version", None) or f"{meta['act_year']} Edition",
                "source_domain": meta["source_domain"],
                "source_reference": source_ref,
                "source_origin": source_origin,
                "is_official_file_uploaded": is_uploaded,
                "source_document_id": source_doc_id,
                "relevant_provisions": meta["verified_provisions"],
                "trigger_answers": trigger_answers,
                "relevance_explanation": relevance_explanation,
                "evidence_status": final_evidence_status,
                "retrieved_at": retrieved_at,
            }
            discoveries.append(discovery)

        # 1. DPDP Act, 2023 (Personal Data in India)
        if is_india and (has_personal_data or has_sensitive_data):
            triggers = [
                f"Primary Operating Jurisdiction: {jurisdiction.get('primary_country') or 'India'}",
                "Processes Personal Data: True" if has_personal_data else "Processes Sensitive Data: True",
            ]
            add_statutory_finding(
                act_name="DPDP Act",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Enacted statutory privacy framework for digital personal data processed in India. "
                    "Note: Central Government operational rules and appointed enforcement dates under Section 1(2) are pending notification; "
                    "preparatory compliance for consent, purpose limitation, and breach procedures is recommended."
                ),
                evidence_status="potentially_applicable",
            )

        # 2. GDPR (EU Processing or EU Markets)
        if is_eu or any("gdpr" in c for c in certifications):
            triggers = []
            if is_eu:
                triggers.append(f"EU Locations/Markets: {', '.join(other_countries) or jurisdiction.get('markets_served') or 'EU'}")
            if has_personal_data:
                triggers.append("Processes Personal Data: True")
            if any("gdpr" in c for c in certifications):
                triggers.append("Declared Framework: GDPR")

            add_statutory_finding(
                act_name="GDPR",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Directly applies to EU operations or extraterritorially when processing personal data of EU data subjects "
                    "or offering goods/services into EU member states under Article 3."
                ),
                evidence_status="verified_source_requirement" if (is_eu and has_personal_data) else "potentially_applicable",
            )

        # 3. Information Technology Act, 2000
        if is_india and (has_cloud or has_personal_data or has_ai):
            triggers = [
                f"Operating Jurisdiction: {jurisdiction.get('primary_country') or 'India'}",
                "Uses Cloud/SaaS: True" if has_cloud else "Handles Digital Information",
            ]
            add_statutory_finding(
                act_name="Information Technology Act",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Section 43A and SPDI Rules 2011 mandate implementation of reasonable security practices and procedures "
                    "for body corporates handling sensitive personal data or electronic customer records in India."
                ),
                evidence_status="verified_source_requirement" if db_reg_by_act.get("information technology act") else "potentially_applicable",
            )

        # 4. POSH Act, 2013 (Workplace Prevention of Sexual Harassment)
        if is_india and has_employees:
            is_under_10 = employee_count in ["1-10"] and not any(t in ["Contractors", "Freelancers", "Interns"] for t in employment_types)
            threshold_note = (
                "Workplaces with fewer than 10 workers are exempt from constituting an Internal Complaints Committee (ICC); "
                "complaints are handled by the District Local Complaints Committee (LCC) under Section 6. Employer remains obligated to formulate policy and display penal consequences."
                if is_under_10
                else "Workplace employs 10 or more workers: mandatory constitution of an Internal Complaints Committee (ICC) applies under Section 4."
            )
            triggers = [
                f"Operating Jurisdiction: {jurisdiction.get('primary_country') or 'India'}",
                f"Employee Count: {employee_count}",
                f"Workforce Types: {', '.join(employment_types) if employment_types else 'Direct full-time'}",
            ]
            add_statutory_finding(
                act_name="POSH Act",
                trigger_answers=triggers,
                relevance_explanation=(
                    f"Fulfills mandatory statutory employer obligations under POSH Act 2013. {threshold_note}"
                ),
                evidence_status="potentially_applicable",
                threshold_override=threshold_note,
            )

        # 5. Companies Act, 2013 (Corporate Governance & Vigil Mechanism)
        org_type = profile.get("org_type", "Startup")
        if is_india and (org_type in ["Established company", "Public-sector organization"] or scope.get("scope_type") in ["BRANCH", "DEPARTMENT"]):
            triggers = [
                f"Organization Type: {org_type}",
                f"Scope Type: {scope.get('scope_type', 'ORGANIZATION')}",
            ]
            add_statutory_finding(
                act_name="Companies Act",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Prescribes board duties and internal financial controls for incorporated companies. "
                    "Section 177 vigil mechanism applies to listed entities, deposit-taking entities, or entities with borrowings exceeding Rs 50 Crore; "
                    "entity incorporation status requires verification."
                ),
                evidence_status="requires_verification",
            )

        # 6. Factories Act, 1948 (Occupational Health & Physical Safety)
        if is_india and has_facilities:
            if is_manufacturing:
                triggers = [
                    "Operating Physical Facilities: True",
                    f"Manufacturing Activity Declared in Profile: {profile.get('industry')}",
                ]
                add_statutory_finding(
                    act_name="Factories Act",
                    trigger_answers=triggers,
                    relevance_explanation=(
                        "Applies to manufacturing premises employing 10+ workers (with power) or 20+ workers (without power) under Section 2(m)."
                    ),
                    evidence_status="potentially_applicable",
                )
            else:
                # Software / Commercial Office establishment — NOT a factory
                triggers = [
                    "Operating Commercial/Office Premises: True",
                    f"Industry: {profile.get('industry') or 'Commercial Services'}",
                ]
                add_statutory_finding(
                    act_name="Factories Act",
                    trigger_answers=triggers,
                    relevance_explanation=(
                        "Factories Act applies exclusively to manufacturing premises (Section 2(m)). "
                        "Standard commercial software offices are governed by State Shops and Commercial Establishments Acts, NOT the Factories Act. "
                        "Flagged for threshold verification to avoid misclassification."
                    ),
                    evidence_status="requires_verification",
                    threshold_override="Applies only to manufacturing processes with 10/20 workers. Commercial IT offices are subject to State Shops and Establishments Acts.",
                )

        # 7. ISO/IEC 27001:2022 (International Security Benchmark)
        if any("iso" in c or "27001" in c for c in certifications) or (has_cloud and has_personal_data):
            triggers = []
            if any("iso" in c or "27001" in c for c in certifications):
                triggers.append("Declared Framework: ISO/IEC 27001")
            if has_cloud:
                triggers.append("Uses Cloud Infrastructure: True")
            if has_personal_data:
                triggers.append("Handles Personal Data: True")

            add_statutory_finding(
                act_name="ISO/IEC 27001",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Global benchmark standard for Information Security Management Systems (ISMS). "
                    "Voluntary standard recommended for cloud-first SaaS organizations to satisfy enterprise vendor reviews and contractual covenants."
                ),
                evidence_status="potentially_applicable",
            )

        # 8. Code on Wages, 2019
        if is_india and has_employees and employee_count in ["11-50", "51-200", "201-500", "500+"]:
            triggers = [
                f"Workforce Count: {employee_count}",
                f"Operating Jurisdiction: {jurisdiction.get('primary_country') or 'India'}",
            ]
            add_statutory_finding(
                act_name="Code on Wages",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Consolidates wage and bonus standards. Subordinate state rules and appointed national enforcement dates are pending notification; "
                    "statutory wage compliance currently continues under legacy Minimum Wages and Payment of Wages legislation."
                ),
                evidence_status="requires_verification",
            )

        # 9. FEMA, 1999 (Cross-Border Payments)
        if is_india and has_payments and (is_eu or is_us or len(other_countries) > 0):
            triggers = [
                "Handles Payments: True",
                f"Cross-Border Markets/Locations: {', '.join(other_countries) or jurisdiction.get('markets_served')}",
            ]
            add_statutory_finding(
                act_name="FEMA",
                trigger_answers=triggers,
                relevance_explanation=(
                    "Governs cross-border remittances and realization of export earnings for software and consulting services under RBI directions."
                ),
                evidence_status="requires_verification",
            )

        # Deduplicate discoveries by act_name
        unique_discoveries: List[Dict[str, Any]] = []
        seen_acts = set()
        for d in discoveries:
            act = d.get("act_name")
            if act not in seen_acts:
                seen_acts.add(act)
                unique_discoveries.append(d)

        return unique_discoveries

    @classmethod
    def _generate_policy_needs(
        cls,
        profile: Dict[str, Any],
        jurisdiction: Dict[str, Any],
        activities: Dict[str, Any],
        scope: Dict[str, Any],
        existing_policies: Dict[str, Any],
        discoveries: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Generate high-level, concrete organizational policy needs mapped from
        supported statutory findings and operational risk triggers.
        """
        needs: List[Dict[str, Any]] = []

        has_personal_data = bool(activities.get("personal_data"))
        has_sensitive_data = bool(activities.get("sensitive_data"))
        has_cloud = bool(activities.get("cloud_services"))
        has_ai = bool(activities.get("ai_systems"))
        has_payments = bool(activities.get("payments"))
        has_vendors = bool(activities.get("vendors"))
        has_facilities = bool(activities.get("physical_facilities"))
        has_licenses = bool(activities.get("licensed_activities"))
        employment_types = activities.get("employment_types") or []
        employee_count = profile.get("employee_count", "1-10")
        has_employees = len(employment_types) > 0 or employee_count != "0"
        scope_type = scope.get("scope_type", "ORGANIZATION")

        discovered_acts = {d.get("act_name"): d for d in discoveries}

        # 1. Information Security Policy
        info_sec_regs = [act for act in ["ISO/IEC 27001", "Information Technology Act"] if act in discovered_acts]
        needs.append({
            "need_id": "need-info-sec",
            "title": "Information Security Policy",
            "category": "Information Security",
            "business_rationale": "Establishes mandatory baseline commitments for protecting organizational information assets, source code, confidential databases, and cloud infrastructure against unauthorized access, leaks, and cyber vulnerabilities.",
            "linked_regulations": info_sec_regs if info_sec_regs else ["ISO/IEC 27001 (Recommended Benchmark)"],
            "linked_risks": [
                "Cloud infrastructure exposure and unauthorized data access",
                "Lack of standardized access management and credential protection",
            ],
            "driver": "regulatory-driven" if info_sec_regs else "risk-driven",
            "suggested_priority": "Urgent" if (has_cloud and (has_personal_data or has_sensitive_data)) else "High",
            "priority_rationale": "Critical core governance foundation protecting digital systems and supporting enterprise customer diligence.",
            "recommended_owner_role": "Head of Information Security / CTO",
            "suggested_review_frequency": "Annual",
            "evidence_confidence": "High",
            "requires_human_confirmation": False,
        })

        # 2. Data Protection & Privacy Policy
        if has_personal_data or has_sensitive_data or "DPDP Act" in discovered_acts or "GDPR" in discovered_acts:
            privacy_regs = [act for act in ["DPDP Act", "GDPR", "Information Technology Act"] if act in discovered_acts]
            needs.append({
                "need_id": "need-data-privacy",
                "title": "Data Protection & Privacy Policy",
                "category": "Data Privacy",
                "business_rationale": "Governs the lawful collection, processing, user consent management, data minimization, retention, and subject rights fulfillment for all personal and sensitive customer data.",
                "linked_regulations": privacy_regs if privacy_regs else ["DPDP Act, 2023"],
                "linked_risks": [
                    "Non-compliance with statutory consent and data principal notice requirements",
                    "Potential regulatory penalties for mishandling sensitive customer records",
                ],
                "driver": "regulatory-driven",
                "suggested_priority": "Urgent",
                "priority_rationale": "Mandatory statutory obligation triggered by personal/sensitive data processing activities.",
                "recommended_owner_role": "Data Protection Officer / Legal Counsel",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "High",
                "requires_human_confirmation": False,
            })

        # 3. Employee Code of Conduct & Workplace Ethics Policy
        if has_employees:
            conduct_regs = [act for act in ["POSH Act", "Code on Wages"] if act in discovered_acts]
            needs.append({
                "need_id": "need-code-of-conduct",
                "title": "Employee Code of Conduct & Workplace Ethics Policy",
                "category": "Human Resources & Governance",
                "business_rationale": "Defines behavioral standards, workplace ethics, conflict of interest disclosures, anti-harassment / POSH prevention protocols, and fair treatment expectations for all workforce members.",
                "linked_regulations": conduct_regs if conduct_regs else ["POSH Act, 2013"],
                "linked_risks": [
                    "Workplace harassment disputes and failure to maintain required statutory committees",
                    "Ambiguity in employee behavioral standards and conflict of interest handling",
                ],
                "driver": "regulatory-driven" if "POSH Act" in discovered_acts else "internal-governance",
                "suggested_priority": "High",
                "priority_rationale": "Protects organizational culture and fulfills employer statutory duty of care across workforce members.",
                "recommended_owner_role": "HR Director / People Operations Lead",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "High",
                "requires_human_confirmation": False,
            })

        # 4. Third-Party & Vendor Risk Management Policy
        if has_vendors or has_cloud:
            needs.append({
                "need_id": "need-vendor-risk",
                "title": "Third-Party & Vendor Risk Management Policy",
                "category": "Third-Party Risk",
                "business_rationale": "Establishes a standardized framework for evaluating, onboarding, contracting with, and auditing external SaaS vendors, contractors, and service providers with access to organizational systems or data.",
                "linked_regulations": [act for act in ["ISO/IEC 27001", "DPDP Act"] if act in discovered_acts] or ["ISO/IEC 27001:2022 (A.5.19 - Supplier Relationships)"],
                "linked_risks": [
                    "Supply-chain data exposure through inadequately vetted external vendors",
                    "Lack of contractual confidentiality and SLA accountability with sub-processors",
                ],
                "driver": "risk-driven",
                "suggested_priority": "High" if (has_vendors and has_personal_data) else "Medium",
                "priority_rationale": "Mitigates indirect data leak vulnerabilities originating through supplier and third-party SaaS ecosystems.",
                "recommended_owner_role": "Procurement Lead / Operations Director",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "Medium",
                "requires_human_confirmation": False,
            })

        # 5. Incident Response & Breach Notification Policy
        needs.append({
            "need_id": "need-incident-response",
            "title": "Incident Response & Breach Notification Policy",
            "category": "Operational Resilience",
            "business_rationale": "Specifies internal severity classification, escalation paths, technical containment steps, and external reporting timelines for security incidents and personal data breaches.",
            "linked_regulations": [act for act in ["DPDP Act", "Information Technology Act", "GDPR"] if act in discovered_acts] or ["CERT-In Cybersecurity Directions / IT Act"],
            "linked_risks": [
                "Delayed detection or containment of data breaches leading to expanded damages",
                "Failure to meet statutory notification deadlines to supervisory authorities and affected individuals",
            ],
            "driver": "regulatory-driven" if ("DPDP Act" in discovered_acts or "Information Technology Act" in discovered_acts) else "risk-driven",
            "suggested_priority": "High",
            "priority_rationale": "Crucial operational safeguard for regulatory compliance under cybersecurity and privacy mandates.",
            "recommended_owner_role": "Incident Response Lead / CISO",
            "suggested_review_frequency": "Semi-Annual",
            "evidence_confidence": "High",
            "requires_human_confirmation": False,
        })

        # 6. AI Governance & Acceptable Use Policy
        if has_ai:
            needs.append({
                "need_id": "need-ai-governance",
                "title": "AI Governance & Acceptable Use Policy",
                "category": "Emerging Technologies",
                "business_rationale": "Sets ethical guidelines, proprietary source code leakage prohibitions, customer confidentiality safeguards, and transparency rules for deploying and utilizing artificial intelligence models.",
                "linked_regulations": ["ISO/IEC 42001 (Artificial Intelligence Management)", "EU AI Act (Extraterritorial Context)"],
                "linked_risks": [
                    "Unintentional disclosure of proprietary IP or confidential customer data into public generative AI models",
                    "Algorithmic bias, hallucinations, or lack of human oversight in automated decisions",
                ],
                "driver": "risk-driven",
                "suggested_priority": "High",
                "priority_rationale": "Directly triggered by active usage of AI systems within business operations.",
                "recommended_owner_role": "Chief Technology Officer / AI Lead",
                "suggested_review_frequency": "Semi-Annual",
                "evidence_confidence": "Medium",
                "requires_human_confirmation": True,
            })

        # 7. Financial Controls & Payment Handling Policy
        if has_payments or has_licenses:
            fin_regs = [act for act in ["Companies Act", "FEMA"] if act in discovered_acts]
            needs.append({
                "need_id": "need-financial-controls",
                "title": "Financial Controls & Payment Handling Policy",
                "category": "Financial Governance",
                "business_rationale": "Governs payment processing authorization, fraud prevention controls, transaction reconciliation, refund protocols, and separation of financial duties.",
                "linked_regulations": fin_regs if fin_regs else ["RBI Master Directions / Companies Act"],
                "linked_risks": [
                    "Unauthorized transactions, internal payment fraud, or reconciliation discrepancies",
                    "Non-compliance with payment gateway regulations and AML/KYC mandates",
                ],
                "driver": "regulatory-driven" if fin_regs else "risk-driven",
                "suggested_priority": "High",
                "priority_rationale": "Direct financial and statutory exposure associated with processing customer payments.",
                "recommended_owner_role": "Finance Director / CFO",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "High",
                "requires_human_confirmation": False,
            })

        # 8. Physical Security & Workplace Safety Policy
        if has_facilities:
            needs.append({
                "need_id": "need-workplace-safety",
                "title": "Physical Security & Workplace Safety Policy",
                "category": "Physical & Occupational Safety",
                "business_rationale": "Maintains physical access security, visitor management, hazard prevention, fire safety readiness, and emergency evacuation protocols across all operating physical premises.",
                "linked_regulations": [act for act in ["Factories Act"] if act in discovered_acts] or ["Occupational Safety, Health and Working Conditions Code"],
                "linked_risks": [
                    "Unauthorized physical facility access or theft of physical equipment",
                    "Workplace safety hazards and non-compliance with local occupational health codes",
                ],
                "driver": "regulatory-driven" if "Factories Act" in discovered_acts else "risk-driven",
                "suggested_priority": "Medium",
                "priority_rationale": "Ensures on-premise safety and physical asset security for operating facilities.",
                "recommended_owner_role": "Facilities & Operations Manager",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "Medium",
                "requires_human_confirmation": False,
            })

        # 9. Corporate Governance & Statutory Compliance Policy
        if "Companies Act" in discovered_acts or scope_type in ["BRANCH", "DEPARTMENT"] or employee_count in ["51-200", "201-500", "500+"]:
            needs.append({
                "need_id": "need-corp-governance",
                "title": "Corporate Governance & Statutory Compliance Policy",
                "category": "Corporate Governance",
                "business_rationale": "Defines board oversight mechanisms, delegation of signing authority, branch reporting structures, whistleblower / vigil mechanisms, and statutory filing cadences.",
                "linked_regulations": ["Companies Act, 2013 (Section 134, 177)"],
                "linked_risks": [
                    "Missed statutory filing deadlines and regulatory compliance reporting lapses",
                    "Lack of clear branch-level delegation and governance accountability",
                ],
                "driver": "regulatory-driven",
                "suggested_priority": "Medium",
                "priority_rationale": "Maintains corporate standing, board compliance, and multi-branch organizational oversight.",
                "recommended_owner_role": "Company Secretary / General Counsel",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "High",
                "requires_human_confirmation": False,
            })

        # 10. Business Continuity & Disaster Recovery Policy
        if has_cloud or activities.get("products_services"):
            needs.append({
                "need_id": "need-business-continuity",
                "title": "Business Continuity & Disaster Recovery Policy",
                "category": "Operational Resilience",
                "business_rationale": "Outlines critical service recovery objectives (RTO/RPO), backup retention schedules, failover procedures, and annual testing exercises to guarantee uninterrupted business operations.",
                "linked_regulations": ["ISO/IEC 22301 (Business Continuity Management)", "ISO/IEC 27001 (A.5.29)"],
                "linked_risks": [
                    "Extended operational downtime resulting from cloud service outages or database corruptions",
                    "Loss of critical customer transaction history due to untested recovery procedures",
                ],
                "driver": "risk-driven",
                "suggested_priority": "Medium",
                "priority_rationale": "Guarantees business resilience and supports enterprise customer SLA commitments.",
                "recommended_owner_role": "Head of Infrastructure / COO",
                "suggested_review_frequency": "Annual",
                "evidence_confidence": "Medium",
                "requires_human_confirmation": False,
            })

        return needs

    @classmethod
    def _evaluate_policy_coverage(
        cls,
        policy_needs: List[Dict[str, Any]],
        existing_policies: Dict[str, Any],
        db: Session,
        ws: WorkspaceContext,
    ) -> List[Dict[str, Any]]:
        """
        Evaluate workspace policy coverage with truthful classification.
        Inspects actual text where available; avoids claiming confirmed 'Covered' status
        without verified content-level evidence.
        """
        findings: List[Dict[str, Any]] = []

        # Retrieve documents strictly belonging to active workspace
        docs = db.execute(
            select(Document)
            .where(
                and_(
                    Document.organization_id == ws.organization_id,
                    Document.document_type == DocumentType.POLICY,
                )
            )
        ).scalars().all()

        selected_ids = set(existing_policies.get("selected_policy_ids") or [])

        # Substantive keywords and concepts for each policy need
        need_keywords: Dict[str, List[str]] = {
            "need-info-sec": ["information security", "security policy", "infosec", "cybersecurity", "access control"],
            "need-data-privacy": ["privacy policy", "data protection", "personal data", "gdpr", "dpdp"],
            "need-code-of-conduct": ["code of conduct", "workplace conduct", "posh", "harassment", "employee handbook", "ethics policy"],
            "need-vendor-risk": ["vendor risk", "supplier policy", "third party risk", "procurement policy"],
            "need-incident-response": ["incident response", "breach notification", "cyber incident", "incident management"],
            "need-ai-governance": ["ai policy", "artificial intelligence", "acceptable use", "generative ai"],
            "need-financial-controls": ["financial control", "fraud policy", "payment policy", "anti-fraud", "treasury policy"],
            "need-workplace-safety": ["workplace safety", "occupational safety", "physical security", "fire safety"],
            "need-corp-governance": ["corporate governance", "whistleblower", "vigil mechanism", "board policy"],
            "need-business-continuity": ["business continuity", "disaster recovery", "bcp", "operational resilience"],
        }

        # Substantive body text concepts to check in document content
        need_substantive_concepts: Dict[str, List[str]] = {
            "need-info-sec": ["access control", "password", "encryption", "incident", "confidentiality"],
            "need-data-privacy": ["consent", "personal data", "retention", "erasure", "data principal", "data subject"],
            "need-code-of-conduct": ["sexual harassment", "misconduct", "disciplinary", "conflict of interest"],
            "need-vendor-risk": ["due diligence", "sub-processor", "confidentiality agreement", "sla"],
            "need-incident-response": ["escalation", "containment", "breach notification", "reporting timeline"],
            "need-ai-governance": ["model transparency", "prompt injection", "confidential customer data", "hallucination"],
            "need-financial-controls": ["segregation of duties", "reconciliation", "unauthorized transactions", "refund"],
            "need-workplace-safety": ["emergency evacuation", "fire extinguisher", "hazard prevention", "first aid"],
            "need-corp-governance": ["vigil mechanism", "whistleblower", "audit committee", "directors report"],
            "need-business-continuity": ["recovery time objective", "rto", "rpo", "backup redundancy", "failover"],
        }

        limitations_disclaimer = (
            "Assessment Limitation: 'Not found' indicates no policy document matching this topic was identified "
            "in your workspace repository, not definitive proof that internal controls do not exist. "
            "Similarly, 'Requires review' or 'Partially covered' indicates repository document alignment and does not constitute formal legal compliance certification."
        )

        for need in policy_needs:
            need_id = need["need_id"]
            keywords = need_keywords.get(need_id, [])
            substantive_concepts = need_substantive_concepts.get(need_id, [])

            matched_doc: Optional[Document] = None
            is_selected = False

            # Search strictly in active workspace documents
            for d in docs:
                title = (getattr(d, "title", None) or getattr(d, "original_filename", None) or "").lower()
                clean_title = title.replace("-", " ").replace("_", " ")

                # Match if keywords match document title
                if any(kw in clean_title for kw in keywords):
                    if str(d.id) in selected_ids:
                        matched_doc = d
                        is_selected = True
                        break
                    elif not matched_doc:
                        matched_doc = d

            if matched_doc:
                doc_title = getattr(matched_doc, "title", None) or getattr(matched_doc, "original_filename", None) or "Untitled Policy"
                file_path = getattr(matched_doc, "file_path", None)
                matched_sections = []
                evidence_excerpt = None

                # Attempt to inspect content from disk if file is accessible
                body_text = ""
                if file_path and os.path.exists(file_path):
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            body_text = f.read(50000).lower()
                    except Exception as read_err:
                        logger.debug("Could not read text for document %s: %s", matched_doc.id, read_err)

                # Search body text for substantive concepts
                matched_concepts = [c for c in substantive_concepts if c in body_text] if body_text else []

                if matched_concepts:
                    matched_sections = [f"Identified clauses addressing: {', '.join(matched_concepts[:3])}"]
                    # Extract sample sentence
                    for c in matched_concepts[:1]:
                        idx = body_text.find(c)
                        if idx != -1:
                            start = max(0, idx - 40)
                            end = min(len(body_text), idx + 80)
                            snippet = body_text[start:end].replace("\n", " ").strip()
                            evidence_excerpt = f"...{snippet}..."
                            break

                # Coverage classification
                if matched_concepts and len(matched_concepts) >= 2:
                    status = "Partially covered"
                    reason = (
                        f"Document '{doc_title}' was matched in your workspace repository with substantive text addressing "
                        f"{', '.join(matched_concepts[:3])}. Detailed legal audit is recommended to confirm complete regulatory coverage."
                    )
                else:
                    status = "Requires review"
                    reason = (
                        f"Document '{doc_title}' matches title keywords, but detailed content comparison has not confirmed "
                        f"complete substantive coverage. Available evidence is insufficient for confirmed compliance; review required."
                    )

                findings.append({
                    "need_id": need_id,
                    "policy_title": doc_title,
                    "linked_document_id": str(matched_doc.id),
                    "coverage_status": status,
                    "matched_sections": matched_sections if matched_sections else [f"Title matches '{doc_title}'"],
                    "evidence_excerpt": evidence_excerpt or f"Workspace document '{doc_title}' detected in repository.",
                    "reason": reason,
                    "limitations_note": limitations_disclaimer,
                })
            else:
                findings.append({
                    "need_id": need_id,
                    "policy_title": "None",
                    "linked_document_id": None,
                    "coverage_status": "Not found",
                    "matched_sections": [],
                    "evidence_excerpt": None,
                    "reason": f"No workspace policy document covering {need['title']} was identified in the active workspace repository.",
                    "limitations_note": limitations_disclaimer,
                })

        return findings

    @classmethod
    def _merge_user_decisions(
        cls,
        policy_needs: List[Dict[str, Any]],
        existing_decisions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Preserve existing user review decisions across analysis reruns.
        Avoids assigning stale decisions to removed or materially changed needs.
        """
        merged: Dict[str, Any] = {}
        active_need_ids = {need["need_id"] for need in policy_needs}

        for need in policy_needs:
            need_id = need["need_id"]
            if need_id in existing_decisions:
                # Retain existing human decisions safely
                prev = existing_decisions[need_id]
                merged[need_id] = {
                    "decision": prev.get("decision", "ACCEPTED"),
                    "priority_override": prev.get("priority_override"),
                    "notes": prev.get("notes") or "",
                    "updated_at": prev.get("updated_at"),
                }
            else:
                # Initial default based on confidence
                default_decision = (
                    "REQUIRES_VERIFICATION"
                    if need.get("requires_human_confirmation") or need.get("evidence_confidence") == "Requires Verification"
                    else "ACCEPTED"
                )
                merged[need_id] = {
                    "decision": default_decision,
                    "priority_override": None,
                    "notes": "",
                    "updated_at": None,
                }

        return merged

    @classmethod
    def _compute_summary(
        cls,
        assessment: OrganizationAssessment,
        discoveries: List[Dict[str, Any]],
        policy_needs: List[Dict[str, Any]],
        coverage_findings: List[Dict[str, Any]],
        user_decisions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Compute aggregate summary counts and breakdown metrics."""
        coverage_counts = {"Covered": 0, "Partially covered": 0, "Not found": 0, "Requires review": 0, "Not assessed": 0}
        for c in coverage_findings:
            st = c.get("coverage_status", "Not found")
            coverage_counts[st] = coverage_counts.get(st, 0) + 1

        decision_counts = {"ACCEPTED": 0, "DEFERRED": 0, "REJECTED": 0, "REQUIRES_VERIFICATION": 0}
        for d in user_decisions.values():
            dec = d.get("decision", "ACCEPTED")
            decision_counts[dec] = decision_counts.get(dec, 0) + 1

        priority_counts = {"Urgent": 0, "High": 0, "Medium": 0, "Low": 0}
        for n in policy_needs:
            need_id = n["need_id"]
            override = user_decisions.get(need_id, {}).get("priority_override")
            pri = override or n.get("suggested_priority", "Medium")
            priority_counts[pri] = priority_counts.get(pri, 0) + 1

        return {
            "assessment_id": str(assessment.id),
            "assessment_title": assessment.title,
            "scope_type": assessment.scope_type,
            "total_regulatory_discoveries": len(discoveries),
            "total_policy_needs": len(policy_needs),
            "coverage_breakdown": coverage_counts,
            "decision_breakdown": decision_counts,
            "priority_breakdown": priority_counts,
            "requires_human_review_count": decision_counts["REQUIRES_VERIFICATION"],
            "high_or_urgent_count": priority_counts["Urgent"] + priority_counts["High"],
        }

    # =========================================================================
    # STAGE 4: AI POLICY DRAFTING & DRAFT EDITOR SERVICE LOGIC
    # =========================================================================

    @classmethod
    def create_or_get_draft(
        cls,
        assessment_id: uuid.UUID,
        analysis_id: uuid.UUID,
        need_id: str,
        force_preliminary: bool,
        user_id: Optional[uuid.UUID],
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """
        Create a new grounded policy draft from an accepted policy need,
        or retrieve an existing draft for this workspace and need.
        Strictly enforces tenant isolation and verification rules.
        """
        # 1. Verify Assessment access and ownership
        assessment = db.query(OrganizationAssessment).filter(
            OrganizationAssessment.id == assessment_id,
            OrganizationAssessment.organization_id == ws.organization_id,
        ).first()
        if not assessment:
            raise ValueError(f"Assessment {assessment_id} not found in workspace {ws.organization_id}")

        if assessment.status != "COMPLETED":
            raise ValueError(f"Assessment must be COMPLETED before drafting. Current status: {assessment.status}")

        # 2. Verify Policy Needs Analysis access and ownership
        analysis = db.query(PolicyNeedsAnalysis).filter(
            PolicyNeedsAnalysis.id == analysis_id,
            PolicyNeedsAnalysis.organization_id == ws.organization_id,
            PolicyNeedsAnalysis.assessment_id == assessment.id,
        ).first()
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found for assessment {assessment_id} in workspace {ws.organization_id}")

        # 3. Check for existing draft in this workspace for the same need
        existing_draft = db.query(PolicyDraft).filter(
            PolicyDraft.organization_id == ws.organization_id,
            PolicyDraft.analysis_id == analysis.id,
            PolicyDraft.need_id == need_id,
        ).first()
        if existing_draft:
            logger.info("Resuming existing policy draft %s for need %s", existing_draft.id, need_id)
            return existing_draft

        # 4. Locate the specific Policy Need in the analysis
        needs = analysis.policy_needs or []
        target_need = next((n for n in needs if n.get("need_id") == need_id), None)
        if not target_need:
            raise ValueError(f"Policy need '{need_id}' not found in Policy Needs Analysis {analysis.id}")

        # 5. Check Human Review Decision Status
        decisions = analysis.user_decisions or {}
        decision_info = decisions.get(need_id, {})
        decision_status = decision_info.get("decision", "ACCEPTED")

        if decision_status in ("REJECTED", "DEFERRED"):
            raise ValueError(
                f"Policy need '{target_need.get('title')}' is marked as {decision_status}. "
                "Only Accepted or Verified policy needs can proceed to drafting."
            )

        is_preliminary = False
        unresolved_notes: List[str] = []
        if decision_status == "REQUIRES_VERIFICATION":
            if not force_preliminary:
                raise ValueError(
                    f"Policy need '{target_need.get('title')}' requires verification. "
                    "Unresolved applicability questions or statutory thresholds must be reviewed. "
                    "To generate a preliminary draft that preserves warnings and assumptions, specify force_preliminary=True."
                )
            is_preliminary = True
            unresolved_notes.append(
                "PRELIMINARY DRAFT: This policy need has unresolved verification requirements. "
                "Statutory thresholds and operational scope must be validated by legal counsel prior to formal adoption."
            )

        # Include specific assumptions and questions from the policy need
        if target_need.get("assumptions_and_questions"):
            for q in target_need["assumptions_and_questions"]:
                if q not in unresolved_notes:
                    unresolved_notes.append(q)

        # Include human reviewer notes if provided
        if decision_info.get("notes"):
            unresolved_notes.append(f"Reviewer Caveat: {decision_info['notes']}")

        # 6. Gather Evidence Context
        linked_regs = target_need.get("linked_regulations", [])
        discoveries = analysis.regulatory_discoveries or []
        relevant_discoveries = [
            d for d in discoveries
            if (
                d.get("instrument_name") in linked_regs
                or d.get("act_name") in linked_regs
                or d.get("title") in linked_regs
                or d.get("canon_id") in linked_regs
                or any(r in d.get("instrument_name", "") or r in d.get("act_name", "") for r in linked_regs)
            )
        ]

        # Extract commencement warnings from linked discoveries
        for d in relevant_discoveries:
            d_name = d.get("instrument_name") or d.get("act_name") or "Regulatory Standard"
            comm = d.get("commencement_status")
            if comm and any(w in comm.lower() for w in ("pending", "phased", "subordinate")):
                unresolved_notes.append(f"Statutory Notice ({d_name}): {comm}")
            thresh = d.get("applicability_thresholds")
            if thresh:
                unresolved_notes.append(f"Applicability Threshold ({d_name}): {thresh}")

        coverage_findings = analysis.coverage_findings or []
        matching_coverage = next((c for c in coverage_findings if c.get("need_id") == need_id), None)

        # 7. Generate Grounded Sections and Metadata
        sections, metadata_props, source_refs, gen_telemetry = cls._generate_grounded_draft_content(
            assessment=assessment,
            analysis=analysis,
            need=target_need,
            linked_discoveries=relevant_discoveries,
            matching_coverage=matching_coverage,
            decision_info=decision_info,
            is_preliminary=is_preliminary,
        )

        initial_status = "NEEDS_VERIFICATION" if is_preliminary else "DRAFT_SAVED"

        # 8. Persist new PolicyDraft record
        draft = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=ws.organization_id,
            assessment_id=assessment.id,
            analysis_id=analysis.id,
            analysis_version=analysis.version,
            need_id=need_id,
            created_by=user_id,
            title=target_need.get("title", "Organizational Policy Draft"),
            status=initial_status,
            version=1,
            metadata_properties=metadata_props,
            sections=sections,
            source_references=source_refs,
            unresolved_questions=unresolved_notes,
            generation_metadata=gen_telemetry,
            history=[],
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)

        logger.info(
            "Created PolicyDraft %s for need %s (status=%s, version=1) in workspace %s",
            draft.id,
            need_id,
            draft.status,
            ws.organization_id,
        )
        return draft

    @classmethod
    def create_direct_draft(
        cls,
        title: str,
        category: str,
        purpose: str,
        scope_type: str,
        branch_name: Optional[str],
        department_name: Optional[str],
        primary_jurisdiction: Optional[str],
        owner_role: Optional[str],
        review_cadence: Optional[str],
        specific_context: Optional[str],
        linked_regulations: Optional[List[str]],
        user_id: Optional[uuid.UUID],
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """
        Create an individual grounded policy draft directly without requiring
        a full Organization Assessment or Policy Needs Analysis.
        Strictly tenant-isolated, validates scope, gathers verified statutory grounding,
        enriches with AI reasoning (or transparent fallback), and persists a PolicyDraft.
        """
        clean_title = (title or "").strip()
        if len(clean_title) < 3:
            raise ValueError("Policy title must be at least 3 characters.")
        if len(clean_title) > 255:
            raise ValueError("Policy title cannot exceed 255 characters.")

        clean_purpose = (purpose or "").strip()
        if len(clean_purpose) < 5:
            raise ValueError("Policy purpose must be at least 5 characters.")

        norm_scope = (scope_type or "ORGANIZATION").upper()
        if norm_scope not in ("ORGANIZATION", "BRANCH", "DEPARTMENT"):
            raise ValueError(f"Invalid scope type '{scope_type}'. Must be ORGANIZATION, BRANCH, or DEPARTMENT.")

        clean_branch = (branch_name or "").strip() if norm_scope == "BRANCH" else None
        if norm_scope == "BRANCH" and not clean_branch:
            raise ValueError("Branch or regional office name is required when policy scope is set to Branch.")

        clean_dept = (department_name or "").strip() if norm_scope == "DEPARTMENT" else None
        if norm_scope == "DEPARTMENT" and not clean_dept:
            raise ValueError("Department name is required when policy scope is set to Specific Department.")

        # Idempotency / Duplicate Prevention: Resume active draft with exact same title in workspace
        existing_draft = db.query(PolicyDraft).filter(
            PolicyDraft.organization_id == ws.organization_id,
            PolicyDraft.title == clean_title,
            PolicyDraft.status.in_(["DRAFTING", "DRAFT_SAVED", "NEEDS_VERIFICATION"]),
        ).first()
        if existing_draft:
            logger.info(
                "Resuming existing direct policy draft %s for title '%s' in workspace %s",
                existing_draft.id,
                clean_title,
                ws.organization_id,
            )
            return existing_draft

        # Retrieve organization name from workspace
        org = db.query(Organization).filter(Organization.id == ws.organization_id).first()
        org_name = org.name if org else "The Organization"

        # Format scope representation
        if norm_scope == "BRANCH":
            scope_display = f"BRANCH: {clean_branch} ({org_name})"
        elif norm_scope == "DEPARTMENT":
            scope_display = f"DEPARTMENT: {clean_dept} ({org_name})"
        else:
            scope_display = f"ORGANIZATION-WIDE ({org_name})"

        jurisdiction = (primary_jurisdiction or "India").strip()
        role = (owner_role or "Compliance Officer").strip()
        cadence = (review_cadence or "Annual").strip()
        cat_lower = (category or "Governance").lower()

        # Generate policy code and identifier
        title_slug = re.sub(r"[^A-Z0-9]+", "-", clean_title.upper()).strip("-")[:16]
        policy_code = f"POL-DIR-{title_slug}"
        direct_need_id = f"direct-{re.sub(r'[^a-z0-9]+', '-', cat_lower)[:15]}-{uuid.uuid4().hex[:8]}"

        # Gather Verified Statutory Grounding References
        target_acts = list(linked_regulations or [])
        if not target_acts:
            if any(k in cat_lower for k in ("data", "privacy", "gdpr", "dpdp")):
                target_acts.extend(["DPDP Act", "Information Technology Act", "GDPR"])
            elif any(k in cat_lower for k in ("security", "cyber", "infosec", "access", "incident")):
                target_acts.extend(["Information Technology Act"])
            elif any(k in cat_lower for k in ("hr", "posh", "workplace", "harassment", "ethics")):
                target_acts.extend(["POSH Act", "Companies Act"])
            elif any(k in cat_lower for k in ("vendor", "supplier", "third-party", "outsourcing")):
                target_acts.extend(["Companies Act", "Information Technology Act"])
            elif any(k in cat_lower for k in ("governance", "whistleblower", "director")):
                target_acts.extend(["Companies Act"])

        source_refs: List[Dict[str, Any]] = []
        unresolved_notes: List[str] = []

        for act_key, meta in STATUTORY_INSTRUMENTS_METADATA.items():
            if act_key in target_acts or any(act_key.lower() in t.lower() for t in target_acts):
                source_refs.append({
                    "act_name": meta.get("act_name", act_key),
                    "instrument_name": meta.get("title", act_key),
                    "instrument_type": meta.get("legal_instrument_type", "Statutory Act"),
                    "jurisdiction": meta.get("jurisdiction", jurisdiction),
                    "official_citation": meta.get("official_citation", ""),
                    "provisions": meta.get("verified_provisions", []),
                    "source_origin": "canonical_registry_reference",
                })
                comm = meta.get("commencement_status")
                if comm and any(w in comm.lower() for w in ("pending", "phased", "subordinate")):
                    unresolved_notes.append(f"Statutory Notice ({meta.get('act_name')}): {comm}")
                thresh = meta.get("applicability_thresholds")
                if thresh:
                    unresolved_notes.append(f"Applicability Threshold ({meta.get('act_name')}): {thresh}")

        metadata_props = {
            "policy_identifier": policy_code,
            "origin_type": "DIRECT_CREATION",
            "category": category,
            "owner_role": role,
            "target_audience": f"All Personnel, Contractors, and Third Parties operating within {scope_display}",
            "scope": scope_display,
            "scope_type": norm_scope,
            "branch_name": clean_branch,
            "department_name": clean_dept,
            "classification": "Internal Governance Document",
            "review_cadence": cadence,
            "effective_date": None,  # Explicitly unset until Stage 5 approval
            "primary_jurisdiction": jurisdiction,
            "purpose": clean_purpose,
        }

        # Build Standard 12-Section Architecture for Direct Policy
        sections: List[Dict[str, Any]] = [
            {
                "section_id": "sec-metadata",
                "section_number": "1.0",
                "heading": "Document Control & Metadata",
                "content": (
                    f"**Document Title:** {clean_title}\n"
                    f"**Document Identifier:** {policy_code}\n"
                    f"**Designated Owner / Role:** {role}\n"
                    f"**Applicable Scope:** {scope_display}\n"
                    f"**Policy Classification:** Internal Governance Document\n"
                    f"**Drafting Version:** v1.0 (Direct Draft)\n"
                    f"**Effective Date:** [UNSET — Requires Executive Approval Prior to Activation]\n"
                    f"**Scheduled Review Cadence:** {cadence}\n"
                    f"**Target Audience:** All workforce members and relevant external contractors governed by {scope_display}."
                ),
                "rationale": "Establishes authoritative ownership, unique document code, and operational boundaries.",
                "source_clauses": [f"{s['act_name']}: Governance Standards" for s in source_refs[:2]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-purpose",
                "section_number": "2.0",
                "heading": "Purpose & Strategic Objectives",
                "content": (
                    f"{org_name} is committed to maintaining robust governance, statutory compliance, and ethical operations.\n\n"
                    f"**Policy Purpose:** {clean_purpose}\n\n"
                    f"This policy establishes mandatory operational directives to mitigate legal, operational, and financial risks "
                    f"across {scope_display}, adhering to recognized statutory benchmarks in {jurisdiction}."
                ),
                "rationale": "Articulates the core mission, risk rationale, and mandatory compliance intent.",
                "source_clauses": [f"{s['act_name']}: Statutory Objective" for s in source_refs[:1]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-scope",
                "section_number": "3.0",
                "heading": "Scope & Operational Applicability",
                "content": (
                    f"1. **Operational Boundary:** This policy applies strictly to **{scope_display}**.\n"
                    f"2. **Covered Individuals:** All permanent employees, part-time personnel, contract staff, "
                    f"and third-party consultants engaged within this scope must adhere to this document.\n"
                    + (
                        f"3. **Specific Operational Context:** {specific_context.strip()}\n"
                        if specific_context and specific_context.strip()
                        else ""
                    )
                    + f"4. **Exceptions & Exclusions:** Any operations or functional units outside {scope_display} "
                    f"must establish equivalent governance policies approved by the {role}."
                ),
                "rationale": "Defines explicit workforce and jurisdictional applicability boundaries.",
                "source_clauses": ["Applicability Scope Governance"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-definitions",
                "section_number": "4.0",
                "heading": "Definitions & Key Terminology",
                "content": (
                    "For the interpretation of this policy, the following terms apply:\n"
                    f"- **Organization:** {org_name}.\n"
                    f"- **Designated Officer:** The designated {role} with executive oversight.\n"
                    "- **Workforce Member:** Any individual engaged by or operating on behalf of the Organization.\n"
                    "- **Confidential Assets:** Non-public proprietary, technical, client, or financial information.\n"
                    "- **Applicable Legal Standard:** Statutory laws, subordinate rules, and recognized regulatory frameworks in "
                    f"{jurisdiction}."
                ),
                "rationale": "Eliminates ambiguity in key legal and operational definitions.",
                "source_clauses": [f"{s['act_name']}: Statutory Definitions" for s in source_refs[:2]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-core-requirements",
                "section_number": "5.0",
                "heading": "Core Policy Requirements & Mandatory Commitments",
                "content": (
                    f"All individuals and operational processes within {scope_display} must strictly uphold the following mandatory requirements:\n\n"
                    f"1. **Mandatory Compliance with Law:** All actions must conform to statutory obligations in {jurisdiction} and corporate codes of conduct.\n"
                    f"2. **Implementation of Operational Safeguards:** Appropriate administrative, technical, and physical safeguards must be maintained to prevent unauthorized access, loss, or operational compromise.\n"
                    f"3. **Accurate Recordkeeping & Verification:** Operational activities and decisions must be logged and auditable.\n"
                    f"4. **Third-Party & Vendor Due Diligence:** External collaborators must be screened and bound by contractual compliance covenants.\n"
                    f"5. **Prohibition of Non-Compliant Actions:** Willful circumvention of security controls, unauthorized disclosures, or non-compliance is strictly prohibited."
                ),
                "rationale": "Defines binding obligations and operational requirements.",
                "source_clauses": [p for s in source_refs for p in s.get("provisions", [])[:2]][:4],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-roles",
                "section_number": "6.0",
                "heading": "Roles, Responsibilities & Governance Structure",
                "content": (
                    f"Governance responsibilities for {clean_title} are allocated as follows:\n\n"
                    f"1. **Executive Leadership / Board:** Authorizes policy enactment and allocates adequate resources.\n"
                    f"2. **Policy Owner ({role}):** Holds day-to-day governance authority, monitors adherence, and manages the {cadence.lower()} review cycle.\n"
                    f"3. **Department Supervisors / Regional Leads:** Ensure team members complete required briefings, enforce day-to-day adherence, and escalate potential non-compliance.\n"
                    f"4. **Workforce Members:** Review and acknowledge this policy upon induction and uphold all operational rules."
                ),
                "rationale": "Establishes clear operational accountability across management and staff.",
                "source_clauses": ["Corporate Governance Structure"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-procedures",
                "section_number": "7.0",
                "heading": "Operational Procedures & Implementation Controls",
                "content": (
                    f"1. **Standard Operating Procedures (SOPs):** Detailed SOPs must be maintained and aligned with this policy.\n"
                    f"2. **Access & Control Management:** Access to sensitive operations, systems, or records must follow the principle of least privilege.\n"
                    f"3. **Training & Awareness:** Mandatory training on this policy shall be conducted upon onboarding and refreshed at least annually.\n"
                    + (
                        f"4. **Workspace Specific Controls:** {specific_context.strip()}"
                        if specific_context and specific_context.strip()
                        else "4. **Change Management:** Any modification to operational workflows must be reviewed for policy alignment prior to deployment."
                    )
                ),
                "rationale": "Bridges high-level governance commitments with actionable daily controls.",
                "source_clauses": ["Standard Operating Procedure Framework"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-monitoring",
                "section_number": "8.0",
                "heading": "Compliance Monitoring, Auditing & Verification",
                "content": (
                    f"1. **Periodic Audits:** Formal compliance verification shall be performed on a {cadence.lower()} schedule under the direction of the {role}.\n"
                    f"2. **Evidence Preservation:** Audit logs, training attestations, and compliance assessments must be retained securely for a minimum of 3 years.\n"
                    f"3. **Deficiency Remediation:** Any compliance gaps identified during audits must be documented with an assigned corrective action plan."
                ),
                "rationale": "Defines auditing, metric tracking, and evidence-gathering requirements.",
                "source_clauses": ["Audit & Recordkeeping Standards"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-exceptions",
                "section_number": "9.0",
                "heading": "Exceptions, Waivers & Deviation Governance",
                "content": (
                    f"1. **Exception Criteria:** Deviations from this policy are granted only under documented operational necessity with compensatory safeguards.\n"
                    f"2. **Formal Approval:** All waiver requests must be submitted in writing and approved by the {role}.\n"
                    f"3. **Time Limitation:** Approved exceptions are valid for a maximum period of 180 days, after which re-evaluation is required."
                ),
                "rationale": "Provides a controlled mechanism for justified operational deviations.",
                "source_clauses": ["Exception Governance Framework"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-enforcement",
                "section_number": "10.0",
                "heading": "Incident Reporting & Disciplinary Enforcement",
                "content": (
                    f"1. **Duty to Report:** Workforce members must report known or suspected violations immediately to the {role} or via confidential reporting channels.\n"
                    f"2. **Whistleblower Protection:** {org_name} maintains a strict non-retaliation policy for reports submitted in good faith.\n"
                    f"3. **Enforcement Measures:** Violations of this policy are subject to disciplinary action up to and including termination of employment or contractual termination, in accordance with applicable labor regulations in {jurisdiction}."
                ),
                "rationale": "Establishes non-retaliatory reporting channels and enforcement consequences.",
                "source_clauses": ["Disciplinary Enforcement & Whistleblower Standards"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-statutory",
                "section_number": "11.0",
                "heading": "Statutory References & Grounded Citations",
                "content": (
                    "This policy incorporates principles from the following verified statutory instruments and benchmarks:\n\n"
                    + "\n\n".join([
                        f"### {s['act_name']} ({s['jurisdiction']})\n"
                        f"- **Instrument Type:** {s['instrument_type']}\n"
                        f"- **Official Citation:** {s['official_citation']}\n"
                        f"- **Verified Statutory Provisions:**\n"
                        + "\n".join([f"  • {p}" for p in s['provisions'][:5]])
                        for s in source_refs
                    ])
                    if source_refs
                    else f"Grounding established against corporate governance baselines and commercial standards in {jurisdiction}."
                ),
                "rationale": "Preserves explicit legal traceability to verified legislation without fabricated citations.",
                "source_clauses": [p for s in source_refs for p in s.get("provisions", [])[:3]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-limitations",
                "section_number": "12.0",
                "heading": "Assumptions, Verification Warnings & Review Schedule",
                "content": (
                    f"**Legal Notice & Limitations Disclaimer:**\n"
                    f"This document is an internal draft generated directly via LexisGraph Policy Formation. "
                    f"It constitutes internal operational policy and does not replace formal legal counsel review.\n\n"
                    f"**Operational Scope & Jurisdiction:**\n"
                    f"- Applicable Scope: {scope_display}.\n"
                    f"- Primary Jurisdiction: {jurisdiction}.\n"
                    f"- Scheduled Review Frequency: {cadence}.\n\n"
                    + (
                        "**Statutory Notices & Applicability Warnings:**\n"
                        + "\n".join([f"- {n}" for n in unresolved_notes])
                        + "\n\n"
                        if unresolved_notes
                        else ""
                    )
                    + f"**Next Review Cadence:** Mandatory executive review scheduled on an {cadence.lower()} cycle following formal adoption."
                ),
                "rationale": "Prevents false claims of legal certification and documents verified statutory warnings.",
                "source_clauses": ["Statutory Compliance Limitations Disclaimer"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
        ]

        # Telemetry initialization
        gen_telemetry = {
            "generator": "lexisgraph-direct-grounded-drafter",
            "generation_method": "deterministic_rule_based",
            "is_template_fallback": True,
            "fallback_reason": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "llm_enhanced": False,
        }

        # Attempt AI Reasoning Enrichment on Core Commitments
        try:
            llm_prompt = (
                f"You are LexisGraph AI Legal Policy Drafter. Enrich the mandatory commitments section for an organization policy.\n"
                f"Organization: {org_name}\n"
                f"Policy Title: {clean_title}\n"
                f"Category: {category}\n"
                f"Scope: {scope_display}\n"
                f"Jurisdiction: {jurisdiction}\n"
                f"Policy Purpose: {clean_purpose}\n"
                + (f"Specific Context: {specific_context}\n" if specific_context else "")
                + f"Statutory References: {', '.join([s['act_name'] for s in source_refs])}\n"
                f"Provide 5 concise, professional, enforceable policy statements formatted as markdown numbered points. Do NOT invent fake legal citations."
            )
            enriched_text = _resolve_reasoning(llm_prompt)
            if enriched_text and len(enriched_text.strip()) > 80:
                core_sec = next((s for s in sections if s["section_id"] == "sec-core-requirements"), None)
                if core_sec:
                    core_sec["content"] = enriched_text.strip()
                    gen_telemetry["generator"] = "lexisgraph-ai-policy-drafter"
                    gen_telemetry["generation_method"] = "ai_llm_generated"
                    gen_telemetry["is_template_fallback"] = False
                    gen_telemetry["fallback_reason"] = None
                    gen_telemetry["llm_enhanced"] = True
                    gen_telemetry["provider"] = "gemini_or_openrouter"
            else:
                gen_telemetry["fallback_reason"] = "AI provider response was empty or too brief; applied grounded deterministic template."
        except Exception as exc:
            logger.info("Direct drafting LLM enrichment skipped (using grounded template): %s", exc)
            gen_telemetry["fallback_reason"] = f"AI provider error: {str(exc)}"

        # Persist new PolicyDraft record
        draft = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=ws.organization_id,
            assessment_id=None,
            analysis_id=None,
            analysis_version=None,
            need_id=direct_need_id,
            created_by=user_id,
            title=clean_title,
            status="DRAFT_SAVED",
            version=1,
            metadata_properties=metadata_props,
            sections=sections,
            source_references=source_refs,
            unresolved_questions=unresolved_notes,
            generation_metadata=gen_telemetry,
            history=[],
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)

        logger.info(
            "Created Direct PolicyDraft %s ('%s') in workspace %s (status=%s, version=1)",
            draft.id,
            clean_title,
            ws.organization_id,
            draft.status,
        )
        return draft

    @classmethod
    def _generate_grounded_draft_content(
        cls,
        assessment: OrganizationAssessment,
        analysis: PolicyNeedsAnalysis,
        need: Dict[str, Any],
        linked_discoveries: List[Dict[str, Any]],
        matching_coverage: Optional[Dict[str, Any]],
        decision_info: Dict[str, Any],
        is_preliminary: bool,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
        """
        Generate grounded 12-section policy structure using circumspect assessment data
        and verified statutory provisions.
        """
        answers = assessment.answers or {}
        profile = answers.get("profile", {})
        org_name = profile.get("organization_name") or "The Organization"
        org_type = profile.get("org_type", "Startup")
        industry = profile.get("industry", "Technology & Commercial Services")
        employee_count = profile.get("employee_count", "11-50")
        jurisdiction = answers.get("jurisdiction", {})
        primary_country = jurisdiction.get("primary_country", "India")
        other_countries = jurisdiction.get("other_countries", [])
        activities = answers.get("activities", {})
        scope = answers.get("scope", {})
        scope_type = scope.get("scope_type", "ORGANIZATION")
        existing_policies = answers.get("existing_policies", {})
        certifications = existing_policies.get("certifications", [])

        need_id = need.get("need_id", "")
        need_title = need.get("title", "Policy")
        category = need.get("category", "Governance")
        owner_role = need.get("recommended_owner_role", "Compliance Officer")
        review_cadence = need.get("suggested_review_frequency", "Annual")
        business_rationale = need.get("business_rationale", "")

        # Collect source references
        source_refs: List[Dict[str, Any]] = []
        for disc in linked_discoveries:
            act_name = disc.get("instrument_name") or disc.get("act_name") or disc.get("title") or "Regulatory Standard"
            source_refs.append({
                "act_name": act_name,
                "instrument_name": act_name,
                "instrument_type": disc.get("legal_instrument_type") or disc.get("category", "standard"),
                "jurisdiction": disc.get("jurisdiction", "Global"),
                "official_citation": disc.get("source_reference") or disc.get("official_citation", ""),
                "provisions": disc.get("relevant_provisions", []),
                "source_origin": disc.get("source_origin", "canonical_registry_reference"),
            })

        # Base Document Metadata
        policy_code = f"POL-{need_id.replace('need-', '').upper()}"
        metadata_props = {
            "policy_identifier": policy_code,
            "owner_role": owner_role,
            "target_audience": "All Workforce Members, Contractors, and Third-Party Partners",
            "scope": f"{scope_type} ({org_name})",
            "classification": "Internal Governance Document",
            "review_cadence": review_cadence,
            "effective_date": None,  # Explicitly unset until Stage 5 approval
            "associated_industry": industry,
            "primary_jurisdiction": primary_country,
        }

        # Build Grounded 12-Section Architecture
        sections: List[Dict[str, Any]] = [
            {
                "section_id": "sec-metadata",
                "section_number": "1.0",
                "heading": "Document Control & Metadata",
                "content": (
                    f"**Document Title:** {need_title}\n"
                    f"**Document Identifier:** {policy_code}\n"
                    f"**Designated Owner / Role:** {owner_role}\n"
                    f"**Applicable Scope:** {scope_type} — {org_name}\n"
                    f"**Classification:** Internal Governance Policy\n"
                    f"**Drafting Version:** v1.0 (Draft)\n"
                    f"**Effective Date:** [UNSET — Requires Executive Approval Prior to Activation]\n"
                    f"**Scheduled Review Cadence:** {review_cadence}\n"
                    f"**Target Audience:** All permanent employees, contract personnel, and third parties operating on behalf of {org_name}."
                ),
                "rationale": "Establishes authoritative document ownership, version control, and operational governance parameters.",
                "source_clauses": [f"{s['act_name']}: Governance Standards" for s in source_refs[:2]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-purpose",
                "section_number": "2.0",
                "heading": "Purpose & Strategic Objectives",
                "content": (
                    f"{org_name} is committed to maintaining the highest ethical, legal, and operational governance standards "
                    f"across its business activities in {industry}. The purpose of this {need_title} is to define mandatory organizational "
                    f"commitments, mitigate risk exposures, and establish uniform operational rules for all workforce members.\n\n"
                    f"**Strategic Rationale:** {business_rationale}\n\n"
                    f"This policy establishes internal controls to comply with applicable statutory legislation in {primary_country} "
                    f"and relevant operating jurisdictions ({', '.join(other_countries) if other_countries else 'Domestic Operations'}), "
                    f"ensuring transparent stewardship and safeguarding stakeholder trust."
                ),
                "rationale": "Articulates the business rationale and compliance mandate derived from the Stage 3 Policy Needs Analysis.",
                "source_clauses": [f"{s['act_name']}: Legislative Purpose" for s in source_refs[:3]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-scope",
                "section_number": "3.0",
                "heading": "Scope & Applicability",
                "content": (
                    f"This policy applies comprehensively across {org_name} (Scope: {scope_type}), encompassing:\n"
                    f"1. **Personnel:** All full-time employees, part-time staff, fixed-term contractors, temporary interns, and executive management (Organization scale: {employee_count} workforce members).\n"
                    f"2. **Environments & Assets:** All corporate facilities, cloud environments ({'Cloud services in scope' if activities.get('cloud_services') else 'On-premise / hybrid systems'}), "
                    f"software applications, databases, endpoints, and communications infrastructure.\n"
                    f"3. **Data & Information:** All customer data, proprietary business records, and {'sensitive personal data' if activities.get('sensitive_data') else 'confidential organizational information'}.\n"
                    f"4. **Third Parties:** External vendors, suppliers, consultants, and contractors who interact with {org_name}'s systems or data."
                ),
                "rationale": "Defines organizational boundaries and workforce applicability based on the Organization Assessment profile.",
                "source_clauses": ["Organizational Scope Criteria"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-definitions",
                "section_number": "4.0",
                "heading": "Definitions & Statutory Terminology",
                "content": (
                    "For the purposes of this policy, the following terms and definitions apply:\n"
                    "- **Workforce Member:** Any individual engaged by the Organization, including permanent employees, contract workers, and interns.\n"
                    "- **Designated Officer:** The designated executive role responsible for policy enforcement, oversight, and reporting.\n"
                    "- **Confidential Information:** Non-public proprietary, technical, operational, customer, financial, or strategic information.\n"
                    + (
                        "- **Personal Data:** Any data about an individual who is identifiable by or in relation to such data, as recognized under applicable privacy statutes.\n"
                        "- **Data Principal / Data Subject:** The natural person to whom the personal data relates.\n"
                        if activities.get("personal_data")
                        else ""
                    )
                    + (
                        "- **AI System:** Any software system developed with machine learning or algorithmic logic designed to operate with varying levels of autonomy.\n"
                        if activities.get("ai_systems")
                        else ""
                    )
                    + (
                        "- **Vendor / Supplier:** Any third-party entity providing contracted products, software, or professional services to the Organization.\n"
                        if activities.get("vendors")
                        else ""
                    )
                ),
                "rationale": "Clarifies terminology to ensure unambiguous legal and operational interpretation.",
                "source_clauses": [f"{s['act_name']}: Statutory Definitions" for s in source_refs[:2]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-core-requirements",
                "section_number": "5.0",
                "heading": "Mandatory Governance Commitments & Operational Requirements",
                "content": (
                    f"All personnel and operational units within {org_name} must adhere strictly to the following mandatory standards:\n\n"
                    f"1. **Lawful Basis & Fair Dealing:** All operations must be conducted lawfully, ethically, and in strict compliance with applicable statutory obligations.\n"
                    f"2. **Protection of Assets & Data:** {'Personal data and confidential records must be safeguarded with role-based access control, cryptographic protection in transit and at rest, and verified retention schedules.' if activities.get('personal_data') else 'Corporate information assets must be protected against unauthorized disclosure, destruction, or misuse.'}\n"
                    f"3. **Operational Transparency:** Operational processes must be documented, auditable, and traceable to verified business justifications.\n"
                    f"4. **Third-Party Accountability:** {'All third-party vendors must execute binding data protection and confidentiality agreements prior to system access or data transfer.' if activities.get('vendors') else 'Contractors must abide by corporate confidentiality and acceptable conduct requirements.'}\n"
                    f"5. **Prohibition of Non-Compliant Practices:** Unauthorized copying, exfiltration of proprietary assets, circumvention of security controls, or non-compliance with statutory mandates is strictly prohibited and subject to immediate disciplinary escalation."
                ),
                "rationale": "Establishes concrete, enforceable policy statements aligned with verified regulatory provisions.",
                "source_clauses": [p for s in source_refs for p in s.get("provisions", [])[:2]][:4],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-roles",
                "section_number": "6.0",
                "heading": "Roles, Responsibilities & Governance Structure",
                "content": (
                    f"Governance responsibilities for this policy are distributed as follows:\n\n"
                    f"1. **Executive Leadership / Board:** Authorizes policy adoption, reviews periodic audit summaries, and allocates necessary compliance resources.\n"
                    f"2. **Policy Owner ({owner_role}):** Exercises operational oversight, evaluates compliance metrics, reviews exception requests, and leads the {review_cadence.lower()} review cycle.\n"
                    f"3. **Department Managers & Team Leads:** Ensure all team members complete required training, enforce day-to-day adherence, and escalate potential non-compliance.\n"
                    f"4. **Workforce Members:** Review and acknowledge this policy upon commencement, maintain compliance during daily operations, and immediately report observed anomalies or violations."
                ),
                "rationale": "Establishes clear lines of accountability across management and operational staff.",
                "source_clauses": ["Corporate Governance Structure"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-monitoring",
                "section_number": "7.0",
                "heading": "Compliance Monitoring, Auditing & Verification",
                "content": (
                    f"1. **Continuous Monitoring:** {org_name} implements monitoring mechanisms to assess ongoing compliance with this policy.\n"
                    f"2. **Internal Audits:** Periodic compliance assessments shall be conducted on a {review_cadence.lower()} basis under the direction of the {owner_role}.\n"
                    f"3. **Audit Trails & Evidence:** Records of compliance reviews, training attestations, risk evaluations, and incident reports must be maintained securely for a minimum of 3 years (or statutory retention mandates).\n"
                    f"4. **Third-Party Review:** Where required by benchmark certifications ({', '.join(certifications) if certifications else 'Standard Frameworks'}), independent external audits may be scheduled."
                ),
                "rationale": "Defines auditing, metric tracking, and evidence-gathering requirements.",
                "source_clauses": ["Audit & Recordkeeping Standards"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-exceptions",
                "section_number": "8.0",
                "heading": "Exceptions, Waivers & Escalation Procedure",
                "content": (
                    f"1. **Exception Criteria:** Exceptions to this policy are permitted only under exceptional operational necessity where compensatory controls are implemented.\n"
                    f"2. **Approval Authority:** Any request for an exception must be submitted in writing to the {owner_role}. No unilateral or informal exceptions are valid.\n"
                    f"3. **Documentation & Duration:** Approved exceptions must document: (a) specific justification, (b) compensatory controls, (c) residual risk assessment, and (d) an expiration date not exceeding 180 days.\n"
                    f"4. **Escalation Path:** Material disagreements or high-risk exceptions are escalated directly to the Executive Leadership Team for final determination."
                ),
                "rationale": "Provides a formal, documented process for exceptions without undermining policy integrity.",
                "source_clauses": ["Exception Governance Framework"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-incident",
                "section_number": "9.0",
                "heading": "Incident Management & Grievance Reporting",
                "content": (
                    f"1. **Mandatory Reporting:** Any workforce member who observes or suspects a violation of this policy or a security/privacy incident must report it immediately to the {owner_role} or through designated internal channels.\n"
                    f"2. **Prompt Investigation:** Reported incidents shall be triaged and investigated promptly, following the Organization's incident response procedures.\n"
                    f"3. **Non-Retaliation Policy:** {org_name} strictly prohibits any retaliation, harassment, or adverse employment action against any individual who reports a concern in good faith.\n"
                    f"4. **Corrective Actions:** Confirmed non-compliance may result in corrective training, revocation of system privileges, and disciplinary action up to and including termination of engagement."
                ),
                "rationale": "Establishes non-retaliatory reporting channels and incident response escalations.",
                "source_clauses": ["Incident Reporting & Whistleblower Provisions"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-related",
                "section_number": "10.0",
                "heading": "Related Policies, Technical Standards & Operational Runbooks",
                "content": (
                    f"This {need_title} serves as a high-level governance policy. Detailed operational procedures, technical standards, "
                    f"and departmental runbooks must align with this document. Key related governance instruments include:\n"
                    f"- Master Information Security & Access Control Standard\n"
                    f"- Data Protection & Classification Guidelines\n"
                    f"- Employee Code of Conduct & Acceptable Use Policy\n"
                    f"- Third-Party Risk Management SOP\n"
                    f"- Incident Response & Breach Escalation Runbook"
                ),
                "rationale": "Maintains policy-level focus by referencing separate operational procedures and standards.",
                "source_clauses": ["Internal Policy Hierarchy"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-statutory",
                "section_number": "11.0",
                "heading": "Statutory References & Grounded Citations",
                "content": (
                    "This policy is grounded in the following statutory instruments and legal provisions:\n\n"
                    + "\n\n".join([
                        f"### {s['act_name']} ({s['jurisdiction']})\n"
                        f"- **Instrument Type:** {s['instrument_type']}\n"
                        f"- **Official Reference:** {s['official_citation']}\n"
                        f"- **Verified Statutory Provisions:**\n"
                        + "\n".join([f"  • {p}" for p in s['provisions'][:5]])
                        for s in source_refs
                    ])
                    if source_refs
                    else "No external statutory instruments were linked to this general internal governance policy."
                ),
                "rationale": "Preserves explicit legal traceability to verified legislation without fabricated citations.",
                "source_clauses": [p for s in source_refs for p in s.get("provisions", [])[:3]],
                "is_customized": False,
                "last_regenerated_at": None,
            },
            {
                "section_id": "sec-limitations",
                "section_number": "12.0",
                "heading": "Assumptions, Verification Warnings & Review Cadence",
                "content": (
                    f"**Legal Notice & Limitations Disclaimer:**\n"
                    f"This document is an internal draft generated during LexisGraph Policy Formation (Stage 4). "
                    f"It does not constitute formal legal certification, nor does it guarantee compliance with all statutory requirements.\n\n"
                    f"**Operational Assumptions:**\n"
                    f"- Organization is operating under {org_type} structure with approximately {employee_count} workers.\n"
                    f"- Primary statutory jurisdiction is {primary_country}.\n"
                    + (
                        f"**Unresolved Applicability Caveats:**\n"
                        f"This draft was produced with status: '{'NEEDS_VERIFICATION (Preliminary Draft)' if is_preliminary else 'DRAFT_SAVED'}'. "
                        f"Statutory commencement dates, executive rules notifications, and applicability thresholds must be verified by qualified legal counsel prior to formal publication.\n\n"
                        if is_preliminary
                        else ""
                    )
                    + f"**Next Review Date:** Scheduled for {review_cadence} review following executive approval."
                ),
                "rationale": "Prevents false claims of legal certification and documents real operational assumptions.",
                "source_clauses": ["Statutory Compliance Limitations Disclaimer"],
                "is_customized": False,
                "last_regenerated_at": None,
            },
        ]

        # Stage 4/5 Telemetry: Explicitly differentiate AI vs Deterministic Template Fallback
        gen_telemetry = {
            "generator": "lexisgraph-grounded-template-engine",
            "generation_method": "deterministic_rule_based",
            "is_template_fallback": True,
            "fallback_reason": "Deterministic statutory template used; AI reasoning pending or not invoked.",
            "provider": "deterministic_template_engine",
            "prompt_version": "v5.0-enterprise",
            "statutory_instruments_count": len(source_refs),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "llm_enhanced": False,
        }

        try:
            llm_prompt = (
                f"You are LexisGraph AI Legal Policy Drafter. Enrich the mandatory commitments section for an organization policy.\n"
                f"Organization: {org_name} ({org_type}, {industry}, {employee_count} employees in {primary_country})\n"
                f"Policy: {need_title}\n"
                f"Statutory Provisions: {', '.join([p for s in source_refs for p in s.get('provisions', [])[:3]])}\n"
                f"Provide 4 concise, professional policy statements formatted as markdown numbered points. Do NOT invent fake legal citations."
            )
            enriched_text = _resolve_reasoning(llm_prompt)
            if enriched_text and len(enriched_text.strip()) > 80:
                # Safely update section 5 with enriched text
                core_sec = next((s for s in sections if s["section_id"] == "sec-core-requirements"), None)
                if core_sec:
                    core_sec["content"] = enriched_text.strip()
                    gen_telemetry["generator"] = "lexisgraph-ai-policy-drafter"
                    gen_telemetry["generation_method"] = "ai_llm_generated"
                    gen_telemetry["is_template_fallback"] = False
                    gen_telemetry["fallback_reason"] = None
                    gen_telemetry["llm_enhanced"] = True
                    gen_telemetry["provider"] = "gemini_or_openrouter"
            else:
                gen_telemetry["fallback_reason"] = "AI provider returned empty or insufficient response; grounded template retained."
        except Exception as e:
            logger.info("LLM reasoning enrichment skipped (using deterministic grounded template): %s", e)
            gen_telemetry["fallback_reason"] = f"AI provider error: {str(e)}"

        return sections, metadata_props, source_refs, gen_telemetry

    @classmethod
    def get_draft(cls, draft_id: uuid.UUID, db: Session, ws: WorkspaceContext) -> PolicyDraft:
        """Get policy draft by ID with strict workspace verification."""
        draft = db.query(PolicyDraft).filter(
            PolicyDraft.id == draft_id,
            PolicyDraft.organization_id == ws.organization_id,
        ).first()
        if not draft:
            raise ValueError(f"Policy draft {draft_id} not found in workspace {ws.organization_id}")
        return draft

    @classmethod
    def list_drafts(cls, db: Session, ws: WorkspaceContext) -> List[PolicyDraft]:
        """List all policy drafts for the active workspace."""
        return (
            db.query(PolicyDraft)
            .filter(PolicyDraft.organization_id == ws.organization_id)
            .order_by(desc(PolicyDraft.updated_at))
            .all()
        )

    @classmethod
    def update_draft(
        cls,
        draft_id: uuid.UUID,
        updates: Any,  # PolicyDraftUpdateRequest
        user_id: Optional[uuid.UUID],
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """
        Update draft title, status, metadata, or sections with optimistic concurrency control,
        lifecycle state validation, and automated archival of prior version snapshots.
        """
        draft = cls.get_draft(draft_id, db, ws)

        # Lifecycle protection: drafts in review, approved, or published are locked from direct modification
        if draft.status in ("READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "SUPERSEDED"):
            if updates.sections is not None or updates.title is not None or updates.metadata_properties is not None:
                raise ValueError(
                    f"Policy draft {draft_id} is in protected lifecycle status '{draft.status}'. "
                    "Direct modifications are locked. To edit, branch a new version using 'create_revision'."
                )

        # Optimistic Concurrency Control
        if updates.expected_version is not None and updates.expected_version != draft.version:
            raise ValueError(
                f"Conflict: Draft has been modified (current version {draft.version}, expected {updates.expected_version}). "
                "Please refresh to load the latest content."
            )

        # Archive Current Version to History
        history = list(draft.history or [])
        snapshot = {
            "version": draft.version,
            "title": draft.title,
            "status": draft.status,
            "sections": copy.deepcopy(draft.sections),
            "metadata_properties": copy.deepcopy(draft.metadata_properties),
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(user_id) if user_id else None,
            "change_summary": getattr(updates, "change_summary", None) or f"Revision v{draft.version} saved",
        }
        history.append(snapshot)
        draft.history = history
        flag_modified(draft, "history")

        # Increment Version
        draft.version += 1

        # Apply Updates
        if updates.title is not None:
            draft.title = updates.title.strip()
        if updates.status is not None:
            # Prevent illegal arbitrary transitions
            valid_direct_statuses = {"DRAFT_SAVED", "NEEDS_VERIFICATION"}
            if updates.status not in valid_direct_statuses and draft.status in valid_direct_statuses:
                raise ValueError(
                    f"Cannot set status '{updates.status}' directly. Lifecycle transitions (review, approval, publishing) must use dedicated workflow endpoints."
                )
            draft.status = updates.status.strip()
        if updates.metadata_properties is not None:
            draft.metadata_properties = updates.metadata_properties
            flag_modified(draft, "metadata_properties")
        if updates.sections is not None:
            draft.sections = [
                s.model_dump() if hasattr(s, "model_dump") else s
                for s in updates.sections
            ]
            flag_modified(draft, "sections")

        draft.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(draft)

        logger.info(
            "Draft %s updated to v%s (status=%s) in workspace %s",
            draft.id,
            draft.version,
            draft.status,
            ws.organization_id,
        )
        return draft

    @classmethod
    def regenerate_draft_section(
        cls,
        draft_id: uuid.UUID,
        section_id: str,
        custom_instructions: Optional[str],
        expected_version: Optional[int],
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """
        Regenerate a single selected section using AI and evidence context,
        preserving user edits in all other sections. Explicitly tracks AI vs fallback.
        """
        draft = cls.get_draft(draft_id, db, ws)

        if draft.status in ("READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "SUPERSEDED"):
            raise ValueError(
                f"Policy draft {draft_id} is in protected status '{draft.status}'. "
                "Sections cannot be regenerated while under review or after approval. Create a new revision first."
            )

        # Concurrency check
        if expected_version is not None and expected_version != draft.version:
            raise ValueError(
                f"Conflict: Draft has been modified (current version {draft.version}, expected {expected_version}). "
                "Please refresh before regenerating."
            )

        # Find target section
        sections = list(draft.sections or [])
        sec_idx = next((i for i, s in enumerate(sections) if s.get("section_id") == section_id), None)
        if sec_idx is None:
            raise ValueError(f"Section '{section_id}' not found in draft {draft_id}")

        target_sec = sections[sec_idx]

        # Archive Current Version to History
        history = list(draft.history or [])
        snapshot = {
            "version": draft.version,
            "title": draft.title,
            "status": draft.status,
            "sections": copy.deepcopy(draft.sections),
            "metadata_properties": copy.deepcopy(draft.metadata_properties),
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "change_summary": f"Prior to regenerating section {target_sec.get('heading')}",
        }
        history.append(snapshot)
        draft.history = history
        flag_modified(draft, "history")

        # Neighboring Context
        prev_sec = sections[sec_idx - 1] if sec_idx > 0 else None
        next_sec = sections[sec_idx + 1] if sec_idx < len(sections) - 1 else None

        # Build prompt
        prompt = (
            f"You are LexisGraph AI Legal Policy Editor. Regenerate and improve section '{target_sec.get('heading')}' "
            f"for policy '{draft.title}'.\n"
            f"Current Section Content:\n{target_sec.get('content')}\n\n"
            + (f"Preceding Section: {prev_sec.get('heading')}\n" if prev_sec else "")
            + (f"Subsequent Section: {next_sec.get('heading')}\n" if next_sec else "")
            + (f"User's Specific Drafting Instructions: {custom_instructions}\n" if custom_instructions else "")
            + f"Statutory References: {', '.join([s.get('act_name', '') for s in draft.source_references or []])}\n\n"
            f"Write the revised section content in clear, formal policy markdown. Maintain consistency with the neighboring sections. Do not include markdown headers in your response."
        )

        regenerated_text = None
        regen_method = "deterministic_rule_based"
        is_fallback = True
        fallback_reason = None
        try:
            regenerated_text = _resolve_reasoning(prompt)
            if regenerated_text and len(regenerated_text.strip()) >= 40:
                regen_method = "ai_llm_generated"
                is_fallback = False
            else:
                fallback_reason = "AI provider response was empty or too brief; applied structured template refinement."
        except Exception as e:
            logger.info("AI regeneration call failed, applying structured refinement: %s", e)
            fallback_reason = f"AI provider error: {str(e)}"

        if not regenerated_text or len(regenerated_text.strip()) < 40:
            # Fallback deterministic enrichment based on custom instructions
            curr_content = target_sec.get("content", "")
            if custom_instructions:
                regenerated_text = f"{curr_content}\n\n**Operational Guidance Update (Template/Rule-Based):** {custom_instructions}"
            else:
                regenerated_text = curr_content

        target_sec["content"] = regenerated_text.strip()
        target_sec["is_customized"] = True
        target_sec["last_regenerated_at"] = datetime.now(timezone.utc).isoformat()
        target_sec["generation_method"] = regen_method
        target_sec["is_template_fallback"] = is_fallback
        if fallback_reason:
            target_sec["fallback_reason"] = fallback_reason
        sections[sec_idx] = target_sec

        draft.sections = sections
        flag_modified(draft, "sections")
        draft.version += 1
        draft.updated_at = datetime.now(timezone.utc)


        db.commit()
        db.refresh(draft)

        logger.info(
            "Regenerated section %s in draft %s (new version %s)",
            section_id,
            draft.id,
            draft.version,
        )
        return draft

    @classmethod
    def get_draft_history(cls, draft_id: uuid.UUID, db: Session, ws: WorkspaceContext) -> List[Dict[str, Any]]:
        """Get archived version history snapshots for a draft."""
        draft = cls.get_draft(draft_id, db, ws)
        return draft.history or []

    @classmethod
    def get_draft_history_version(
        cls, draft_id: uuid.UUID, version_num: int, db: Session, ws: WorkspaceContext
    ) -> Dict[str, Any]:
        """Get a specific historical version snapshot."""
        draft = cls.get_draft(draft_id, db, ws)
        history = draft.history or []
        snapshot = next((h for h in history if h.get("version") == version_num), None)
        if not snapshot:
            raise ValueError(f"Version {version_num} not found in history for draft {draft_id}")
        return snapshot

    @classmethod
    def revert_draft_version(
        cls, draft_id: uuid.UUID, version_num: int, db: Session, ws: WorkspaceContext
    ) -> PolicyDraft:
        """Revert draft content to a historical snapshot."""
        draft = cls.get_draft(draft_id, db, ws)
        history = draft.history or []
        snapshot = next((h for h in history if h.get("version") == version_num), None)
        if not snapshot:
            raise ValueError(f"Version {version_num} not found in history for draft {draft_id}")

        # Archive current state first
        current_snapshot = {
            "version": draft.version,
            "title": draft.title,
            "status": draft.status,
            "sections": copy.deepcopy(draft.sections),
            "metadata_properties": copy.deepcopy(draft.metadata_properties),
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "change_summary": f"Prior to reverting to v{version_num}",
        }
        new_history = list(history)
        new_history.append(current_snapshot)
        draft.history = new_history
        flag_modified(draft, "history")

        # Restore from snapshot
        draft.title = snapshot.get("title", draft.title)
        draft.status = snapshot.get("status", draft.status)
        draft.sections = copy.deepcopy(snapshot.get("sections", draft.sections))
        draft.metadata_properties = copy.deepcopy(snapshot.get("metadata_properties", draft.metadata_properties))
        flag_modified(draft, "sections")
        flag_modified(draft, "metadata_properties")

        draft.version += 1
        draft.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(draft)

        logger.info(
            "Draft %s reverted to state of v%s (new active version v%s)",
            draft.id,
            version_num,
            draft.version,
        )
        return draft

    @classmethod
    def delete_draft(cls, draft_id: uuid.UUID, db: Session, ws: WorkspaceContext) -> None:
        """Delete policy draft with verified workspace isolation, protecting published records."""
        draft = cls.get_draft(draft_id, db, ws)
        if draft.status == "PUBLISHED":
            raise ValueError(
                f"Cannot delete published policy draft {draft_id}. Published policies are immutable records in the Policies repository."
            )
        db.delete(draft)
        db.commit()
        logger.info("Deleted policy draft %s in workspace %s", draft_id, ws.organization_id)

    # -----------------------------------------------------------------------
    # Stage 5: Approval Lifecycle, Decision Audit, and Production Publishing
    # -----------------------------------------------------------------------

    @staticmethod
    def compute_draft_content_hash(sections: List[Dict[str, Any]]) -> str:
        """
        Compute a canonical SHA-256 hash across all policy sections to guarantee
        immutability between approval and publishing.
        """
        canonical_parts = []
        for sec in (sections or []):
            sid = str(sec.get("section_id", "")).strip()
            heading = str(sec.get("heading", "")).strip()
            content = str(sec.get("content", "")).strip()
            canonical_parts.append(f"{sid}::{heading}::{content}")
        payload = "\n---SECTION_DELIMITER---\n".join(canonical_parts)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @classmethod
    def get_eligible_reviewers(cls, ws: WorkspaceContext, db: Session) -> List[Dict[str, Any]]:
        """
        Retrieve workspace members eligible for draft review or approval.
        Only active members with Reviewer, Compliance Analyst, or Admin roles qualify.
        """
        allowed_roles = [
            UserRole.ADMIN,
            UserRole.COMPLIANCE_ANALYST,
            UserRole.LEGAL_ANALYST,
            UserRole.REVIEWER,
            UserRole.ORGANIZATION_ADMIN,
            UserRole.SUPER_ADMIN,
        ]
        members = (
            db.query(OrganizationMember, User)
            .join(User, OrganizationMember.user_id == User.id)
            .filter(
                OrganizationMember.organization_id == ws.organization_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
                OrganizationMember.role.in_(allowed_roles),
                User.is_active.is_(True),
            )
            .all()
        )
        reviewers = []
        for member, user in members:
            reviewers.append({
                "id": user.id,
                "user_id": user.id,
                "full_name": user.full_name or user.username,
                "email": user.email,
                "role": member.role.value if hasattr(member.role, "value") else str(member.role),
            })
        return reviewers

    @classmethod
    def submit_for_review(
        cls,
        draft_id: uuid.UUID,
        reviewer_id: Optional[uuid.UUID],
        notes: Optional[str],
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """
        Submit policy draft for formal review and lock ordinary editing.
        Validates draft state, content presence, and assigned reviewer eligibility.
        """
        draft = cls.get_draft(draft_id, db, ws)

        if draft.status not in ("DRAFT_SAVED", "NEEDS_VERIFICATION", "REVISION_REQUESTED"):
            raise ValueError(
                f"Cannot submit draft for review from status '{draft.status}'. "
                "Draft must be in 'DRAFT_SAVED', 'NEEDS_VERIFICATION', or 'REVISION_REQUESTED'."
            )

        if not draft.sections or len(draft.sections) == 0:
            raise ValueError("Cannot submit an empty draft without policy sections.")

        # If reviewer assigned, verify membership in active workspace and appropriate role
        if reviewer_id:
            reviewer_member = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == ws.organization_id,
                OrganizationMember.user_id == reviewer_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            ).first()
            if not reviewer_member:
                raise ValueError(
                    f"Selected reviewer {reviewer_id} is not an active member of workspace {ws.organization_id}"
                )

            allowed_roles = [
                UserRole.ADMIN,
                UserRole.COMPLIANCE_ANALYST,
                UserRole.LEGAL_ANALYST,
                UserRole.REVIEWER,
                UserRole.ORGANIZATION_ADMIN,
                UserRole.SUPER_ADMIN,
            ]
            if reviewer_member.role not in allowed_roles:
                raise ValueError("Selected reviewer does not possess review or approval privileges.")

        old_status = draft.status
        draft.status = "READY_FOR_REVIEW"
        draft.assigned_reviewer_id = reviewer_id
        draft.updated_at = datetime.now(timezone.utc)

        # Record in approval history audit log
        audit = PolicyApprovalAudit(
            organization_id=ws.organization_id,
            draft_id=draft.id,
            draft_version=draft.version,
            actor_id=ws.user.id,
            actor_name=ws.user.full_name or ws.user.username,
            action="DRAFT_SUBMITTED",
            previous_status=old_status,
            new_status="READY_FOR_REVIEW",
            comments=notes,
            metadata_snapshot={
                "assigned_reviewer_id": str(reviewer_id) if reviewer_id else None,
                "title": draft.title,
            },
        )
        db.add(audit)
        db.commit()
        db.refresh(draft)

        logger.info(
            "Draft %s submitted for review by user %s in workspace %s",
            draft.id,
            ws.user.id,
            ws.organization_id,
        )
        return draft

    @classmethod
    def approve_draft(
        cls,
        draft_id: uuid.UUID,
        expected_version: int,
        comments: Optional[str],
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """
        Approve submitted policy draft version with immutable SHA-256 content hashing.
        Enforces self-approval blocks, reviewer role verification, and stale-version protection.
        """
        draft = cls.get_draft(draft_id, db, ws)

        if draft.status != "READY_FOR_REVIEW":
            raise ValueError(
                f"Draft must be in 'READY_FOR_REVIEW' to be approved. Current status: '{draft.status}'."
            )

        if expected_version != draft.version:
            raise ValueError(
                f"Stale version conflict: Approval target v{expected_version} does not match active draft version v{draft.version}."
            )

        # Role verification
        if not ws.is_reviewer_or_above():
            raise ValueError("Unauthorized: Approval requires Reviewer, Compliance Analyst, or Administrator privileges.")

        # Reviewer assignment check
        if draft.assigned_reviewer_id and draft.assigned_reviewer_id != ws.user.id and not ws.is_admin():
            raise ValueError("Only the specifically assigned reviewer or an administrator can approve this draft.")

        # Self-approval safeguard
        if draft.created_by == ws.user.id:
            active_count = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == ws.organization_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            ).count()
            if active_count > 1:
                raise ValueError(
                    "Self-approval prohibited: Policy creator cannot approve their own submission in a multi-member organization. "
                    "An independent eligible reviewer must grant approval."
                )

        # Compute immutable content hash
        content_hash = cls.compute_draft_content_hash(draft.sections)

        old_status = draft.status
        draft.status = "APPROVED"
        draft.approved_by = ws.user.id
        draft.approved_at = datetime.now(timezone.utc)
        draft.approved_version = draft.version
        draft.content_hash = content_hash
        draft.review_comments = comments
        draft.updated_at = datetime.now(timezone.utc)

        audit = PolicyApprovalAudit(
            organization_id=ws.organization_id,
            draft_id=draft.id,
            draft_version=draft.version,
            actor_id=ws.user.id,
            actor_name=ws.user.full_name or ws.user.username,
            action="APPROVAL_GRANTED",
            previous_status=old_status,
            new_status="APPROVED",
            comments=comments,
            content_hash=content_hash,
            metadata_snapshot={
                "approved_version": draft.version,
                "approver_id": str(ws.user.id),
                "title": draft.title,
            },
        )
        db.add(audit)
        db.commit()
        db.refresh(draft)

        logger.info(
            "Draft %s v%s approved by %s in workspace %s",
            draft.id,
            draft.version,
            ws.user.id,
            ws.organization_id,
        )
        return draft

    @classmethod
    def request_revision(
        cls,
        draft_id: uuid.UUID,
        expected_version: int,
        comments: str,
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """Request revisions on a submitted policy draft with mandatory reviewer feedback."""
        if not comments or not comments.strip():
            raise ValueError("Revision request requires specific reviewer comments or rationale.")

        draft = cls.get_draft(draft_id, db, ws)
        if draft.status != "READY_FOR_REVIEW":
            raise ValueError(f"Draft must be in 'READY_FOR_REVIEW' to request revisions. Current status: '{draft.status}'.")

        if expected_version != draft.version:
            raise ValueError(f"Stale version conflict: Current draft version is v{draft.version}, expected v{expected_version}.")

        if not ws.is_reviewer_or_above():
            raise ValueError("Unauthorized: Only reviewers, analysts, or administrators can request revisions.")

        old_status = draft.status
        draft.status = "REVISION_REQUESTED"
        draft.review_comments = comments.strip()
        draft.updated_at = datetime.now(timezone.utc)

        audit = PolicyApprovalAudit(
            organization_id=ws.organization_id,
            draft_id=draft.id,
            draft_version=draft.version,
            actor_id=ws.user.id,
            actor_name=ws.user.full_name or ws.user.username,
            action="REVISION_REQUESTED",
            previous_status=old_status,
            new_status="REVISION_REQUESTED",
            comments=comments.strip(),
            metadata_snapshot={"title": draft.title},
        )
        db.add(audit)
        db.commit()
        db.refresh(draft)

        logger.info("Revisions requested on draft %s by %s in workspace %s", draft.id, ws.user.id, ws.organization_id)
        return draft

    @classmethod
    def reject_draft(
        cls,
        draft_id: uuid.UUID,
        expected_version: int,
        reason: str,
        db: Session,
        ws: WorkspaceContext,
    ) -> PolicyDraft:
        """Reject a submitted policy draft with a documented reason."""
        if not reason or not reason.strip():
            raise ValueError("Rejection requires a documented reason.")

        draft = cls.get_draft(draft_id, db, ws)
        if draft.status != "READY_FOR_REVIEW":
            raise ValueError(f"Draft must be in 'READY_FOR_REVIEW' to reject. Current status: '{draft.status}'.")

        if expected_version != draft.version:
            raise ValueError(f"Stale version conflict: Current draft version is v{draft.version}, expected v{expected_version}.")

        if not ws.is_reviewer_or_above():
            raise ValueError("Unauthorized: Only reviewers, analysts, or administrators can reject submissions.")

        old_status = draft.status
        draft.status = "DRAFT_SAVED"
        draft.rejection_reason = reason.strip()
        draft.updated_at = datetime.now(timezone.utc)

        audit = PolicyApprovalAudit(
            organization_id=ws.organization_id,
            draft_id=draft.id,
            draft_version=draft.version,
            actor_id=ws.user.id,
            actor_name=ws.user.full_name or ws.user.username,
            action="SUBMISSION_REJECTED",
            previous_status=old_status,
            new_status="DRAFT_SAVED",
            comments=reason.strip(),
            metadata_snapshot={"title": draft.title},
        )
        db.add(audit)
        db.commit()
        db.refresh(draft)

        logger.info("Draft %s rejected by %s in workspace %s", draft.id, ws.user.id, ws.organization_id)
        return draft

    @classmethod
    def create_revision(cls, draft_id: uuid.UUID, db: Session, ws: WorkspaceContext) -> PolicyDraft:
        """
        Create a new editable revision from an APPROVED or PUBLISHED draft.
        Archives the prior approved/published snapshot and restarts the approval cycle.
        """
        draft = cls.get_draft(draft_id, db, ws)
        if draft.status not in ("APPROVED", "PUBLISHED"):
            raise ValueError(
                f"Cannot create revision from status '{draft.status}'. "
                "Draft must be 'APPROVED' or 'PUBLISHED' to branch a new revision."
            )

        history = list(draft.history or [])
        snapshot = {
            "version": draft.version,
            "title": draft.title,
            "status": draft.status,
            "sections": copy.deepcopy(draft.sections),
            "metadata_properties": copy.deepcopy(draft.metadata_properties),
            "approved_by": str(draft.approved_by) if draft.approved_by else None,
            "approved_at": draft.approved_at.isoformat() if draft.approved_at else None,
            "content_hash": draft.content_hash,
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "change_summary": f"Archived prior to starting new revision v{draft.version + 1}",
        }
        history.append(snapshot)
        draft.history = history
        flag_modified(draft, "history")

        old_status = draft.status
        old_version = draft.version
        draft.version += 1
        draft.status = "DRAFT_SAVED"
        draft.approved_by = None
        draft.approved_at = None
        draft.approved_version = None
        draft.content_hash = None
        draft.review_comments = None
        draft.rejection_reason = None
        draft.updated_at = datetime.now(timezone.utc)

        audit = PolicyApprovalAudit(
            organization_id=ws.organization_id,
            draft_id=draft.id,
            draft_version=draft.version,
            actor_id=ws.user.id,
            actor_name=ws.user.full_name or ws.user.username,
            action="DRAFT_RESUBMITTED",
            previous_status=old_status,
            new_status="DRAFT_SAVED",
            comments=f"Created new revision v{draft.version} from v{old_version}",
        )
        db.add(audit)
        db.commit()
        db.refresh(draft)

        logger.info("Draft %s advanced to revision v%s (status=DRAFT_SAVED)", draft.id, draft.version)
        return draft

    @classmethod
    def publish_draft(
        cls,
        draft_id: uuid.UUID,
        expected_version: int,
        effective_date: Optional[datetime],
        background_tasks: Optional[BackgroundTasks],
        db: Session,
        ws: WorkspaceContext,
    ) -> Tuple[PolicyDraft, Document]:
        """
        Publish an approved policy draft into the production LexisGraph Policies repository (Document table).
        Enforces content hash verification, idempotency, superseding older versions, and triggers indexing.
        """
        draft = cls.get_draft(draft_id, db, ws)

        # Idempotency check: if already published for this version and Document exists
        if draft.status == "PUBLISHED" and draft.published_policy_id:
            existing_doc = db.get(Document, draft.published_policy_id)
            if existing_doc:
                logger.info("Draft %s already published as document %s (idempotent return)", draft.id, existing_doc.id)
                return draft, existing_doc

        # Approval requirement
        if draft.status != "APPROVED":
            raise ValueError(
                f"Cannot publish draft in status '{draft.status}'. "
                "Draft must be explicitly 'APPROVED' before publication."
            )

        if expected_version != draft.version:
            raise ValueError(
                f"Stale version conflict: Current draft version is v{draft.version}, expected v{expected_version}."
            )

        # Role authorization: minimum Analyst or Admin
        if not ws.is_analyst_or_admin():
            raise ValueError("Publishing requires Compliance Analyst or Administrator authority.")

        # Content integrity verification
        current_hash = cls.compute_draft_content_hash(draft.sections)
        if draft.content_hash and current_hash != draft.content_hash:
            raise ValueError(
                "Content integrity violation: Draft content has been altered since approval. "
                "A new revision and formal approval cycle is mandatory."
            )

        # Compile policy sections into structured text
        meta = draft.metadata_properties or {}
        policy_code = meta.get("policy_identifier") or f"POL-{draft.need_id.replace('need-', '').upper()}"
        review_cadence = meta.get("review_cadence", "Annual")

        lines = [
            f"# {draft.title}",
            f"**Policy Identifier:** {policy_code}",
            f"**Status:** Published (Stage 5 Policy Formation)",
            f"**Draft Version:** v{draft.version}.0",
            f"**Effective Date:** {effective_date.isoformat() if effective_date else 'Immediate'}",
            f"**Review Cadence:** {review_cadence}",
            f"**Content SHA-256:** {current_hash}",
            "\n---\n",
        ]
        for sec in draft.sections or []:
            lines.append(f"## {sec.get('section_number', '')} {sec.get('heading', '')}\n")
            lines.append(f"{sec.get('content', '')}\n")
        compiled_text = "\n".join(lines)

        # Determine lifecycle status based on effective date
        now_utc = datetime.now(timezone.utc)
        is_future = effective_date and effective_date > now_utc
        lifecycle_status = "PENDING_EFFECTIVE" if is_future else "ACTIVE"

        # Store in storage/uploads/policies
        clean_title = re.sub(r"[^a-zA-Z0-9_-]", "_", draft.title)
        filename = f"{policy_code}_{clean_title}.txt"
        stored_meta = store_published_policy_content(compiled_text, filename)

        # Supersede prior published documents for the same policy identifier in this workspace
        prior_policies = db.query(Document).filter(
            Document.organization_id == ws.organization_id,
            Document.document_type == DocumentType.POLICY,
            Document.policy_identifier == policy_code,
            Document.lifecycle_status.in_(["ACTIVE", "PENDING_EFFECTIVE"]),
        ).all()

        for prior_p in prior_policies:
            old_lifecycle = prior_p.lifecycle_status
            prior_p.lifecycle_status = "SUPERSEDED"
            prior_p.updated_at = now_utc
            super_audit = PolicyApprovalAudit(
                organization_id=ws.organization_id,
                policy_document_id=prior_p.id,
                draft_id=draft.id,
                draft_version=draft.version,
                actor_id=ws.user.id,
                actor_name=ws.user.full_name or ws.user.username,
                action="PUBLISHED_VERSION_SUPERSEDED",
                previous_status=old_lifecycle,
                new_status="SUPERSEDED",
                comments=f"Superseded by newly published approved version v{draft.version}",
            )
            db.add(super_audit)

        # Compute next review date
        from datetime import timedelta
        base_review_date = effective_date or now_utc
        if "annual" in review_cadence.lower():
            next_review = base_review_date + timedelta(days=365)
        elif "semi" in review_cadence.lower() or "6" in review_cadence:
            next_review = base_review_date + timedelta(days=182)
        elif "quarter" in review_cadence.lower():
            next_review = base_review_date + timedelta(days=90)
        else:
            next_review = base_review_date + timedelta(days=365)

        try:
            # Create new Document in production Policies repository
            doc = Document(
                organization_id=ws.organization_id,
                uploaded_by=ws.user.id,
                original_filename=filename,
                stored_filename=stored_meta.stored_filename,
                file_path=stored_meta.path,
                file_size=stored_meta.size,
                mime_type="text/plain",
                checksum=stored_meta.checksum,
                document_type=DocumentType.POLICY,
                processing_status=ProcessingStatus.UPLOADED,
                policy_identifier=policy_code,
                effective_date=effective_date,
                review_cadence=review_cadence,
                next_review_date=next_review,
                source_draft_id=draft.id,
                lifecycle_status=lifecycle_status,
            )
            db.add(doc)
            db.flush()

            # Update draft state
            old_status = draft.status
            draft.status = "PUBLISHED"
            draft.published_policy_id = doc.id
            draft.published_at = now_utc
            draft.effective_date = effective_date
            draft.updated_at = now_utc

            # Record audit
            pub_audit = PolicyApprovalAudit(
                organization_id=ws.organization_id,
                policy_document_id=doc.id,
                draft_id=draft.id,
                draft_version=draft.version,
                actor_id=ws.user.id,
                actor_name=ws.user.full_name or ws.user.username,
                action="POLICY_PUBLISHED",
                previous_status=old_status,
                new_status="PUBLISHED",
                comments=f"Published to Policies repository as {filename} (status: {lifecycle_status})",
                content_hash=current_hash,
                metadata_snapshot={
                    "document_id": str(doc.id),
                    "policy_identifier": policy_code,
                    "lifecycle_status": lifecycle_status,
                    "effective_date": effective_date.isoformat() if effective_date else None,
                },
            )
            db.add(pub_audit)
            db.commit()
            db.refresh(draft)
            db.refresh(doc)
        except Exception:
            db.rollback()
            if stored_meta and getattr(stored_meta, "path", None):
                delete_stored_file(stored_meta.path)
            raise

        # Enqueue background document processor
        if background_tasks:
            try:
                background_tasks.add_task(process_document, doc.id)
                logger.info("Enqueued document processing pipeline for published policy %s", doc.id)
            except Exception as exc:
                logger.warning("Failed to enqueue background processing for doc %s: %s", doc.id, exc)

        logger.info(
            "Successfully published PolicyDraft %s as Document %s in workspace %s",
            draft.id,
            doc.id,
            ws.organization_id,
        )
        return draft, doc

    @classmethod
    def get_approval_history(
        cls, draft_id: uuid.UUID, db: Session, ws: WorkspaceContext
    ) -> List[PolicyApprovalAudit]:
        """Retrieve immutable audit trail for a draft in the active workspace."""
        cls.get_draft(draft_id, db, ws)  # tenant isolation check
        return (
            db.query(PolicyApprovalAudit)
            .filter(
                PolicyApprovalAudit.organization_id == ws.organization_id,
                PolicyApprovalAudit.draft_id == draft_id,
            )
            .order_by(PolicyApprovalAudit.created_at.desc())
            .all()
        )

    @classmethod
    def retry_ai_generation(
        cls, draft_id: uuid.UUID, db: Session, ws: WorkspaceContext
    ) -> PolicyDraft:
        """
        Retry AI LLM generation for a draft that previously used template fallback,
        strictly preserving any custom user edits.
        """
        draft = cls.get_draft(draft_id, db, ws)
        if draft.status in ("READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "SUPERSEDED"):
            raise ValueError(f"Cannot regenerate or retry AI for draft in status '{draft.status}'.")

        sections = list(draft.sections or [])
        core_sec_idx = next((i for i, s in enumerate(sections) if s.get("section_id") == "sec-core-requirements"), None)
        if core_sec_idx is None:
            raise ValueError("Core requirements section not found in draft.")

        core_sec = sections[core_sec_idx]
        # Do not overwrite if user has manually edited it
        if core_sec.get("is_customized"):
            raise ValueError("Core requirements section contains manual customizations; skipping overwrite to preserve user edits.")

        source_refs = draft.source_references or []
        llm_prompt = (
            f"You are LexisGraph AI Legal Policy Drafter. Enrich the mandatory commitments section for an organization policy.\n"
            f"Policy: {draft.title}\n"
            f"Statutory Provisions: {', '.join([p for s in source_refs for p in s.get('provisions', [])[:3]])}\n"
            f"Provide 4 concise, professional policy statements formatted as markdown numbered points. Do NOT invent fake legal citations."
        )

        enriched_text = None
        try:
            enriched_text = _resolve_reasoning(llm_prompt)
        except Exception as e:
            raise ValueError(f"AI provider call failed on retry: {str(e)}")

        if not enriched_text or len(enriched_text.strip()) < 80:
            raise ValueError("AI provider returned insufficient response on retry. Template content retained.")

        core_sec["content"] = enriched_text.strip()
        core_sec["last_regenerated_at"] = datetime.now(timezone.utc).isoformat()
        sections[core_sec_idx] = core_sec

        gen_telemetry = dict(draft.generation_metadata or {})
        gen_telemetry["generator"] = "lexisgraph-ai-policy-drafter"
        gen_telemetry["generation_method"] = "ai_llm_generated"
        gen_telemetry["is_template_fallback"] = False
        gen_telemetry["fallback_reason"] = None
        gen_telemetry["llm_enhanced"] = True
        gen_telemetry["provider"] = "gemini_or_openrouter"
        gen_telemetry["last_retry_at"] = datetime.now(timezone.utc).isoformat()

        draft.sections = sections
        flag_modified(draft, "sections")
        draft.generation_metadata = gen_telemetry
        flag_modified(draft, "generation_metadata")
        draft.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(draft)
        logger.info("Successfully retried AI generation for draft %s in workspace %s", draft.id, ws.organization_id)
        return draft

    @classmethod
    def sync_effective_policy_lifecycles(cls, db: Session, organization_id: Optional[uuid.UUID] = None) -> int:
        """
        Transition any PENDING_EFFECTIVE policy whose effective_date has arrived (effective_date <= now_utc)
        to ACTIVE. Can be scoped to a single organization or run globally across workspaces.
        Safe under concurrency and idempotent.
        """
        now_utc = datetime.now(timezone.utc)
        query = db.query(Document).filter(
            Document.document_type == DocumentType.POLICY,
            Document.lifecycle_status == "PENDING_EFFECTIVE",
            Document.effective_date.isnot(None),
            Document.effective_date <= now_utc,
        )
        if organization_id:
            query = query.filter(Document.organization_id == organization_id)

        matured = query.all()
        count = 0
        for doc in matured:
            doc.lifecycle_status = "ACTIVE"
            doc.updated_at = now_utc
            count += 1
        if count > 0:
            db.commit()
            logger.info("Transitioned %d matured PENDING_EFFECTIVE policies to ACTIVE", count)
        return count



