from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from models.database import get_db
from models.grant import Grant, open_grant_filter
from models.pipeline import PipelineEntry
from models.user import User
from services.auth_service import get_current_user, require_ngo_access

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/{ngo_id}")
def get_dashboard(ngo_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_ngo_access(ngo_id, user)
    pipeline = db.query(PipelineEntry).filter(PipelineEntry.ngo_id == ngo_id).all()

    stage_counts = {}
    for entry in pipeline:
        stage_counts[entry.stage] = stage_counts.get(entry.stage, 0) + 1

    submitted = stage_counts.get("submitted", 0)
    won = stage_counts.get("won", 0)
    lost = stage_counts.get("lost", 0)
    # An entry leaves "submitted" once it is won or lost, so rate = won / decided applications.
    decided = won + lost
    success_rate = round(won / decided * 100, 1) if decided > 0 else 0

    upcoming_deadlines = (
        db.query(PipelineEntry)
        .join(Grant)
        .filter(
            PipelineEntry.ngo_id == ngo_id,
            PipelineEntry.stage.in_(["saved", "preparing"]),
            Grant.deadline >= datetime.utcnow(),
            Grant.deadline <= datetime.utcnow() + timedelta(days=30),
        )
        .order_by(Grant.deadline.asc())
        .limit(5)
        .all()
    )

    total_grants = db.query(Grant).filter(open_grant_filter()).count()
    recent_grants = db.query(Grant).filter(open_grant_filter()).order_by(Grant.created_at.desc()).limit(5).all()

    return {
        "kpis": {
            "grants_in_db": total_grants,
            "grants_discovered": stage_counts.get("discovered", 0),
            "grants_saved": stage_counts.get("saved", 0),
            "grants_preparing": stage_counts.get("preparing", 0),
            "grants_submitted": submitted,
            "grants_won": won,
            "grants_lost": lost,
            "success_rate_pct": success_rate,
        },
        "upcoming_deadlines": [
            {
                "pipeline_id": e.id,
                "grant_id": e.grant_id,
                "grant_title": e.grant.title if e.grant else "",
                "deadline": e.grant.deadline.isoformat() if e.grant and e.grant.deadline else None,
                "stage": e.stage,
            }
            for e in upcoming_deadlines
        ],
        "recent_grants": [
            {"id": g.id, "title": g.title, "funder_name": g.funder_name}
            for g in recent_grants
        ],
    }
