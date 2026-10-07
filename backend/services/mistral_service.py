"""
Mistral AI service — all LLM and embedding calls go through here.
Keeping this layer thin makes it easy to swap models later.
"""

import json
import logging
import re
import threading
import time
from datetime import date

from mistralai import Mistral
from mistralai.models import SDKError
from config import settings
from services.taxonomy import SECTORS

logger = logging.getLogger(__name__)

_PLACEHOLDER_KEYS = {"", "your_mistral_api_key_here"}


class MistralRateLimited(Exception):
    """Every configured chat model is rate limited (or has no quota) right now."""


def _client() -> Mistral:
    return Mistral(api_key=settings.mistral_api_key, timeout_ms=60_000)


def _is_configured() -> bool:
    return settings.mistral_api_key.strip() not in _PLACEHOLDER_KEYS


# ── Model selection with automatic fallback ───────────────────────────────────
# A model can have zero quota on a given Mistral plan (x-ratelimit-limit-req-minute: 0):
# retrying it is pointless, so it is disabled for the life of the process. A model that
# is merely busy is put on a short cooldown and the next model in the chain is used.

_lock = threading.Lock()
_disabled_models: set[str] = set()
_cooldown_until: dict[str, float] = {}
_MAX_WAIT_SECONDS = 20


def _model_chain() -> list[str]:
    chain = [settings.mistral_model, *settings.mistral_fallback_models]
    return [m for i, m in enumerate(chain) if m and m not in chain[:i]]


def _header(exc: SDKError, name: str) -> str | None:
    response = getattr(exc, "raw_response", None)
    return response.headers.get(name) if response is not None else None


def _handle_rate_limit(model: str, exc: SDKError) -> None:
    with _lock:
        if _header(exc, "x-ratelimit-limit-req-minute") == "0":
            if model not in _disabled_models:
                logger.warning("Mistral model %s has no quota on this account — switching to the next model.", model)
            _disabled_models.add(model)
            return
        try:
            wait = float(_header(exc, "retry-after") or 10)
        except ValueError:
            wait = 10
        _cooldown_until[model] = time.monotonic() + min(wait, 60)
        logger.info("Mistral model %s rate limited — cooling down %.0fs.", model, wait)


def _chat(messages: list[dict], *, max_tokens: int, temperature: float, json_mode: bool = False) -> str:
    """Run a chat completion on the first available model. Raises MistralRateLimited if none is available."""
    kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}
    waited = False
    while True:
        now = time.monotonic()
        available = [m for m in _model_chain() if m not in _disabled_models]
        if not available:
            raise MistralRateLimited("No configured Mistral chat model has quota on this account.")
        ready = [m for m in available if _cooldown_until.get(m, 0) <= now]
        if not ready:
            wait = min(_cooldown_until[m] for m in available) - now
            if waited or wait > _MAX_WAIT_SECONDS:
                raise MistralRateLimited(f"All Mistral models are rate limited (retry in {wait:.0f}s).")
            time.sleep(max(wait, 0.5))
            waited = True
            continue
        model = ready[0]
        try:
            response = _client().chat.complete(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs,
            )
            return (response.choices[0].message.content or "").strip()
        except SDKError as exc:
            if exc.status_code != 429:
                raise
            _handle_rate_limit(model, exc)


def _embed_with_retry(inputs: list[str]):
    delay = 2
    for attempt in range(4):
        try:
            return _client().embeddings.create(model=settings.mistral_embed_model, inputs=inputs)
        except SDKError as exc:
            if exc.status_code != 429 or attempt == 3:
                raise
            time.sleep(delay)
            delay *= 2


def _parse_json(raw: str):
    """
    Parse JSON from an LLM reply. Models often wrap it in ```json fences or add a
    sentence around it, so strip fences and fall back to the outermost [...] / {...}.
    Raises ValueError if nothing parseable is found.
    """
    text = (raw or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        start, end = text.find(open_ch), text.rfind(close_ch)
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                continue
    salvaged = _salvage_truncated_list(text)
    if salvaged is not None:
        return salvaged
    raise ValueError("No JSON found in model reply.")


def _salvage_truncated_list(text: str):
    """
    Recover the complete objects of a JSON list cut off by max_tokens,
    e.g. '[{"a": 1}, {"a": 2}, {"a"' -> [{"a": 1}, {"a": 2}].
    """
    start = text.find("[")
    if start == -1:
        return None
    decoder = json.JSONDecoder()
    items, pos = [], start + 1
    while True:
        while pos < len(text) and text[pos] in " \t\r\n,":
            pos += 1
        if pos >= len(text) or text[pos] != "{":
            break
        try:
            obj, pos = decoder.raw_decode(text, pos)
        except json.JSONDecodeError:
            break
        items.append(obj)
    return items or None


def _clamp_score(value, default: int = 50) -> int:
    try:
        return max(0, min(100, int(float(value))))
    except (TypeError, ValueError):
        return default


def _to_float(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


# ── Embeddings ────────────────────────────────────────────────────────────────

def embed(text: str) -> list[float]:
    """Return a 1024-dim embedding vector for the given text."""
    return embed_many([text])[0]


def embed_many(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    """Embed several texts with one API call per batch."""
    if not _is_configured():
        raise RuntimeError("MISTRAL_API_KEY not configured.")
    vectors: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = [t[:8000] for t in texts[i:i + batch_size]]  # stay within token limit
        response = _embed_with_retry(batch)
        vectors.extend(item.embedding for item in response.data)
    return vectors


def ngo_profile_text(ngo: dict) -> str:
    parts = [
        f"NGO: {ngo.get('name', '')}",
        f"Mission: {ngo.get('mission', '')}",
        f"Country: {ngo.get('country', '')}",
        f"Sectors: {', '.join(ngo.get('sectors', []))}",
        f"Beneficiaries: {ngo.get('beneficiaries', '')}",
        f"Funding needs: {ngo.get('funding_needs', '')}",
        f"Keywords: {', '.join(ngo.get('keywords', []))}",
    ]
    return " | ".join(p for p in parts if p.split(": ", 1)[-1].strip())


def grant_text(grant: dict) -> str:
    parts = [
        f"Title: {grant.get('title', '')}",
        f"Funder: {grant.get('funder_name', '')}",
        f"Description: {grant.get('description', '')}",
        f"Sectors: {', '.join(grant.get('sectors', []))}",
        f"Countries: {', '.join(grant.get('countries', []))}",
        f"Eligibility: {grant.get('eligibility_criteria', '')}",
    ]
    return " | ".join(p for p in parts if p.split(": ", 1)[-1].strip())


def embed_ngo_profile(ngo: dict) -> list[float]:
    """Build a rich text representation of an NGO profile and embed it."""
    return embed(ngo_profile_text(ngo))


def embed_grant(grant: dict) -> list[float]:
    """Embed a grant document for storage in Qdrant."""
    return embed(grant_text(grant))


# ── Match scoring ─────────────────────────────────────────────────────────────

def _ngo_block(ngo: dict) -> str:
    return (
        f"- Name: {ngo.get('name')}\n"
        f"- Mission: {ngo.get('mission')}\n"
        f"- Country: {ngo.get('country')}\n"
        f"- Sectors: {', '.join(ngo.get('sectors', []))}\n"
        f"- Beneficiaries: {ngo.get('beneficiaries') or 'N/A'}\n"
        f"- Funding needs: {ngo.get('funding_needs') or 'N/A'}\n"
        f"- Preferred grant size: {ngo.get('preferred_grant_size_min') or 'any'} – "
        f"{ngo.get('preferred_grant_size_max') or 'any'} USD\n"
    )


def _grant_block(grant: dict, description_chars: int) -> str:
    return (
        f"- Title: {grant.get('title')}\n"
        f"- Funder: {grant.get('funder_name')}\n"
        f"- Description: {(grant.get('description') or '')[:description_chars]}\n"
        f"- Amount: {grant.get('amount_min') or 'N/A'} – {grant.get('amount_max') or 'N/A'} {grant.get('currency') or 'USD'}\n"
        f"- Sectors: {', '.join(grant.get('sectors', []))}\n"
        f"- Countries: {', '.join(grant.get('countries', []))}\n"
        f"- Eligibility: {(grant.get('eligibility_criteria') or 'N/A')[:400]}\n"
    )


def score_grant_match(ngo: dict, grant: dict) -> dict:
    """Score one grant. Returns {"score", "explanation", "readiness_score"}."""
    return score_grants_batch(ngo, [grant])[grant["id"]]


def score_grants_batch(ngo: dict, grants: list[dict]) -> dict[int, dict]:
    """
    Score several grants against an NGO in a single LLM call.
    Returns {grant_id: {"score": int, "explanation": str, "readiness_score": int}}.
    Raises MistralRateLimited when no model is available.
    """
    if not grants:
        return {}
    if not _is_configured():
        return {
            g["id"]: {"score": 50, "explanation": "AI scoring unavailable — Mistral not configured.", "readiness_score": 50}
            for g in grants
        }

    system = (
        "You are a fundraising expert evaluating grant-NGO compatibility. "
        "Respond ONLY with a JSON object."
    )
    grants_text = "\n".join(f"Grant id={g['id']}:\n{_grant_block(g, 800)}" for g in grants)
    user = (
        f"NGO profile:\n{_ngo_block(ngo)}\n"
        f"Grants to evaluate:\n{grants_text}\n"
        "For EACH grant, score how well it fits this NGO (sector, country eligibility, size, beneficiaries). "
        "Return JSON: {\"results\": [{\"id\": <grant id>, \"score\": <0-100>, "
        "\"explanation\": \"<2-3 sentences why it matches or not>\", \"readiness_score\": <0-100>}]}"
    )
    raw = _chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=180 * len(grants) + 100,
        temperature=0.1,
        json_mode=True,
    )
    try:
        data = _parse_json(raw)
    except ValueError:
        data = {}
    items = data.get("results", []) if isinstance(data, dict) else data if isinstance(data, list) else []

    scores: dict[int, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            gid = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        scores[gid] = {
            "score": _clamp_score(item.get("score")),
            "explanation": str(item.get("explanation") or ""),
            "readiness_score": _clamp_score(item.get("readiness_score")),
        }
    return scores


# ── Grant extraction from scraped text ───────────────────────────────────────

MAX_GRANTS_PER_PAGE = 15


def extract_grants_from_text(text: str, source_url: str, eligible_countries: list[str] | None = None) -> list[dict]:
    """
    Given raw scraped text from a grant website, extract structured grant opportunities.
    Returns a list of grant dicts ready for DB insertion. Raises MistralRateLimited.
    """
    if not _is_configured():
        return []

    countries = ", ".join(eligible_countries or ["Tunisia"])
    system = (
        "You are a grant data extractor for NGOs. "
        "Extract only concrete funding opportunities (calls for proposals, grants, funds an NGO can apply to). "
        "Ignore news articles, company profiles, directories without a concrete call, and calls whose deadline has passed. "
        f"Only keep opportunities that NGOs based in {countries} can apply to: calls open to that country, "
        "its region (North Africa, MENA, Mediterranean, Africa, Arab states) or worldwide. "
        "Exclude calls restricted to other countries. "
        "Respond ONLY with a JSON object."
    )
    user = (
        f"Today is {date.today().isoformat()}.\n"
        f"Source URL: {source_url}\n\n"
        f"Page text (excerpts):\n{text}\n\n"
        f"Return JSON: {{\"grants\": [ ... ]}} with at most {MAX_GRANTS_PER_PAGE} grants, most relevant first "
        "(empty list if none). Each grant:\n"
        '{"title": str, "description": str (1-3 sentences), "funder_name": str, '
        '"amount_min": number|null, "amount_max": number|null, "currency": str, '
        '"deadline": "YYYY-MM-DD"|null, "eligibility_criteria": str|null (1 sentence), '
        f'"sectors": [one or more of: {", ".join(SECTORS)}], "countries": [str], '
        '"source_url": str (the specific page of this opportunity if the text links to it, otherwise null)}\n'
        "Write plain text only (no markdown)."
    )

    raw = _chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=6000,
        temperature=0.0,
        json_mode=True,
    )
    try:
        data = _parse_json(raw)
    except ValueError:
        logger.warning("Could not parse grant extraction reply for %s: %r", source_url, raw[:200])
        return []
    if isinstance(data, dict):
        # Expected {"grants": [...]}, but a single grant object is accepted too.
        data = data.get("grants", [data]) if "title" not in data else [data]
    return [g for g in data if isinstance(g, dict) and g.get("title")] if isinstance(data, list) else []


# ── Application drafting ──────────────────────────────────────────────────────

SECTION_PROMPTS = {
    "executive_summary": "Write a concise executive summary (150–200 words) for a grant application.",
    "objectives": "Write clear, SMART objectives (3–5 bullet points) for a grant application.",
    "impact": "Describe the expected impact and outcomes (150–200 words) for a grant application.",
    "activities": "List the key project activities (5–8 bullet points) for a grant application.",
    "budget_justification": "Write a budget justification narrative (150–200 words) for a grant application.",
    "indicators": "Define measurable success indicators (4–6 bullet points) for a grant application.",
}


def draft_application_section(ngo: dict, grant: dict, section: str) -> str:
    """Generate a first draft for one section of a grant application."""
    if not _is_configured():
        return f"[AI draft unavailable — MISTRAL_API_KEY not configured. Please fill in this {section} section manually.]"

    instruction = SECTION_PROMPTS.get(section, f"Write the {section} section.")
    system = (
        "You are an expert grant writer for NGOs. "
        "Write in clear, professional English. Be specific and evidence-based. "
        "Do not use generic filler text."
    )
    user = (
        f"{instruction}\n\n"
        f"NGO: {ngo.get('name')} — {ngo.get('mission')}\n"
        f"Country: {ngo.get('country')} | Sectors: {', '.join(ngo.get('sectors') or [])}\n"
        f"Beneficiaries: {ngo.get('beneficiaries') or 'N/A'}\n\n"
        f"Grant: {grant.get('title')} by {grant.get('funder_name')}\n"
        f"Description: {(grant.get('description') or '')[:1000]}"
    )
    try:
        return _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=600,
            temperature=0.4,
        )
    except MistralRateLimited:
        return "[AI draft temporarily unavailable — the Mistral rate limit was reached. Please try again in a minute.]"


# ── Conversational search ─────────────────────────────────────────────────────

def parse_search_intent(prompt: str) -> dict:
    """
    Convert a natural-language search prompt into structured search parameters.
    Returns {"query": str, "sectors": [], "countries": [], "min_amount": null, "max_amount": null}.
    """
    fallback = {"query": prompt, "sectors": [], "countries": [], "min_amount": None, "max_amount": None}
    if not _is_configured():
        return fallback

    system = (
        "Extract search parameters from a natural language grant search query (any language). "
        "Respond ONLY with a JSON object."
    )
    user = (
        f'Query: "{prompt}"\n\n'
        "Return: "
        '{"query": "<short English search text>", "sectors": [<sectors in English>], '
        '"countries": [<countries in English>], "min_amount": <number or null>, "max_amount": <number or null>}'
    )
    try:
        data = _parse_json(_chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=200,
            temperature=0.0,
            json_mode=True,
        ))
    except (ValueError, MistralRateLimited):
        return fallback
    if not isinstance(data, dict):
        return fallback
    return {
        "query": str(data.get("query") or prompt),
        "sectors": [str(x) for x in (data.get("sectors") or []) if x],
        "countries": [str(x) for x in (data.get("countries") or []) if x],
        "min_amount": _to_float(data.get("min_amount")),
        "max_amount": _to_float(data.get("max_amount")),
    }
