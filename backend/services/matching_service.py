"""
Matching engine — combines vector similarity with Mistral scoring.
"""

import logging
from sqlalchemy.orm import Session

from models.grant import Grant, open_grant_filter
from models.ngo import NGO
from models.pipeline import MatchScore
from services import mistral_service, qdrant_service

logger = logging.getLogger(__name__)


def _ngo_to_dict(ngo: NGO) -> dict:
    return {
        "id": ngo.id,
        "name": ngo.name,
        "mission": ngo.mission,
        "country": ngo.country,
        "sectors": ngo.sectors or [],
        "beneficiaries": ngo.beneficiaries,
        "funding_needs": ngo.funding_needs,
        "keywords": ngo.keywords or [],
        "preferred_grant_size_min": ngo.preferred_grant_size_min,
        "preferred_grant_size_max": ngo.preferred_grant_size_max,
    }


def _grant_to_dict(grant: Grant) -> dict:
    return {
        "id": grant.id,
        "title": grant.title,
        "description": grant.description,
        "funder_name": grant.funder_name,
        "amount_min": grant.amount_min,
        "amount_max": grant.amount_max,
        "currency": grant.currency,
        "sectors": grant.sectors or [],
        "countries": grant.countries or [],
        "eligibility_criteria": grant.eligibility_criteria,
    }


# Grants scored per LLM call (one call scores the whole batch).
_SCORING_BATCH = 10


def _cached_scores(db: Session, ngo: NGO, grant_ids: list[int]) -> dict[int, MatchScore]:
    """Cached scores still valid for this NGO profile (computed after its last update)."""
    rows = (
        db.query(MatchScore)
        .filter(MatchScore.ngo_id == ngo.id, MatchScore.grant_id.in_(grant_ids))
        .all()
    )
    profile_changed_at = ngo.updated_at or ngo.created_at
    return {r.grant_id: r for r in rows if not profile_changed_at or r.created_at >= profile_changed_at}


def _score_and_cache(db: Session, ngo: NGO, ngo_dict: dict, grants: list[Grant]) -> dict[int, dict]:
    scores: dict[int, dict] = {}
    for i in range(0, len(grants), _SCORING_BATCH):
        batch = grants[i:i + _SCORING_BATCH]
        try:
            scores.update(mistral_service.score_grants_batch(ngo_dict, [_grant_to_dict(g) for g in batch]))
        except Exception as exc:
            logger.warning("Scoring failed for NGO %d (%d grants): %s", ngo.id, len(batch), exc)
            break  # rate limited / API down — the rest falls back to vector similarity

    if scores:
        db.query(MatchScore).filter(
            MatchScore.ngo_id == ngo.id, MatchScore.grant_id.in_(list(scores))
        ).delete(synchronize_session=False)
        for gid, sc in scores.items():
            db.add(MatchScore(
                ngo_id=ngo.id, grant_id=gid, score=sc["score"],
                explanation=sc["explanation"], readiness_score=sc["readiness_score"],
            ))
        db.commit()
    return scores


def get_matches_for_ngo(db: Session, ngo: NGO, limit: int = 10) -> list:
    """
    1. Embed NGO profile → query Qdrant for top candidates
    2. Score the candidates with Mistral (one call per batch, results cached per NGO profile)
    3. Return ranked list sorted by match_score desc
    """
    ngo_dict = _ngo_to_dict(ngo)

    try:
        query_vector = mistral_service.embed_ngo_profile(ngo_dict)
        candidates = qdrant_service.search_grants(query_vector, limit=limit * 2)
    except Exception as exc:
        logger.error("Vector search failed for NGO %d: %s", ngo.id, exc)
        candidates = []

    if not candidates:
        # Qdrant unavailable or empty (grants not indexed yet) — fall back to the most recent grants.
        grants = db.query(Grant).filter(open_grant_filter()).order_by(Grant.created_at.desc()).limit(limit).all()
        candidates = [{"grant_id": g.id, "score": 0.5} for g in grants]

    similarity = {c["grant_id"]: c["score"] for c in candidates}
    grants = db.query(Grant).filter(Grant.id.in_(list(similarity)), open_grant_filter()).all()

    cached = _cached_scores(db, ngo, [g.id for g in grants])
    scores = {
        gid: {"score": r.score, "explanation": r.explanation or "", "readiness_score": r.readiness_score}
        for gid, r in cached.items()
    }
    to_score = [g for g in grants if g.id not in scores]
    if to_score:
        scores.update(_score_and_cache(db, ngo, ngo_dict, to_score))

    results = []
    for grant in grants:
        scoring = scores.get(grant.id) or {
            "score": int(max(0.0, min(1.0, similarity[grant.id])) * 100),
            "explanation": "Semantic similarity match (AI scoring temporarily unavailable).",
            "readiness_score": None,
        }
        results.append({
            "grant": grant,
            "match_score": scoring["score"],
            "explanation": scoring["explanation"],
            "readiness_score": scoring["readiness_score"],
        })

    results.sort(key=lambda r: r["match_score"], reverse=True)
    return results[:limit]
