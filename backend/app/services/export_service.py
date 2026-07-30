from io import BytesIO
from typing import Any

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _safe_text(text: Any, max_chars: int = 1000) -> str:
    """Escape XML special characters so ReportLab Paragraph doesn't crash."""
    import html
    s = str(text or "").strip()
    if max_chars:
        s = s[:max_chars]
    return html.escape(s)


def _entities_to_text(entities: Any) -> str:
    if not isinstance(entities, list):
        return ""

    parts: list[str] = []
    for item in entities:
        if isinstance(item, dict):
            text = str(item.get("text", "")).strip()
            label = str(item.get("label", "")).strip()
            if text and label:
                parts.append(f"{text} ({label})")
            elif text:
                parts.append(text)
        elif item:
            parts.append(str(item))

    return ", ".join(parts)


def export_to_excel(data: list[dict]) -> BytesIO:
    """Export flattened clause records to an Excel workbook."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Clauses"

    headers = [
        "Document Title",
        "Source Type",
        "Clause Text",
        "Clause Type",
        "Entities",
        "Date",
    ]
    sheet.append(headers)

    for document in data:
        title = str(document.get("title", "Untitled"))
        source_type = str(document.get("source_type", ""))
        date = str(document.get("date", ""))
        clauses = document.get("clauses") or []

        for clause in clauses:
            clause_text = str(clause.get("text", "")) if isinstance(clause, dict) else ""
            clause_type = str(clause.get("type", "")) if isinstance(clause, dict) else ""
            entities = _entities_to_text(clause.get("entities")) if isinstance(clause, dict) else ""

            sheet.append(
                [
                    title,
                    source_type,
                    clause_text,
                    clause_type,
                    entities,
                    date,
                ]
            )

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output


def export_to_pdf(data: list[dict]) -> BytesIO:
    """Export document and clause data to a readable PDF report."""
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4)
    styles = getSampleStyleSheet()

    elements = [
        Paragraph("LexisGraph Compliance Data Report", styles["Title"]),
        Spacer(1, 12),
    ]

    for item in data:
        title = str(item.get("title", "Untitled"))
        source_type = str(item.get("source_type", ""))
        date = str(item.get("date", ""))
        clauses = item.get("clauses") or []

        elements.append(Paragraph(f"Title: {title}", styles["Heading3"]))
        elements.append(Paragraph(f"Source Type: {source_type}", styles["Normal"]))
        elements.append(Paragraph(f"Date: {date}", styles["Normal"]))
        elements.append(Spacer(1, 6))

        for index, clause in enumerate(clauses, start=1):
            if not isinstance(clause, dict):
                continue

            clause_text = str(clause.get("text", "")).strip()
            clause_type = str(clause.get("type", "")).strip()
            entities = _entities_to_text(clause.get("entities"))

            elements.append(Paragraph(f"Clause {index}: {clause_text}", styles["Normal"]))
            elements.append(Paragraph(f"Type: {clause_type}", styles["Normal"]))
            elements.append(Paragraph(f"Entities: {entities or 'N/A'}", styles["Normal"]))
            elements.append(Spacer(1, 8))

        elements.append(Spacer(1, 14))

    document.build(elements)
    output.seek(0)
    return output


def export_compliance_report_pdf(report_dict: dict) -> BytesIO:
    """
    Generate a comprehensive PDF export for a compliance report.
    Includes: Organization, Documents Analyzed, Compliance Score, Risk Level,
    Summary, Clause Analysis, Recommendations, Citations, and Timestamp.
    """
    import json
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle

    output = BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Title"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1e1b4b"),
        alignment=0,
    )
    h2_style = ParagraphStyle(
        "DocH2",
        parent=styles["Heading2"],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#312e81"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "DocBody",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1f2937"),
    )
    cell_style = ParagraphStyle(
        "DocCell",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#374151"),
    )
    cell_bold_style = ParagraphStyle(
        "DocCellBold",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#111827"),
    )

    elements = []

    # Title
    elements.append(Paragraph("LexisGraph Compliance Audit Report", title_style))
    elements.append(Spacer(1, 4))

    # Metadata Bar: Report ID, Timestamp
    report_id = str(report_dict.get("id", "N/A"))
    created_at = str(report_dict.get("created_at", "N/A"))
    meta_text = f"Report ID: {report_id} | Timestamp: {created_at}"
    elements.append(Paragraph(_safe_text(meta_text, 0), ParagraphStyle("Meta", parent=body_style, fontSize=8, textColor=colors.HexColor("#6b7280"))))
    elements.append(Spacer(1, 10))

    # Section 1: Overview & Metadata Table
    org_name = _safe_text(report_dict.get("organization_name", report_dict.get("organization_id", "N/A")), 0)
    reg_name = _safe_text(report_dict.get("regulation_document_name", report_dict.get("regulation_document_id", "N/A")), 0)
    policy_name = _safe_text(report_dict.get("policy_document_name", report_dict.get("policy_document_id", "N/A")), 0)
    score = report_dict.get("overall_score")
    score_str = f"{score:.1f}%" if isinstance(score, (int, float)) else "N/A"

    meta_table_data = [
        [Paragraph("Organization", cell_bold_style), Paragraph(org_name, cell_style)],
        [Paragraph("Regulation Document", cell_bold_style), Paragraph(reg_name, cell_style)],
        [Paragraph("Policy Document", cell_bold_style), Paragraph(policy_name, cell_style)],
        [Paragraph("Compliance Score", cell_bold_style), Paragraph(score_str, cell_bold_style)],
        [Paragraph("Status", cell_bold_style), Paragraph(_safe_text(report_dict.get("status", "COMPLETED"), 0), cell_style)],
    ]
    meta_table = Table(meta_table_data, colWidths=[130, 390])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 5),
        ])
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    # Section 2: Executive Summary
    details = report_dict.get("details") or {}
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except Exception:
            details = {}

    summary_text = report_dict.get("summary") or details.get("summary") or "No executive summary provided."
    elements.append(Paragraph("Executive Summary", h2_style))
    elements.append(Paragraph(_safe_text(summary_text, 2000), body_style))
    elements.append(Spacer(1, 12))

    # Section 3: Clause-by-Clause Analysis Table
    clauses = details.get("evaluated_clauses") or []
    if clauses:
        elements.append(Paragraph("Clause-by-Clause Evaluation", h2_style))
        clause_table_data = [
            [
                Paragraph("Status", cell_bold_style),
                Paragraph("Regulation Requirement", cell_bold_style),
                Paragraph("Matched Policy Clause", cell_bold_style),
                Paragraph("Score", cell_bold_style),
            ]
        ]
        for c in clauses:
            status_val = _safe_text(c.get("status", "N/A"), 0)
            reg_text = _safe_text(c.get("regulation_text", ""), 400)
            pol_text = _safe_text(c.get("matched_policy_text") or "No policy match", 400)
            sim_score = c.get("similarity_score", 0.0)
            sim_str = f"{float(sim_score) * 100:.0f}%"

            clause_table_data.append([
                Paragraph(status_val, cell_style),
                Paragraph(reg_text, cell_style),
                Paragraph(pol_text, cell_style),
                Paragraph(sim_str, cell_style),
            ])

        clause_table = Table(clause_table_data, colWidths=[80, 200, 200, 40])
        clause_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 4),
            ])
        )
        elements.append(clause_table)
        elements.append(Spacer(1, 12))

    # Section 4: Actionable Recommendations
    recommendations = details.get("recommendations") or []
    if recommendations:
        elements.append(Paragraph("Recommendations", h2_style))
        for i, rec in enumerate(recommendations, start=1):
            elements.append(Paragraph(f"{i}. {_safe_text(rec, 500)}", body_style))
            elements.append(Spacer(1, 3))
        elements.append(Spacer(1, 10))

    # Section 5: Citations & Disclaimers
    elements.append(Paragraph("Citations &amp; Disclaimers", h2_style))
    citation_text = (
        f"This compliance report was automatically generated by LexisGraph GraphRAG Engine on {_safe_text(created_at, 0)}. "
        f"Sources: Regulation Document ({reg_name}), Policy Document ({policy_name}). "
        f"All evaluations are derived from semantic vector embeddings and graph node relationships."
    )
    elements.append(Paragraph(citation_text, ParagraphStyle("Cite", parent=body_style, fontSize=8, textColor=colors.HexColor("#4b5563"))))

    doc.build(elements)
    output.seek(0)
    return output

