"""
Professional PDF Generation Service for Compliance Management Reports (Sprint 7.14).
Uses ReportLab flowables to build clean, deterministic, multi-page A4 compliance reports.
"""
from __future__ import annotations

import io
import html
from datetime import datetime
from typing import Any, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.compliance_management_report import ComplianceManagementReportResponse

# Brand Colors
PRIMARY_COLOR = colors.HexColor("#0f172a")     # Slate 900
SECONDARY_COLOR = colors.HexColor("#334155")   # Slate 700
ACCENT_BLUE = colors.HexColor("#2563eb")       # Blue 600
ACCENT_CRITICAL = colors.HexColor("#e11d48")   # Rose 600
ACCENT_HIGH = colors.HexColor("#ea580c")       # Orange 600
ACCENT_MEDIUM = colors.HexColor("#d97706")     # Amber 600
ACCENT_LOW = colors.HexColor("#16a34a")        # Emerald 600
BG_MUTED = colors.HexColor("#f8fafc")          # Slate 50
BORDER_COLOR = colors.HexColor("#e2e8f0")      # Slate 200


class NumberedCanvas:
    """Canvas that performs a two-pass calculation of total pages to write 'Page X of Y'."""
    def __init__(self, *args, **kwargs):
        pass


def _escape(text: Optional[str]) -> str:
    """Escapes HTML entities for ReportLab Paragraph rendering."""
    if not text:
        return ""
    return html.escape(str(text))


def generate_management_report_pdf(report_data: ComplianceManagementReportResponse) -> bytes:
    """
    Renders a structured, multi-page A4 compliance report PDF from deterministic data.
    """
    buffer = io.BytesIO()

    # 36 pt (0.5 in) margins
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=PRIMARY_COLOR,
        alignment=0,
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=ACCENT_BLUE,
    )

    meta_label_style = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=SECONDARY_COLOR,
    )

    meta_value_style = ParagraphStyle(
        "MetaValue",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=PRIMARY_COLOR,
    )

    section_header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=PRIMARY_COLOR,
        spaceBefore=10,
        spaceAfter=4,
    )

    subsection_header_style = ParagraphStyle(
        "SubsectionHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=SECONDARY_COLOR,
        spaceBefore=6,
        spaceAfter=3,
    )

    body_style = ParagraphStyle(
        "BodyTextRegular",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=PRIMARY_COLOR,
    )

    body_muted_style = ParagraphStyle(
        "BodyTextMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=PRIMARY_COLOR,
    )

    table_cell_bold_style = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=10,
        textColor=PRIMARY_COLOR,
    )

    metric_val_style = ParagraphStyle(
        "MetricValue",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=17,
        textColor=PRIMARY_COLOR,
        alignment=1,
    )

    metric_lbl_style = ParagraphStyle(
        "MetricLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=9,
        textColor=SECONDARY_COLOR,
        alignment=1,
    )

    story: List[Any] = []

    # =========================================================================
    # PAGE 1: COVER & EXECUTIVE SUMMARY
    # =========================================================================
    story.append(Paragraph("LEXISGRAPH COMPLIANCE PLATFORM", subtitle_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph(_escape(report_data.report_title), title_style))
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=2, color=ACCENT_BLUE, spaceAfter=8, spaceBefore=2))

    # Metadata grid
    meta_table_data = [
        [
            Paragraph("Organization:", meta_label_style),
            Paragraph(_escape(report_data.organization_name), meta_value_style),
            Paragraph("Reporting Period:", meta_label_style),
            Paragraph(_escape(report_data.reporting_period), meta_value_style),
        ],
        [
            Paragraph("Generated Date:", meta_label_style),
            Paragraph(_escape(report_data.generated_at.strftime("%d %b %Y, %H:%M UTC")), meta_value_style),
            Paragraph("Generated By:", meta_label_style),
            Paragraph(f"{_escape(report_data.generated_by_name)} ({_escape(report_data.generated_by_role or 'User')})", meta_value_style),
        ],
    ]
    meta_table = Table(meta_table_data, colWidths=[80, 180, 85, 175])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_MUTED),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # Executive Overview Header
    story.append(Paragraph("1. Executive Summary & Core Metrics", section_header_style))
    story.append(Paragraph(
        "The following metrics summarize the organization's compliance findings, active remediation workflows, and continuous reassessment status based on verified records in the LexisGraph compliance engine.",
        body_muted_style,
    ))
    story.append(Spacer(1, 6))

    # Metric Callout Cards Grid (2 rows x 4 cols)
    m = report_data.executive_metrics
    metrics_row1 = [
        [Paragraph(str(m.total_findings), metric_val_style), Paragraph("TOTAL FINDINGS", metric_lbl_style)],
        [Paragraph(str(m.open_findings), metric_val_style), Paragraph("UNRESOLVED", metric_lbl_style)],
        [Paragraph(str(m.critical_findings), metric_val_style), Paragraph("CRITICAL SEVERITY", metric_lbl_style)],
        [Paragraph(str(m.high_findings), metric_val_style), Paragraph("HIGH SEVERITY", metric_lbl_style)],
    ]
    metrics_row2 = [
        [Paragraph(str(m.under_remediation), metric_val_style), Paragraph("IN REMEDIATION", metric_lbl_style)],
        [Paragraph(str(m.needs_reassessment), metric_val_style), Paragraph("REASSESSMENT REQ.", metric_lbl_style)],
        [Paragraph(str(m.resolved_findings), metric_val_style), Paragraph("RESOLVED", metric_lbl_style)],
        [Paragraph(f"{m.resolution_rate_percentage}%", metric_val_style), Paragraph("RESOLUTION RATE", metric_lbl_style)],
    ]

    def _render_metric_cell(cell_content):
        t = Table([[cell_content[0]], [cell_content[1]]], colWidths=[122])
        t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        return t

    metric_grid_data = [
        [_render_metric_cell(c) for c in metrics_row1],
        [_render_metric_cell(c) for c in metrics_row2],
    ]
    metric_table = Table(metric_grid_data, colWidths=[130, 130, 130, 130])
    metric_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_MUTED),
        ("BOX", (0, 0), (-1, -1), 1, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(metric_table)
    story.append(Spacer(1, 10))

    # Applied Filters Note
    af = report_data.applied_filters
    filter_desc = f"<b>Applied Filters:</b> Period: {af.get('date_range', 'All Time')} | Severity: {af.get('severity', 'All')} | Lifecycle Status: {af.get('lifecycle_status', 'All')}"
    story.append(Paragraph(filter_desc, body_muted_style))
    story.append(Spacer(1, 10))

    if m.total_findings == 0:
        story.append(Spacer(1, 20))
        story.append(Paragraph(
            "<b>Note:</b> No compliance findings were recorded for the selected organization and reporting filters.",
            body_style,
        ))

    # =========================================================================
    # PAGE 2: STATUS & SEVERITY DISTRIBUTIONS & TRENDS
    # =========================================================================
    story.append(PageBreak())
    story.append(Paragraph("2. Finding Distribution & Historical Trends", section_header_style))
    story.append(Spacer(1, 4))

    # Status Distribution Table
    story.append(Paragraph("Finding Status Distribution", subsection_header_style))
    status_table_data = [
        [Paragraph("Lifecycle Status", table_header_style), Paragraph("Count", table_header_style), Paragraph("Percentage", table_header_style)]
    ]
    for item in report_data.status_distribution:
        status_table_data.append([
            Paragraph(_escape(item.label), table_cell_bold_style),
            Paragraph(str(item.count), table_cell_style),
            Paragraph(f"{item.percentage}%", table_cell_style),
        ])
    status_table = Table(status_table_data, colWidths=[240, 140, 140])
    status_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]))
    story.append(status_table)
    story.append(Spacer(1, 10))

    # Severity Distribution Table
    story.append(Paragraph("Severity Distribution", subsection_header_style))
    sev_table_data = [
        [Paragraph("Severity Tier", table_header_style), Paragraph("Count", table_header_style), Paragraph("Percentage", table_header_style)]
    ]
    for item in report_data.severity_distribution:
        sev_table_data.append([
            Paragraph(_escape(item.label), table_cell_bold_style),
            Paragraph(str(item.count), table_cell_style),
            Paragraph(f"{item.percentage}%", table_cell_style),
        ])
    sev_table = Table(sev_table_data, colWidths=[240, 140, 140])
    sev_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SECONDARY_COLOR),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]))
    story.append(sev_table)
    story.append(Spacer(1, 10))

    # Historical Trend Summary
    story.append(Paragraph("Finding Creation vs. Resolution Trend", subsection_header_style))
    if not report_data.has_sufficient_history or len(report_data.trend_summary) == 0:
        story.append(Paragraph("<i>Insufficient historical trend data for the selected period.</i>", body_muted_style))
    else:
        trend_table_data = [
            [Paragraph("Date", table_header_style), Paragraph("Findings Created", table_header_style), Paragraph("Findings Resolved", table_header_style)]
        ]
        for pt in report_data.trend_summary[:10]:
            trend_table_data.append([
                Paragraph(_escape(pt.date), table_cell_style),
                Paragraph(str(pt.created_count), table_cell_style),
                Paragraph(str(pt.resolved_count), table_cell_style),
            ])
        trend_table = Table(trend_table_data, colWidths=[200, 160, 160])
        trend_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ACCENT_BLUE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        story.append(trend_table)

    # =========================================================================
    # PAGE 3: HIGH-RISK UNRESOLVED FINDINGS
    # =========================================================================
    story.append(PageBreak())
    story.append(Paragraph("3. High-Risk Unresolved Findings", section_header_style))
    story.append(Paragraph(
        "Top unresolved compliance findings prioritized by severity and aging. All items require active remediation or review.",
        body_muted_style,
    ))
    story.append(Spacer(1, 6))

    if not report_data.high_risk_findings:
        story.append(Paragraph("<i>No open or unresolved findings matching report criteria.</i>", body_muted_style))
    else:
        hr_table_data = [
            [
                Paragraph("ID", table_header_style),
                Paragraph("Title / Clause", table_header_style),
                Paragraph("Severity", table_header_style),
                Paragraph("Status", table_header_style),
                Paragraph("Policy / Document", table_header_style),
                Paragraph("Cycle", table_header_style),
                Paragraph("Age", table_header_style),
            ]
        ]
        for f in report_data.high_risk_findings[:12]:
            sev_color = ACCENT_CRITICAL if f.severity == "CRITICAL" else (ACCENT_HIGH if f.severity == "HIGH" else ACCENT_MEDIUM)
            hr_table_data.append([
                Paragraph(f"#{_escape(f.id[:6])}", table_cell_bold_style),
                Paragraph(_escape(f.title), table_cell_style),
                Paragraph(f"<b>{_escape(f.severity)}</b>", table_cell_style),
                Paragraph(_escape(f.lifecycle_status), table_cell_style),
                Paragraph(_escape(f.policy_name), table_cell_style),
                Paragraph(str(f.remediation_cycle), table_cell_style),
                Paragraph(f"{f.age_days}d", table_cell_style),
            ])
        hr_table = Table(hr_table_data, colWidths=[45, 175, 55, 65, 110, 35, 35])
        hr_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ]))
        story.append(hr_table)

    # =========================================================================
    # PAGE 4: REMEDIATION OPERATIONS SUMMARY
    # =========================================================================
    story.append(PageBreak())
    story.append(Paragraph("4. Remediation Operations Summary", section_header_style))
    story.append(Paragraph(
        "Status of remediation plans, review workflows, verification checkpoints, and multi-cycle remediation efforts.",
        body_muted_style,
    ))
    story.append(Spacer(1, 6))

    rem = report_data.remediation_summary
    rem_table_data = [
        [Paragraph("Remediation Stage / Metric", table_header_style), Paragraph("Count", table_header_style), Paragraph("Description", table_header_style)],
        [Paragraph("Pending Remediation", table_cell_bold_style), Paragraph(str(rem.pending_remediation_count), table_cell_style), Paragraph("Findings with remediation plan not started or actively in progress", table_cell_style)],
        [Paragraph("Submitted for Review", table_cell_bold_style), Paragraph(str(rem.submitted_for_review_count), table_cell_style), Paragraph("Remediation cycle submitted and awaiting Reviewer verification", table_cell_style)],
        [Paragraph("Verified by Reviewer", table_cell_bold_style), Paragraph(str(rem.verified_count), table_cell_style), Paragraph("Remediation cycle verified by Reviewer; pending Admin final approval", table_cell_style)],
        [Paragraph("Approved by Administrator", table_cell_bold_style), Paragraph(str(rem.approved_count), table_cell_style), Paragraph("Remediation cycle formally approved; eligible for finding resolution", table_cell_style)],
        [Paragraph("Rejected Cycles", table_cell_bold_style), Paragraph(str(rem.rejected_count), table_cell_style), Paragraph("Remediation cycles rejected during verification requiring rework", table_cell_style)],
        [Paragraph("Multiple Remediation Cycles", table_cell_bold_style), Paragraph(str(rem.multiple_cycles_count), table_cell_style), Paragraph("Findings that required 2 or more remediation cycles to resolve", table_cell_style)],
        [Paragraph("Total Cycles Executed", table_cell_bold_style), Paragraph(str(rem.total_cycles_completed), table_cell_style), Paragraph("Cumulative total of remediation review cycles processed", table_cell_style)],
    ]
    rem_table = Table(rem_table_data, colWidths=[150, 70, 300])
    rem_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SECONDARY_COLOR),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
    ]))
    story.append(rem_table)

    # =========================================================================
    # PAGE 5: REASSESSMENT & RESOLUTION SUMMARY
    # =========================================================================
    story.append(PageBreak())
    story.append(Paragraph("5. Continuous Reassessment & Resolution Summary", section_header_style))
    story.append(Spacer(1, 4))

    # Reassessment Subtable
    story.append(Paragraph("Continuous Compliance Reassessment", subsection_header_style))
    reass = report_data.reassessment_summary
    reass_table_data = [
        [Paragraph("Reassessment Status Metric", table_header_style), Paragraph("Count", table_header_style)],
        [Paragraph("Findings Currently Requiring Reassessment", table_cell_bold_style), Paragraph(str(reass.reassessment_required_count), table_cell_style)],
        [Paragraph("Findings Triggered for Reassessment in Period", table_cell_bold_style), Paragraph(str(reass.recently_reassessed_count), table_cell_style)],
        [Paragraph("Findings Reopened Following Reassessment", table_cell_bold_style), Paragraph(str(reass.reopened_after_reassessment_count), table_cell_style)],
        [Paragraph("Findings Kept Resolved Following Reassessment", table_cell_bold_style), Paragraph(str(reass.kept_resolved_after_reassessment_count), table_cell_style)],
    ]
    reass_table = Table(reass_table_data, colWidths=[380, 140])
    reass_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]))
    story.append(reass_table)
    story.append(Spacer(1, 10))

    # Resolution Subtable
    story.append(Paragraph("Finding Resolution & Reopening Operations", subsection_header_style))
    res = report_data.resolution_summary
    res_table_data = [
        [Paragraph("Resolution Activity Metric", table_header_style), Paragraph("Count", table_header_style)],
        [Paragraph("Findings Resolved During Reporting Period", table_cell_bold_style), Paragraph(str(res.resolved_during_period), table_cell_style)],
        [Paragraph("Findings Reopened During Reporting Period", table_cell_bold_style), Paragraph(str(res.reopened_during_period), table_cell_style)],
        [Paragraph("Findings Currently Resolved (Total Cumulative)", table_cell_bold_style), Paragraph(str(res.currently_resolved), table_cell_style)],
        [Paragraph("Findings Currently Unresolved (Total Cumulative)", table_cell_bold_style), Paragraph(str(res.currently_unresolved), table_cell_style)],
    ]
    res_table = Table(res_table_data, colWidths=[380, 140])
    res_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]))
    story.append(res_table)

    # =========================================================================
    # PAGE 6: POLICY & REGULATION GAP SUMMARY
    # =========================================================================
    story.append(PageBreak())
    story.append(Paragraph("6. Policy & Regulation Gap Analysis", section_header_style))
    story.append(Paragraph(
        "Identification of internal policy documents and external regulatory frameworks with the highest concentration of compliance gaps.",
        body_muted_style,
    ))
    story.append(Spacer(1, 6))

    # Policy Gaps Table
    story.append(Paragraph("Top Internal Policies by Finding Density", subsection_header_style))
    if not report_data.policy_gaps:
        story.append(Paragraph("<i>No policy document findings recorded.</i>", body_muted_style))
    else:
        pol_table_data = [
            [
                Paragraph("Policy Document", table_header_style),
                Paragraph("Total Gaps", table_header_style),
                Paragraph("Critical", table_header_style),
                Paragraph("High", table_header_style),
                Paragraph("Unresolved", table_header_style),
                Paragraph("Resolved", table_header_style),
            ]
        ]
        for pg in report_data.policy_gaps[:6]:
            pol_table_data.append([
                Paragraph(_escape(pg.policy_name), table_cell_bold_style),
                Paragraph(str(pg.total_findings), table_cell_style),
                Paragraph(str(pg.critical_count), table_cell_style),
                Paragraph(str(pg.high_count), table_cell_style),
                Paragraph(str(pg.unresolved_count), table_cell_style),
                Paragraph(str(pg.resolved_count), table_cell_style),
            ])
        pol_table = Table(pol_table_data, colWidths=[220, 60, 60, 60, 60, 60])
        pol_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        story.append(pol_table)
    story.append(Spacer(1, 10))

    # Regulation Gaps Table
    story.append(Paragraph("Top Regulations & Standards by Finding Density", subsection_header_style))
    if not report_data.regulation_gaps:
        story.append(Paragraph("<i>No regulation findings recorded.</i>", body_muted_style))
    else:
        reg_table_data = [
            [
                Paragraph("Regulation / Framework", table_header_style),
                Paragraph("Total Gaps", table_header_style),
                Paragraph("Critical", table_header_style),
                Paragraph("High", table_header_style),
                Paragraph("Unresolved", table_header_style),
                Paragraph("Resolved", table_header_style),
            ]
        ]
        for rg in report_data.regulation_gaps[:6]:
            reg_table_data.append([
                Paragraph(_escape(rg.regulation_title), table_cell_bold_style),
                Paragraph(str(rg.total_findings), table_cell_style),
                Paragraph(str(rg.critical_count), table_cell_style),
                Paragraph(str(rg.high_count), table_cell_style),
                Paragraph(str(rg.unresolved_count), table_cell_style),
                Paragraph(str(rg.resolved_count), table_cell_style),
            ])
        reg_table = Table(reg_table_data, colWidths=[220, 60, 60, 60, 60, 60])
        reg_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), SECONDARY_COLOR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        story.append(reg_table)

    # =========================================================================
    # PAGE 7: COMPLIANCE AUDIT ACTIVITY TRAIL
    # =========================================================================
    story.append(PageBreak())
    story.append(Paragraph("7. Compliance Audit Activity Trail Summary", section_header_style))
    story.append(Paragraph(
        "Summary of immutable compliance lifecycle activities recorded in the LexisGraph audit log during the reporting period.",
        body_muted_style,
    ))
    story.append(Spacer(1, 6))

    if not report_data.audit_summary:
        story.append(Paragraph("<i>No audit activity events recorded during this reporting window.</i>", body_muted_style))
    else:
        audit_table_data = [
            [Paragraph("Lifecycle Action / Event", table_header_style), Paragraph("Event Identifier", table_header_style), Paragraph("Occurrences", table_header_style)]
        ]
        for act in report_data.audit_summary:
            audit_table_data.append([
                Paragraph(_escape(act.label), table_cell_bold_style),
                Paragraph(f"<code>{_escape(act.event_type)}</code>", table_cell_style),
                Paragraph(str(act.count), table_cell_style),
            ])
        audit_table = Table(audit_table_data, colWidths=[240, 180, 100])
        audit_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_MUTED]),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ]))
        story.append(audit_table)

    # Build PDF doc
    doc.build(story)
    return buffer.getvalue()
