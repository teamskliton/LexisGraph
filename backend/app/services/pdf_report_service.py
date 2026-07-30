"""
PDF Report Generation Service using ReportLab.
Converts stored PostgreSQL compliance report records into clean, professional A4 PDFs.
Never calls LLM or recomputes compliance logic.
"""
from __future__ import annotations

import io
import json
import html
import logging
from datetime import datetime
from typing import Any, List, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)


def _calculate_risk_level(score: Optional[float]) -> tuple[str, colors.Color]:
    """Calculate risk level label and color from score."""
    if score is None:
        return "HIGH RISK", colors.HexColor("#ef4444")
    
    val = score * 100 if (score <= 1.0 and score > 0) else score
    if val >= 85:
        return "LOW RISK", colors.HexColor("#10b981")  # Emerald
    elif val >= 70:
        return "MEDIUM RISK", colors.HexColor("#f59e0b")  # Amber
    elif val >= 50:
        return "HIGH RISK", colors.HexColor("#f97316")  # Orange
    else:
        return "CRITICAL RISK", colors.HexColor("#ef4444")  # Red


def generate_compliance_report_pdf(report: Any) -> bytes:
    """
    Generates a PDF document for a compliance report using ReportLab flowables.
    Returns binary PDF bytes.
    """
    buffer = io.BytesIO()

    # Setup A4 document template with 0.5 inch margins
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#1e293b"),
        alignment=0,
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748b"),
    )

    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=8,
        spaceAfter=4,
    )

    body_style = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#334155"),
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1e293b"),
    )

    story = []

    # -------------------------------------------------------------------------
    # Header: Title & LexisGraph Branding
    # -------------------------------------------------------------------------
    header_data = [
        [
            Paragraph("LexisGraph Compliance Report", title_style),
            Paragraph(
                "<b>PLATFORM REPORT</b><br/><font color='#64748b'>Automated Legal Compliance Analysis</font>",
                ParagraphStyle("BrandRight", parent=subtitle_style, alignment=2),
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=[340, 180])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(header_table)
    story.append(
        HRFlowable(width="100%", thickness=2, color=colors.HexColor("#4f46e5"), spaceAfter=12)
    )

    # -------------------------------------------------------------------------
    # Section 1: Report Metadata (Organization, Policy, Regulation, Date, ID)
    # -------------------------------------------------------------------------
    report_id_str = str(getattr(report, "id", "N/A"))
    org_id_str = str(getattr(report, "organization_id", "N/A"))
    # Model column is regulation_id; regulation_document_id is a frontend alias
    reg_id_str = str(getattr(report, "regulation_id", None) or getattr(report, "regulation_document_id", "N/A"))
    pol_id_str = str(getattr(report, "policy_document_id", "N/A"))

    created_at_val = getattr(report, "created_at", None)
    if isinstance(created_at_val, datetime):
        gen_date_str = created_at_val.strftime("%B %d, %Y - %H:%M:%S UTC")
    else:
        gen_date_str = str(created_at_val or "N/A")

    status_str = str(getattr(report, "report_status", "COMPLETED")).upper()

    meta_table_data = [
        [
            Paragraph("<b>Report ID:</b>", table_header_style),
            Paragraph(report_id_str, table_cell_style),
            Paragraph("<b>Generated Date:</b>", table_header_style),
            Paragraph(gen_date_str, table_cell_style),
        ],
        [
            Paragraph("<b>Organization:</b>", table_header_style),
            Paragraph(org_id_str, table_cell_style),
            Paragraph("<b>Status:</b>", table_header_style),
            Paragraph(f"<b>{status_str}</b>", table_cell_style),
        ],
        [
            Paragraph("<b>Regulation Document:</b>", table_header_style),
            Paragraph(reg_id_str, table_cell_style),
            Paragraph("<b>Policy Document:</b>", table_header_style),
            Paragraph(pol_id_str, table_cell_style),
        ],
    ]

    meta_table = Table(meta_table_data, colWidths=[110, 150, 110, 150])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # Section 2: Overall Compliance Score & Risk Level
    # -------------------------------------------------------------------------
    raw_score = getattr(report, "overall_score", None)
    if raw_score is not None:
        num_score = Math_round_score = (
            round(raw_score * 100) if (raw_score <= 1.0 and raw_score > 0) else round(raw_score)
        )
        score_display = f"{num_score}%"
    else:
        score_display = "N/A"

    risk_label, risk_color = _calculate_risk_level(raw_score)

    score_style = ParagraphStyle(
        "ScoreLarge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=32,
        textColor=colors.HexColor("#1e293b"),
        alignment=1,
    )

    risk_style = ParagraphStyle(
        "RiskBadge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=risk_color,
        alignment=1,
    )

    score_card_data = [
        [
            Paragraph("OVERALL COMPLIANCE SCORE", ParagraphStyle("ScoreHead", parent=table_header_style, alignment=1)),
            Paragraph("EVALUATED RISK LEVEL", ParagraphStyle("RiskHead", parent=table_header_style, alignment=1)),
        ],
        [
            Paragraph(score_display, score_style),
            Paragraph(risk_label, risk_style),
        ],
    ]

    score_table = Table(score_card_data, colWidths=[260, 260])
    score_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(score_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # Section 3: Executive Summary
    # -------------------------------------------------------------------------
    story.append(Paragraph("Executive Summary", section_heading))
    summary_raw = getattr(report, "summary", None) or "No executive summary available for this report."
    # report.summary now stores full result JSON — extract the readable text from it
    if summary_raw and summary_raw.strip().startswith("{"):
        try:
            summary_json = json.loads(summary_raw)
            summary_raw = summary_json.get("summary") or summary_raw
        except Exception:
            pass
    summary_text = html.escape(str(summary_raw)[:3000])

    summary_card_data = [[Paragraph(summary_text, body_style)]]
    summary_table = Table(summary_card_data, colWidths=[520])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # Section 4: Clause Statistics
    # -------------------------------------------------------------------------
    story.append(Paragraph("Clause Evaluation Statistics", section_heading))

    total_c = getattr(report, "total_clauses", 0) or 0
    compliant_c = getattr(report, "compliant_clauses", 0) or 0
    partial_c = getattr(report, "partial_clauses", 0) or 0
    non_compliant_c = getattr(report, "non_compliant_clauses", 0) or 0

    stats_table_data = [
        [
            Paragraph("<b>Total Clauses</b>", table_header_style),
            Paragraph("<b>Compliant</b>", ParagraphStyle("G", parent=table_header_style, textColor=colors.HexColor("#059669"))),
            Paragraph("<b>Partially Compliant</b>", ParagraphStyle("Y", parent=table_header_style, textColor=colors.HexColor("#d97706"))),
            Paragraph("<b>Non-Compliant</b>", ParagraphStyle("R", parent=table_header_style, textColor=colors.HexColor("#dc2626"))),
        ],
        [
            Paragraph(f"<b>{total_c}</b>", table_cell_style),
            Paragraph(f"<b>{compliant_c}</b>", table_cell_style),
            Paragraph(f"<b>{partial_c}</b>", table_cell_style),
            Paragraph(f"<b>{non_compliant_c}</b>", table_cell_style),
        ],
    ]

    stats_table = Table(stats_table_data, colWidths=[130, 130, 130, 130])
    stats_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#ffffff")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(stats_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # Section 5: Recommendations
    # -------------------------------------------------------------------------
    story.append(Paragraph("Actionable Recommendations", section_heading))

    recs_raw = getattr(report, "recommendations", None)
    parsed_recs: list[str] = []

    if recs_raw:
        if isinstance(recs_raw, list):
            for item in recs_raw:
                if isinstance(item, str):
                    parsed_recs.append(item)
                elif isinstance(item, dict):
                    title = item.get("title") or item.get("recommendation") or item.get("action") or str(item)
                    parsed_recs.append(title)
                else:
                    parsed_recs.append(str(item))
        elif isinstance(recs_raw, dict):
            for k, v in recs_raw.items():
                parsed_recs.append(f"{k}: {v}")
        elif isinstance(recs_raw, str):
            parsed_recs.append(recs_raw)

    if not parsed_recs:
        parsed_recs = ["No actionable recommendations listed for this report."]

    rec_table_rows = []
    for idx, rec_text in enumerate(parsed_recs, start=1):
        rec_table_rows.append(
            [
                Paragraph(f"<b>{idx}.</b>", ParagraphStyle("RecNum", parent=table_header_style, textColor=colors.HexColor("#4f46e5"))),
                Paragraph(html.escape(str(rec_text)[:600]), body_style),
            ]
        )

    rec_table = Table(rec_table_rows, colWidths=[24, 496])
    rec_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(rec_table)
    story.append(Spacer(1, 18))

    # -------------------------------------------------------------------------
    # Section 6: Report Footer (Generated by LexisGraph, Timestamp)
    # -------------------------------------------------------------------------
    story.append(
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=6)
    )
    timestamp_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    footer_text = f"<b>Generated by LexisGraph Compliance Platform</b> &bull; Exported at {timestamp_str}"
    footer_para = Paragraph(
        footer_text,
        ParagraphStyle("Footer", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#94a3b8"), alignment=1),
    )
    story.append(footer_para)

    # Build PDF into memory buffer
    doc.build(story)

    buffer.seek(0)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
