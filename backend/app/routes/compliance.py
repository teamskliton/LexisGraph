import logging

from fastapi import APIRouter, HTTPException

from app.services.compliance import detect_compliance_gaps

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/compliance-check")
def compliance_check() -> dict:
    try:
        return {"gaps": detect_compliance_gaps()}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Compliance check failed")
        raise HTTPException(status_code=500, detail="Compliance check failed") from exc
