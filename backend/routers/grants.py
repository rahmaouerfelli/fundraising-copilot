import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, cast
from sqlalchemy.orm import Session
from models.database import get_db
from models.grant import Grant, GrantSource, open_grant_filter
from schemas.grant import GrantOut, GrantPage, GrantSourceCreate, GrantSourceOut, GrantSearchParams
from services import mistral_service, url_safety
from services.search_service import keyword_search
from services.taxonomy import OTHER, normalize_sectors
from services.auth_service import get_current_user

# Every grant endpoint requires a logged-in user.
router = APIRouter(prefix="/grants", tags=["Grants"], dependencies=[Depends(get_current_user)])


class ConversationalSearchRequest(BaseModel):
    prompt: str


# ── Grant sources ─────────────────────────────────────────────────────────────

@router.post("/sources", response_model=GrantSourceOut, status_code=201)
def add_source(payload: GrantSourceCreate, db: Session = Depends(get_db)):
    url = payload.url.strip()
    if not url_safety.is_public_http_url(url):
        raise HTTPException(status_code=400, detail="URL must be a public http(s) address.")
    if db.query(GrantSource).filter(GrantSource.url == url).first():
        raise HTTPException(status_code=409, detail="This source already exists.")
    source = GrantSource(name=payload.name.strip()[:255] or url, url=url)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.get("/sources", response_model=list[GrantSourceOut])
def list_sources(db: Session = Depends(get_db)):
    return db.query(GrantSource).all()


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: int, db: Session = Depends(get_db)):
    source = db.query(GrantSource).filter(GrantSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found.")
    for grant in source.grants:
        grant.source_id = None
    db.delete(source)
    db.commit()


# ── Grant discovery & search ──────────────────────────────────────────────────

@router.get("/", response_model=list[GrantOut])
def list_grants(
    status: str = "active",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Grant).filter(open_grant_filter()) if status == "active" else db.query(Grant).filter(Grant.status == status)
    return (
        q
        .order_by(Grant.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


_BROWSE_SORTS = {
    "recent": lambda: [Grant.created_at.desc()],
    # Grants without a deadline / amount go last.
    "deadline": lambda: [Grant.deadline.is_(None), Grant.deadline.asc()],
    "amount": lambda: [Grant.amount_max.is_(None), Grant.amount_max.desc()],
}


@router.get("/browse", response_model=GrantPage)
def browse_grants(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
    sector: str | None = None,
    sort: Literal["recent", "deadline", "amount"] = "recent",
    db: Session = Depends(get_db),
):
    """All open grants, paginated, with per-sector counts for the filter chips."""
    sector_counts: dict[str, int] = {}
    all_sectors = db.query(Grant.sectors).filter(open_grant_filter()).all()
    for (sectors,) in all_sectors:
        for s in sectors or []:
            sector_counts[s] = sector_counts.get(s, 0) + 1

    q = db.query(Grant).filter(open_grant_filter())
    if sector:
        q = q.filter(cast(Grant.sectors, String).like(f'%"{sector}"%'))
    total = q.count()
    pages = max(1, -(-total // page_size))
    page = min(page, pages)
    items = (
        q.order_by(*_BROWSE_SORTS[sort](), Grant.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return GrantPage(
        items=items, total=total, page=page, page_size=page_size, pages=pages,
        sector_counts=sector_counts, total_open=len(all_sectors),
    )


@router.get("/{grant_id}", response_model=GrantOut)
def get_grant(grant_id: int, db: Session = Depends(get_db)):
    grant = db.query(Grant).filter(Grant.id == grant_id).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found.")
    return grant


@router.post("/search", response_model=list[GrantOut])
def search_grants(params: GrantSearchParams, db: Session = Depends(get_db)):
    """Keyword search (see services/search_service.py), best matches first."""
    limit = max(1, min(params.limit, 200))
    offset = max(0, params.offset)
    sectors = [s for s in normalize_sectors(params.sectors) if s != OTHER] if params.sectors else []
    grants = keyword_search(db, params.query, sectors, params.min_amount, params.max_amount)
    return grants[offset:offset + limit]


@router.post("/search/conversational", response_model=list[GrantOut])
def conversational_search(body: ConversationalSearchRequest, db: Session = Depends(get_db)):
    """Parse a plain-language prompt (any language) into keywords, sectors and amounts, then search."""
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required.")
    try:
        params_dict = mistral_service.parse_search_intent(prompt)
    except Exception:
        params_dict = {"query": prompt}
    params = GrantSearchParams(**params_dict)
    # Grants are already limited to calls the NGO's country is eligible for, and their country
    # lists are free text ("Global", "MENA"…): drop country words instead of filtering on them.
    for country in params.countries:
        params.query = re.sub(rf"\b{re.escape(country)}\b", " ", params.query, flags=re.IGNORECASE)
    params.countries = []
    return search_grants(params, db)


# ── Ingestion (runs in the background; the UI polls the status) ──────────────

@router.post("/ingest/run", status_code=202)
def trigger_ingestion():
    """Start a grant scan in the background. Poll GET /grants/ingest/status for progress."""
    from services.ingestion_service import get_progress, start_background_ingestion
    if not start_background_ingestion():
        raise HTTPException(status_code=409, detail="A grant scan is already running. Please wait for it to finish.")
    return get_progress()


@router.get("/ingest/status")
def ingestion_status():
    from services.ingestion_service import get_progress
    return get_progress()
