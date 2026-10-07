"""
Canonical grant sectors — the same list the NGO picks from during onboarding
(frontend/src/pages/OnboardingPage.jsx), so filters and matching speak the same language.

The LLM is asked to use these names, and free-text sectors (from older scans or a model
that ignores the instruction) are mapped onto them by keyword.
"""

import re

SECTORS = [
    "Education", "Health", "Environment", "Human Rights", "Women Empowerment", "Youth",
    "Arts & Culture", "Economic Development", "Disability", "Refugees",
]
OTHER = "Other"

# Keyword stems → canonical sector. Checked against the lowercased free-text sector.
_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Education", ("educat", "school", "teacher", "literacy", "learning", "training", "capacity building",
                   "stem", "vocational", "university", "academic", "scholar")),
    ("Health", ("health", "medical", "medicine", "disease", "nutrition", "mental", "sanitation", "hygiene",
                "hiv", "aids", "food")),
    ("Environment", ("environment", "climate", "water", "energy", "biodiversity", "agricultur", "sustainab",
                     "conservation", "green", "ecolog", "forest", "ocean")),
    ("Human Rights", ("human right", "rights", "democra", "governance", "civil society", "justice", "rule of law",
                      "advocacy", "freedom", "media", "journalis", "peace", "civic", "anti-corruption")),
    ("Women Empowerment", ("women", "woman", "gender", "girl", "feminis", "gbv", "violence against")),
    ("Youth", ("youth", "young", "children", "child", "adolescen", "student")),
    ("Arts & Culture", ("art", "cultur", "heritage", "creative", "music", "film", "cinema", "museum", "theat")),
    ("Economic Development", ("econom", "entrepreneur", "employment", "job", "livelihood", "business", "sme",
                              "development", "innovation", "poverty", "income", "financ", "trade", "rural")),
    ("Disability", ("disab", "inclusive", "inclusion", "special needs", "accessib", "handicap")),
    ("Refugees", ("refugee", "migra", "displaced", "asylum", "humanitarian")),
]


def _canonical(value: str) -> list[str]:
    text = value.strip().lower()
    exact = [s for s in SECTORS if s.lower() == text]
    if exact:
        return exact
    found = []
    for sector, stems in _KEYWORDS:
        for stem in stems:
            # "art" must not match "partnership": short stems match whole words only.
            pattern = rf"\b{re.escape(stem)}" if len(stem) > 4 else rf"\b{re.escape(stem)}\b"
            if re.search(pattern, text):
                found.append(sector)
                break
    return found


def normalize_sectors(values) -> list[str]:
    """Map free-text sectors to the canonical list (deduplicated, canonical order). Unknown → ["Other"]."""
    if not values:
        return [OTHER]
    if isinstance(values, str):
        values = [values]
    found = set()
    for v in values:
        if v:
            found.update(_canonical(str(v)))
    return [s for s in SECTORS if s in found] or [OTHER]
