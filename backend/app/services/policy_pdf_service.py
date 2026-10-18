"""
LexisGraph Policy PDF Generation Service.
Generates clean, enterprise-grade, print-ready compliance policy PDFs using ReportLab.
Supports Draft policies (with explicit DRAFT watermarks), Approved policies,
Published policies (with full verification metadata), and Historical version snapshots.
Pure in-memory streaming via io.BytesIO without temporary file leaks.
"""
from __future__ import annotations

import io
import re
import html
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

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
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

# Enterprise Color Palette
PRIMARY_COLOR = colors.HexColor("#0f172a")       # Slate 900
SECONDARY_COLOR = colors.HexColor("#334155")     # Slate 700
MUTED_TEXT = colors.HexColor("#64748b")          # Slate 500
BORDER_COLOR = colors.HexColor("#cbd5e1")        # Slate 300
BORDER_LIGHT = colors.HexColor("#e2e8f0")        # Slate 200
BG_SUBTLE = colors.HexColor("#f8fafc")           # Slate 50
ACCENT_PRIMARY = colors.HexColor("#2563eb")      # Blue 600

# Status-specific Colors
STATUS_CONFIG: Dict[str, Dict[str, Any]] = {
    "DRAFT_SAVED": {
        "label": "DRAFT — NOT APPROVED",
        "subtitle": "Internal working draft. Unapproved and not operative.",
        "bg": colors.HexColor("#fef2f2"),
        "border": colors.HexColor("#ef4444"),
        "text": colors.HexColor("#991b1b"),
    },
    "DRAFTING": {
        "label": "DRAFT — IN PROGRESS",
        "subtitle": "Policy formation in progress. Not yet finalized.",
        "bg": colors.HexColor("#fef2f2"),
        "border": colors.HexColor("#ef4444"),
        "text": colors.HexColor("#991b1b"),
    },
    "NEEDS_VERIFICATION": {
        "label": "PRELIMINARY DRAFT — NEEDS VERIFICATION",
        "subtitle": "Unresolved statutory questions or thresholds require verification.",
        "bg": colors.HexColor("#fffbeb"),
        "border": colors.HexColor("#f59e0b"),
        "text": colors.HexColor("#92400e"),
    },
    "READY_FOR_REVIEW": {
        "label": "UNDER REVIEW — PENDING APPROVAL",
        "subtitle": "Submitted for formal governance review. Content locked.",
        "bg": colors.HexColor("#eff6ff"),
        "border": colors.HexColor("#3b82f6"),
        "text": colors.HexColor("#1e40af"),
    },
    "REVISION_REQUESTED": {
        "label": "REVISION REQUESTED — UNAPPROVED",
        "subtitle": "Reviewer requested changes. Author must address notes before resubmission.",
        "bg": colors.HexColor("#fff1f2"),
        "border": colors.HexColor("#f43f5e"),
        "text": colors.HexColor("#9f1239"),
    },
    "APPROVED": {
        "label": "APPROVED POLICY DRAFT — PENDING PUBLICATION",
        "subtitle": "Formally approved by authorized officer. Content hash verified.",
        "bg": colors.HexColor("#faf5ff"),
        "border": colors.HexColor("#8b5cf6"),
        "text": colors.HexColor("#5b21b6"),
    },
    "PUBLISHED": {
        "label": "OFFICIAL PUBLISHED COMPLIANCE POLICY",
        "subtitle": "Authoritative corporate compliance policy in operative effect.",
        "bg": colors.HexColor("#f0fdf4"),
        "border": colors.HexColor("#10b981"),
        "text": colors.HexColor("#065f46"),
    },
    "SUPERSEDED": {
        "label": "SUPERSEDED VERSION — INACTIVE",
        "subtitle": "Replaced by a subsequent approved revision. Archived for audit history.",
        "bg": colors.HexColor("#f8fafc"),
        "border": colors.HexColor("#64748b"),
        "text": colors.HexColor("#334155"),
    },
}


class PolicyNumberedCanvas(canvas.Canvas):
  """Two-pass canvas for dynamic total page count ('Page X of Y')

  and running header/footer.
  """

  def __init__(self, *args, **kwargs):
    super().__init__(*args, **kwargs)
    self._saved_page_states: List[Dict[str, Any]] = []
    self.policy_title: str = "Corporate Compliance Policy"
    self.policy_code: str = ""
    self.policy_status: str = "DRAFT"
    self.org_name: str = "The Organization"

  def showPage(self):
    self._saved_page_states.append(dict(self.__dict__))
    self._startPage()

  def save(self):
    num_pages = len(self._saved_page_states)
    for state in self._saved_page_states:
      self.__dict__.update(state)
      self.draw_page_decorations(num_pages)
      super().showPage()
    super().save()

  def draw_page_decorations(self, page_count: int):
    self.saveState()
    page_w, page_h = self._pagesize

    # Running header on pages 2 and later
    if self._pageNumber > 1:
      self.setFont("Helvetica-Bold", 8)
      self.setFillColor(MUTED_TEXT)
      header_left = self.policy_title[:65]
      if self.policy_code:
        header_left += f"  [{self.policy_code}]"
      self.drawString(36, page_h - 26, header_left)

      self.setFont("Helvetica", 8)
      self.drawRightString(
          page_w - 36, page_h - 26, "LexisGraph Policy Governance"
      )

      self.setStrokeColor(BORDER_LIGHT)
      self.setLineWidth(0.5)
      self.line(36, page_h - 30, page_w - 36, page_h - 30)

    # Running footer on all pages
    self.setStrokeColor(BORDER_LIGHT)
    self.setLineWidth(0.5)
    self.line(36, 32, page_w - 36, 32)

    self.setFont("Helvetica", 8)
    self.setFillColor(MUTED_TEXT)
    clean_org = self.org_name[:45]
    status_disp = self.policy_status.replace("_", " ").title()
    footer_left = f"{clean_org}  •  Status: {status_disp}"
    self.drawString(36, 20, footer_left)

    page_str = f"Page {self._pageNumber} of {page_count}"
    self.drawRightString(page_w - 36, 20, page_str)

    self.restoreState()


def _safe_escape(text: Any) -> str:
  """Escapes XML special characters (&, <, >) for ReportLab Paragraphs without producing hex charrefs like &#x27;."""
  if text is None:
    return ""
  return html.escape(str(text), quote=False).replace('"', "&quot;")


def _sanitize_markdown_to_xml(raw_text: str) -> str:
  """Escapes HTML entities and translates simple markdown (*bold*, _italic_, `code`)

  into ReportLab-supported XML tags (<b>, <i>, <font>).
  """
  if not raw_text:
    return ""

  # 1. Escape HTML safely without hex entities
  clean = _safe_escape(raw_text)

  # 2. Translate bold: **text** or __text__
  clean = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", clean)
  clean = re.sub(r"__(.+?)__", r"<b>\1</b>", clean)

  # 3. Translate italic: *text* or _text_
  clean = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<i>\1</i>", clean)
  clean = re.sub(r"(?<!_)_([^_]+?)_(?!_)", r"<i>\1</i>", clean)

  # 4. Translate inline code: `code`
  clean = re.sub(
      r"`([^`]+?)`", r'<font face="Courier" color="#1e293b">\1</font>', clean
  )

  return clean


def _parse_content_into_flowables(
    content: str,
    body_style: ParagraphStyle,
    bullet_style: ParagraphStyle,
    subheading_style: ParagraphStyle,
) -> List[Any]:
  """Parses section markdown text into a sequence of ReportLab flowable paragraphs,

  recognizing headings, bullet points, numbered lists, and blank lines.
  """
  flowables: List[Any] = []
  if not content or not content.strip():
    flowables.append(
        Paragraph("<i>[Section content unset]</i>", body_style)
    )
    return flowables

  lines = content.strip().split("\n")
  in_list = False

  for line in lines:
    raw_line = line.strip()
    if not raw_line:
      if in_list:
        flowables.append(Spacer(1, 4))
        in_list = False
      else:
        flowables.append(Spacer(1, 6))
      continue

    # Markdown Sub-headings: ### or ####
    if raw_line.startswith("### ") or raw_line.startswith("#### "):
      heading_text = raw_line.lstrip("#").strip()
      xml_heading = _sanitize_markdown_to_xml(heading_text)
      flowables.append(Spacer(1, 6))
      flowables.append(
          Paragraph(f"<b>{xml_heading}</b>", subheading_style)
      )
      flowables.append(Spacer(1, 3))
      in_list = False
      continue

    # Bullet lists: * or - or •
    if (
        raw_line.startswith("- ")
        or raw_line.startswith("* ")
        or raw_line.startswith("• ")
    ):
      item_text = raw_line[2:].strip()
      xml_text = _sanitize_markdown_to_xml(item_text)
      flowables.append(Paragraph(f"&bull;  {xml_text}", bullet_style))
      in_list = True
      continue

    # Numbered list: e.g. "1. ", "2) "
    num_match = re.match(r"^(\d+[\.\)])\s+(.+)$", raw_line)
    if num_match:
      num_prefix = num_match.group(1)
      item_text = num_match.group(2)
      xml_text = _sanitize_markdown_to_xml(item_text)
      flowables.append(
          Paragraph(f"<b>{num_prefix}</b>  {xml_text}", bullet_style)
      )
      in_list = True
      continue

    # Standard body paragraph
    xml_text = _sanitize_markdown_to_xml(raw_line)
    flowables.append(Paragraph(xml_text, body_style))
    flowables.append(Spacer(1, 4))
    in_list = False

  return flowables


def generate_policy_pdf(
    policy_data: Dict[str, Any],
    organization_name: str,
    historical_version: Optional[int] = None,
) -> bytes:
  """Generates a professional, print-ready compliance policy PDF document.

  Args:
      policy_data: Authoritative dictionary representing PolicyDraft or
        historical snapshot.
      organization_name: Resolved organization / tenant name.
      historical_version: If viewing a historical snapshot, the requested
        version number.

  Returns:
      Binary bytes representing the generated PDF document.
  """
  buffer = io.BytesIO()

  # A4 Document Setup with 0.5 inch (36pt) margins
  doc = SimpleDocTemplate(
      buffer,
      pagesize=A4,
      leftMargin=36,
      rightMargin=36,
      topMargin=36,
      bottomMargin=36,
  )

  styles = getSampleStyleSheet()

  # Typography Styles
  title_style = ParagraphStyle(
      "PolicyTitle",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=18,
      leading=22,
      textColor=PRIMARY_COLOR,
      spaceAfter=4,
  )

  org_subtitle_style = ParagraphStyle(
      "OrgSubtitle",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=10,
      leading=14,
      textColor=ACCENT_PRIMARY,
      spaceAfter=12,
  )

  banner_title_style = ParagraphStyle(
      "BannerTitle",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=11,
      leading=14,
      alignment=1,  # Center
  )

  banner_subtitle_style = ParagraphStyle(
      "BannerSubTitle",
      parent=styles["Normal"],
      fontName="Helvetica",
      fontSize=8.5,
      leading=12,
      alignment=1,  # Center
  )

  section_heading_style = ParagraphStyle(
      "SecHeading",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=12,
      leading=16,
      textColor=PRIMARY_COLOR,
      spaceBefore=12,
      spaceAfter=6,
      keepWithNext=True,
  )

  subheading_style = ParagraphStyle(
      "SubHeading",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=10,
      leading=13,
      textColor=SECONDARY_COLOR,
      spaceBefore=6,
      spaceAfter=3,
      keepWithNext=True,
  )

  body_style = ParagraphStyle(
      "PolicyBody",
      parent=styles["Normal"],
      fontName="Helvetica",
      fontSize=9,
      leading=13.5,
      textColor=SECONDARY_COLOR,
  )

  bullet_style = ParagraphStyle(
      "PolicyBullet",
      parent=styles["Normal"],
      fontName="Helvetica",
      fontSize=9,
      leading=13.5,
      textColor=SECONDARY_COLOR,
      leftIndent=12,
      spaceAfter=2,
  )

  table_cell_style = ParagraphStyle(
      "TableCell",
      parent=styles["Normal"],
      fontName="Helvetica",
      fontSize=8,
      leading=11,
      textColor=SECONDARY_COLOR,
  )

  table_cell_bold = ParagraphStyle(
      "TableCellBold",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=8,
      leading=11,
      textColor=PRIMARY_COLOR,
  )

  table_header_style = ParagraphStyle(
      "TableHeader",
      parent=styles["Normal"],
      fontName="Helvetica-Bold",
      fontSize=8,
      leading=11,
      textColor=colors.white,
  )

  disclaimer_style = ParagraphStyle(
      "DisclaimerText",
      parent=styles["Normal"],
      fontName="Helvetica-Oblique",
      fontSize=8,
      leading=11,
      textColor=MUTED_TEXT,
  )

  story: List[Any] = []

  # Extract key metadata
  meta = policy_data.get("metadata_properties") or {}
  title = policy_data.get("title") or "Organizational Policy"
  status = policy_data.get("status") or "DRAFT_SAVED"
  version = historical_version or policy_data.get("version", 1)
  policy_code = meta.get("policy_identifier") or f"POL-v{version}"
  owner_role = meta.get("owner_role") or "Compliance Officer"
  review_cadence = meta.get("review_cadence") or "Annual"
  primary_jurisdiction = meta.get("primary_jurisdiction") or "India"
  scope_display = (
      meta.get("scope") or meta.get("scope_type") or "ORGANIZATION-WIDE"
  )
  effective_date = policy_data.get("effective_date")
  approved_at = policy_data.get("approved_at")
  approved_by = policy_data.get("approved_by")
  content_hash = policy_data.get("content_hash")

  # ─── 1. DOCUMENT HEADER ──────────────────────────────────────────────────
  story.append(Paragraph(_safe_escape(title), title_style))
  story.append(
      Paragraph(
          f"ENTERPRISE COMPLIANCE &bull; {_safe_escape(organization_name).upper()}",
          org_subtitle_style,
      )
  )

  # ─── 2. STATUS WATERMARK / NOTICE BANNER ──────────────────────────────────
  status_info = STATUS_CONFIG.get(status, STATUS_CONFIG["DRAFT_SAVED"])
  banner_color = status_info["text"]
  banner_bg = status_info["bg"]
  banner_border = status_info["border"]

  # If this is an explicit historical version snapshot, update banner note
  banner_title_text = status_info["label"]
  banner_sub_text = status_info["subtitle"]
  if historical_version and historical_version != policy_data.get("version"):
    banner_title_text += f" (HISTORICAL SNAPSHOT: v{historical_version})"
    banner_sub_text = (
        f"Archived revision snapshot v{historical_version}. Does not reflect"
        " subsequent edits."
    )

  banner_table_data = [[
      Paragraph(
          f"<font color='{banner_color.hexval()}'>{banner_title_text}</font>",
          banner_title_style,
      )
  ], [
      Paragraph(
          f"<font color='{banner_color.hexval()}'>{banner_sub_text}</font>",
          banner_subtitle_style,
      )
  ]]
  banner_table = Table(banner_table_data, colWidths=[523])
  banner_table.setStyle(
      TableStyle([
          ("BACKGROUND", (0, 0), (-1, -1), banner_bg),
          ("BOX", (0, 0), (-1, -1), 1, banner_border),
          ("TOPPADDING", (0, 0), (-1, 0), 6),
          ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
          ("TOPPADDING", (0, 1), (-1, 1), 0),
          ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
          ("ALIGN", (0, 0), (-1, -1), "CENTER"),
      ])
  )
  story.append(banner_table)
  story.append(Spacer(1, 10))

  # ─── 3. METADATA SUMMARY TABLE ───────────────────────────────────────────
  meta_rows = [
      [
          Paragraph("Policy Code", table_cell_bold),
          Paragraph(f"<code>{_safe_escape(policy_code)}</code>", table_cell_style),
          Paragraph("Draft Version", table_cell_bold),
          Paragraph(f"v{version}.0", table_cell_style),
      ],
      [
          Paragraph("Operational Scope", table_cell_bold),
          Paragraph(_safe_escape(str(scope_display)), table_cell_style),
          Paragraph("Designated Owner", table_cell_bold),
          Paragraph(_safe_escape(str(owner_role)), table_cell_style),
      ],
      [
          Paragraph("Primary Jurisdiction", table_cell_bold),
          Paragraph(_safe_escape(str(primary_jurisdiction)), table_cell_style),
          Paragraph("Review Cadence", table_cell_bold),
          Paragraph(_safe_escape(str(review_cadence)), table_cell_style),
      ],
      [
          Paragraph("Effective Date", table_cell_bold),
          Paragraph(
              effective_date[:10]
              if isinstance(effective_date, str)
              else (
                  effective_date.strftime("%Y-%m-%d")
                  if effective_date
                  else "Pending Approval"
              ),
              table_cell_style,
          ),
          Paragraph("Approval Status", table_cell_bold),
          Paragraph(
              "Approved"
              if status in ("APPROVED", "PUBLISHED")
              else "Unapproved",
              table_cell_style,
          ),
      ],
  ]

  # If approved or published, add content hash and approval date
  if status in ("APPROVED", "PUBLISHED") and content_hash:
    meta_rows.append([
        Paragraph("Content SHA-256", table_cell_bold),
        Paragraph(
            f"<font size=6>{content_hash[:28]}...</font>", table_cell_style
        ),
        Paragraph("Approved Date", table_cell_bold),
        Paragraph(
            approved_at[:10]
            if isinstance(approved_at, str)
            else (approved_at.strftime("%Y-%m-%d") if approved_at else "N/A"),
            table_cell_style,
        ),
    ])

  meta_table = Table(meta_rows, colWidths=[100, 161, 100, 162])
  meta_table.setStyle(
      TableStyle([
          ("BACKGROUND", (0, 0), (-1, -1), BG_SUBTLE),
          ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
          ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
          ("TOPPADDING", (0, 0), (-1, -1), 4),
          ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
          ("LEFTPADDING", (0, 0), (-1, -1), 6),
          ("RIGHTPADDING", (0, 0), (-1, -1), 6),
      ])
  )
  story.append(meta_table)
  story.append(Spacer(1, 12))

  # ─── 4. TABLE OF CONTENTS / SECTION INDEX ────────────────────────────────
  sections: List[Dict[str, Any]] = policy_data.get("sections") or []
  if len(sections) >= 3:
    story.append(Paragraph("<b>Table of Contents</b>", section_heading_style))
    toc_data = []
    # Build a compact 2-column index of sections
    for i in range(0, len(sections), 2):
      sec1 = sections[i]
      s1_text = f"<b>{sec1.get('section_number', '')}</b>  {_safe_escape(sec1.get('heading', ''))}"
      s2_text = ""
      if i + 1 < len(sections):
        sec2 = sections[i + 1]
        s2_text = f"<b>{sec2.get('section_number', '')}</b>  {_safe_escape(sec2.get('heading', ''))}"
      toc_data.append(
          [Paragraph(s1_text, table_cell_style), Paragraph(s2_text, table_cell_style)]
      )

    toc_table = Table(toc_data, colWidths=[261, 262])
    toc_table.setStyle(
        TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ])
    )
    story.append(toc_table)
    story.append(Spacer(1, 10))
    story.append(
        HRFlowable(
            width="100%", thickness=0.5, color=BORDER_COLOR, spaceAfter=8
        )
    )

  # ─── 5. POLICY BODY SECTIONS ─────────────────────────────────────────────
  for idx, sec in enumerate(sections, start=1):
    sec_num = sec.get("section_number") or f"{idx}.0"
    sec_heading = sec.get("heading") or f"Section {idx}"
    content = sec.get("content") or ""

    section_flowables: List[Any] = []

    # Numbered Section Heading
    heading_markup = f"{sec_num}  {_safe_escape(sec_heading)}"
    section_flowables.append(
        Paragraph(f"<b>{heading_markup}</b>", section_heading_style)
    )
    section_flowables.append(Spacer(1, 2))

    # Parse and add section body text
    sec_body_flowables = _parse_content_into_flowables(
        content=content,
        body_style=body_style,
        bullet_style=bullet_style,
        subheading_style=subheading_style,
    )
    section_flowables.extend(sec_body_flowables)

    # Statutory clauses footnote tag
    source_clauses = sec.get("source_clauses") or []
    if source_clauses and isinstance(source_clauses, list):
      clauses_preview = "; ".join(
          [_safe_escape(str(c)) for c in source_clauses[:3]]
      )
      footnote_text = f"<i>Statutory benchmark: {clauses_preview}</i>"
      section_flowables.append(Spacer(1, 2))
      section_flowables.append(Paragraph(footnote_text, disclaimer_style))

    section_flowables.append(Spacer(1, 8))
    story.append(KeepTogether(section_flowables[:3]))  # Avoid orphan title
    story.extend(section_flowables[3:])

  # ─── 6. STATUTORY REFERENCES & GROUNDED CITATIONS ────────────────────────
  source_refs: List[Dict[str, Any]] = policy_data.get("source_references") or []
  if source_refs:
    story.append(Spacer(1, 8))
    story.append(
        Paragraph("Verified Statutory Grounding", section_heading_style)
    )
    ref_table_data = [[
        Paragraph("Statutory Act / Standard", table_header_style),
        Paragraph("Official Citation & Provisions", table_header_style),
        Paragraph("Jurisdiction", table_header_style),
    ]]
    for ref in source_refs:
      act_name = ref.get("act_name") or ref.get("instrument_name") or "Standard"
      citation = ref.get("official_citation") or ""
      provisions = ref.get("provisions") or []
      prov_str = (
          "<br/>".join([f"&bull; {_safe_escape(p)}" for p in provisions[:3]])
          if provisions
          else _safe_escape(citation)
      )
      ref_table_data.append([
          Paragraph(f"<b>{_safe_escape(act_name)}</b>", table_cell_bold),
          Paragraph(prov_str, table_cell_style),
          Paragraph(_safe_escape(ref.get("jurisdiction", "")), table_cell_style),
      ])

    ref_table = Table(ref_table_data, colWidths=[150, 273, 100])
    ref_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_SUBTLE]),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(ref_table)
    story.append(Spacer(1, 10))

  # ─── 7. STATUTORY NOTICES & UNRESOLVED QUESTIONS ─────────────────────────
  unresolved = policy_data.get("unresolved_questions") or []
  if unresolved:
    story.append(
        Paragraph("Statutory Notices & Warnings", section_heading_style)
    )
    notice_paragraphs = [
        Paragraph(
            "<b>Applicability Disclosures:</b> The following statutory"
            " thresholds and verification notices were documented during policy"
            " drafting:",
            body_style,
        ),
        Spacer(1, 4),
    ]
    for q in unresolved:
      notice_paragraphs.append(
          Paragraph(f"&bull;  {_sanitize_markdown_to_xml(str(q))}", bullet_style)
      )

    notice_box = Table([[notice_paragraphs]], colWidths=[523])
    notice_box.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#f59e0b")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(notice_box)
    story.append(Spacer(1, 12))

  # ─── 8. LEGAL DISCLAIMER & CERTIFICATION FOOTER ──────────────────────────
  story.append(
      HRFlowable(
          width="100%", thickness=0.5, color=BORDER_COLOR, spaceAfter=8
      )
  )
  disclaimer_p = Paragraph(
      "<b>Legal Notice &amp; Compliance Disclaimer:</b> This document was"
      " generated via LexisGraph Policy Formation. It establishes internal"
      " governance directives aligned with recognized statutory benchmarks. It"
      " does not constitute formal legal counsel or guarantee immunity from"
      " statutory enforcement. Authorized executive adoption is required prior"
      " to binding implementation.",
      disclaimer_style,
  )
  story.append(disclaimer_p)

  # Custom Canvas initialization for running header/footer
  def _canvas_factory(*args, **kwargs):
    c = PolicyNumberedCanvas(*args, **kwargs)
    c.policy_title = title
    c.policy_code = policy_code
    c.policy_status = status_info["label"]
    c.org_name = organization_name
    return c

  # Build document into in-memory buffer
  doc.build(story, canvasmaker=_canvas_factory)

  buffer.seek(0)
  pdf_bytes = buffer.getvalue()
  buffer.close()

  logger.info(
      "Generated Policy PDF for '%s' (v%s, status=%s, size=%d bytes)",
      title,
      version,
      status,
      len(pdf_bytes),
  )
  return pdf_bytes
