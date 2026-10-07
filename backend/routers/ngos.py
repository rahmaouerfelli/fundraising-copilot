from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db
from models.ngo import NGO
from models.pipeline import MatchScore
from models.user import User
from schemas.ngo import NGOCreate, NGOUpdate, NGOOut
from services.auth_service import get_current_user, require_ngo_access

router = APIRouter(prefix="/ngos", tags=["NGOs"])


def _get_owned_ngo(ngo_id: int, user: User, db: Session) -> NGO:
    require_ngo_access(ngo_id, user)
    ngo = db.query(NGO).filter(NGO.id == ngo_id).first()
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found.")
    return ngo


@router.post("/", response_model=NGOOut, status_code=201)
def create_ngo(payload: NGOCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ngo = NGO(**payload.model_dump())
    db.add(ngo)
    db.flush()
    if user.ngo_id is None:
        user.ngo_id = ngo.id
    db.commit()
    db.refresh(ngo)
    return ngo


@router.get("/", response_model=list[NGOOut])
def list_ngos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Only the caller's own NGO is visible."""
    if user.ngo_id is None:
        return []
    return db.query(NGO).filter(NGO.id == user.ngo_id).all()


@router.get("/{ngo_id}", response_model=NGOOut)
def get_ngo(ngo_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_owned_ngo(ngo_id, user, db)


@router.put("/{ngo_id}", response_model=NGOOut)
def update_ngo(ngo_id: int, payload: NGOUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ngo = _get_owned_ngo(ngo_id, user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ngo, field, value)
    db.commit()
    db.refresh(ngo)
    return ngo


@router.delete("/{ngo_id}", status_code=204)
def delete_ngo(ngo_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ngo = _get_owned_ngo(ngo_id, user, db)
    for member in ngo.users:
        member.ngo_id = None
    db.query(MatchScore).filter(MatchScore.ngo_id == ngo.id).delete(synchronize_session=False)
    for related in (*ngo.pipeline_entries, *ngo.interactions, *ngo.applications):
        db.delete(related)
    db.delete(ngo)
    db.commit()
