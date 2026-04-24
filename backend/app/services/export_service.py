from io import BytesIO
from typing import Any

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


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
