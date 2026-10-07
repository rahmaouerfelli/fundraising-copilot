from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from models.database import get_db
from models.grant import Grant
from models.pipeline import PipelineEntry, PIPELINE_STAGES
from models.user import User
from schemas.pipeline import PipelineEntryCreate, PipelineEntryUpdate, PipelineEntryOut
from services.auth_service import get_current_user, require_ngo_access

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


def _check_stage(stage: str | None) -> None:
    if stage is not None and stage not in PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Use one of {PIPELINE_STAGES}")


def _get_owned_entry(entry_id: int, user: User, db: Session) -> PipelineEntry:
    entry = db.query(PipelineEntry).filter(PipelineEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Pipeline entry not found.")
    require_ngo_access(entry.ngo_id, user)
    return entry


@router.post("/", response_model=PipelineEntryOut, status_code=201)
def add_to_pipeline(payload: PipelineEntryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_ngo_access(payload.ngo_id, user)
    _check_stage(payload.stage)
    if not db.query(Grant).filter(Grant.id == payload.grant_id).first():
        raise HTTPException(status_code=404, detail="Grant not found.")
    existing = (
        db.query(PipelineEntry)
        .filter(PipelineEntry.ngo_id == payload.ngo_id, PipelineEntry.grant_id == payload.grant_id)
        .first()
    )
    if existing:
        return existing
    entry = PipelineEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/{ngo_id}", response_model=list[PipelineEntryOut])
def get_pipeline(ngo_id: int, stage: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_ngo_access(ngo_id, user)
    q = (
        db.query(PipelineEntry)
        .options(joinedload(PipelineEntry.grant))
        .filter(PipelineEntry.ngo_id == ngo_id)
    )
    if stage:
        _check_stage(stage)
        q = q.filter(PipelineEntry.stage == stage)
    return q.order_by(PipelineEntry.updated_at.desc()).all()


@router.patch("/{entry_id}", response_model=PipelineEntryOut)
def update_pipeline_entry(entry_id: int, payload: PipelineEntryUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = _get_owned_entry(entry_id, user, db)
    _check_stage(payload.stage)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def remove_from_pipeline(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = _get_owned_entry(entry_id, user, db)
    db.delete(entry)
    db.commit()
