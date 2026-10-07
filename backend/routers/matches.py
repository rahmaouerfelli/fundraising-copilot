from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from models.database import get_db
from models.grant import Grant
from models.ngo import NGO
from models.pipeline import NGOInteraction
from models.user import User
from schemas.match import MatchResult, MatchRequest
from services.auth_service import get_current_user, require_ngo_access
from services.matching_service import get_matches_for_ngo

router = APIRouter(prefix="/matches", tags=["Matches"])


class InteractionRequest(BaseModel):
    ngo_id: int
    grant_id: int
    action: Literal["viewed", "saved", "rejected", "applied"]


@router.post("/", response_model=list[MatchResult])
def get_matches(req: MatchRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_ngo_access(req.ngo_id, user)
    ngo = db.query(NGO).filter(NGO.id == req.ngo_id).first()
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found.")
    return get_matches_for_ngo(db, ngo, limit=max(1, min(req.limit, 50)))


@router.post("/interact")
def record_interaction(body: InteractionRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Record that an NGO viewed/saved/rejected/applied for a grant."""
    require_ngo_access(body.ngo_id, user)
    if not db.query(Grant).filter(Grant.id == body.grant_id).first():
        raise HTTPException(status_code=404, detail="Grant not found.")
    db.add(NGOInteraction(ngo_id=body.ngo_id, grant_id=body.grant_id, action=body.action))
    db.commit()
    return {"status": "recorded"}
