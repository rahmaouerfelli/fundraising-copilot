"""
Keyword search over open grants.

Semantic (embedding) search is a poor fit here: mistral-embed gives every grant a similar score
for a short query (0.60–0.70), so "disability" returned every grant in the database. Keyword
search is predictable: a grant is returned only if it mentions the query terms, or belongs to
the sector the query names (e.g. "handicap" → Disability). Embeddings stay in AI matching.
"""

import re

from sqlalchemy.orm import Session

from models.grant import Grant, open_grant_filter
from services.taxonomy import OTHER, normalize_sectors

# Words too generic to discriminate between grants.
STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "are", "our", "your", "any", "all",
    "grant", "grants", "fund", "funds", "funding", "call", "calls", "proposal", "proposals",
    "ngo", "ngos", "organisation", "organisations", "organization", "organizations", "project", "projects",
    "opportunity", "opportunities", "program", "programme", "support", "les", "des", "pour", "une",
}

# Field weights: a term in the title says more than one in the description.
_W_SECTOR, _W_TITLE, _W_FUNDER, _W_TEXT = 6, 4, 2, 1


def _terms(query: str) -> list[str]:
    words = re.findall(r"[\w'-]+", query.lower())
    return list(dict.fromkeys(w for w in words if len(w) >= 3 and w not in STOPWORDS))


def _stem_pattern(term: str) -> re.Pattern:
    # Prefix match from a word start: "disability" → \bdisab → disabled, disabilities…
    stem = term[:5] if len(term) > 5 else term
    return re.compile(rf"\b{re.escape(stem)}", re.IGNORECASE)


def query_sectors(query: str) -> list[str]:
    """Canonical sectors the query refers to ("disability" → ["Disability"]); [] if none."""
    sectors = normalize_sectors([query])
    return [] if sectors == [OTHER] else sectors


def keyword_search(
    db: Session,
    query: str = "",
    sectors: list[str] | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
) -> list[Grant]:
    """
    Open grants matching the query, best first.
    - each term matches by prefix in title / funder / description / eligibility
    - a grant in a sector named by the query (or in `sectors`) matches too
    - with several terms, a grant must contain at least half of them (or match a sector)
    """
    terms = _terms(query)
    patterns = [_stem_pattern(t) for t in terms]
    wanted_sectors = set(sectors or []) | set(query_sectors(query) if query.strip() else [])

    results = []
    for grant in db.query(Grant).filter(open_grant_filter()).all():
        if min_amount is not None and grant.amount_max is not None and grant.amount_max < min_amount:
            continue
        if max_amount is not None and grant.amount_min is not None and grant.amount_min > max_amount:
            continue

        sector_hit = bool(wanted_sectors & set(grant.sectors or []))
        if not terms and not wanted_sectors:
            results.append((0, grant))  # empty query: everything, newest first
            continue

        title, funder = grant.title or "", grant.funder_name or ""
        text = f"{grant.description or ''} {grant.eligibility_criteria or ''}"
        score, matched = (_W_SECTOR if sector_hit else 0), 0
        for p in patterns:
            hit = False
            if p.search(title):
                score += _W_TITLE
                hit = True
            if p.search(funder):
                score += _W_FUNDER
                hit = True
            if p.search(text):
                score += _W_TEXT
                hit = True
            matched += hit

        enough_terms = terms and matched * 2 >= len(terms)
        if sector_hit or enough_terms:
            results.append((score, grant))

    results.sort(key=lambda r: (r[0], r[1].created_at), reverse=True)
    return [g for _, g in results]
