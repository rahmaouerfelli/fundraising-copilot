from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db
from models.application import Application
from models.ngo import NGO
from models.grant import Grant
from models.user import User
from schemas.pipeline import ApplicationDraftRequest
from services.auth_service import get_current_user, require_ngo_access
from services.mistral_service import SECTION_PROMPTS, draft_application_section

router = APIRouter(prefix="/applications", tags=["Applications"])


@router.post("/draft-section")
def draft_section(req: ApplicationDraftRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_ngo_access(req.ngo_id, user)
    if req.section not in SECTION_PROMPTS:
        raise HTTPException(status_code=400, detail=f"Invalid section. Use one of {list(SECTION_PROMPTS)}")
    ngo = db.query(NGO).filter(NGO.id == req.ngo_id).first()
    grant = db.query(Grant).filter(Grant.id == req.grant_id).first()
    if not ngo or not grant:
        raise HTTPException(status_code=404, detail="NGO or Grant not found.")

    ngo_dict = {
        "name": ngo.name, "mission": ngo.mission, "country": ngo.country,
        "sectors": ngo.sectors or [], "beneficiaries": ngo.beneficiaries,
    }
    grant_dict = {
        "title": grant.title, "funder_name": grant.funder_name,
        "description": grant.description,
    }
    text = draft_application_section(ngo_dict, grant_dict, req.section)
    return {"section": req.section, "draft": text}


@router.get("/{ngo_id}/{grant_id}")
def get_application(ngo_id: int, grant_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_ngo_access(ngo_id, user)
    app = (
        db.query(Application)
        .filter(Application.ngo_id == ngo_id, Application.grant_id == grant_id)
        .order_by(Application.version.desc())
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="No application found.")
    return app


@router.put("/{ngo_id}/{grant_id}")
def save_application(ngo_id: int, grant_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Save or update an application draft."""
    require_ngo_access(ngo_id, user)
    if not db.query(Grant).filter(Grant.id == grant_id).first():
        raise HTTPException(status_code=404, detail="Grant not found.")
    app = (
        db.query(Application)
        .filter(Application.ngo_id == ngo_id, Application.grant_id == grant_id)
        .order_by(Application.version.desc())
        .first()
    )
    SECTIONS = ["executive_summary", "objectives", "impact", "activities", "budget_justification", "indicators"]
    if app:
        for s in SECTIONS:
            if s in body:
                setattr(app, s, None if body[s] is None else str(body[s]))
        db.commit()
        db.refresh(app)
        return app
    else:
        app = Application(ngo_id=ngo_id, grant_id=grant_id, **{s: None if body.get(s) is None else str(body[s]) for s in SECTIONS})
        db.add(app)
        db.commit()
        db.refresh(app)
        return app
