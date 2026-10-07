"""
Grant ingestion pipeline.

One cycle:
  1. discover new grant pages with Tavily (news and off-topic results are filtered out);
     their text is fetched with one batched Tavily extract call
  2. pick the sources that are due (never analysed, or not crawled for `source_recrawl_hours`)
  3. download the other pages in parallel; pages blocked for bots go through Tavily extract
  4. skip pages whose relevant text did not change since the last scan
  5. Mistral extracts grants open to the registered NGOs' countries (a few pages in parallel)
  6. grants are saved, then embedded in batches and indexed in Qdrant

Cycles run in a background thread (see start_background_ingestion) and publish their
progress so the UI can poll it instead of waiting on one very long HTTP request.
"""

import hashlib
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from models.grant import Grant, GrantSource
from models.ngo import NGO
from services import mistral_service, qdrant_service, tavily_service, url_safety
from services.mistral_service import MistralRateLimited
from services.taxonomy import normalize_sectors

logger = logging.getLogger(__name__)

# Ingestion is slow and calls paid APIs — the scheduler and the manual trigger share this lock
# so two cycles never run at once.
ingestion_lock = threading.Lock()

# Domains that are never grant pages — skip even if a search engine returns them.
DISCOVERY_BLOCKLIST = (
    "wikipedia.org", "facebook.com", "twitter.com", "x.com", "linkedin.com",
    "instagram.com", "youtube.com", "pinterest.com", "tiktok.com", "reddit.com",
    "finance.yahoo.com", "tracxn.com", "crunchbase.com", "ngobase.org", "glassdoor.", "indeed.",
)

# Tavily relevance score below which a search result is ignored (0–1).
MIN_DISCOVERY_SCORE = 0.5

# Max Tavily queries per cycle (one query per NGO sector otherwise grows with the user base).
MAX_DISCOVERY_QUERIES = 8

# Fallback search queries used when no NGO profile exists yet to tailor the search.
DEFAULT_DISCOVERY_QUERIES = [
    "grant opportunities for NGOs in Tunisia 2026",
    "call for proposals Tunisia civil society organizations",
    "funding open calls Tunisia nonprofit",
    "EU grants Tunisia civil society funding",
    "foundation grants North Africa NGO Tunisia",
]

# Default grant sources seeded on first run
DEFAULT_SOURCES = [
    {"name": "Anna Lindh Foundation", "url": "https://www.annalindhfoundation.org/calls"},
    {"name": "Open Society Foundations", "url": "https://www.opensocietyfoundations.org/grants"},
    {"name": "UNDP Tunisia", "url": "https://www.tn.undp.org/content/tunisia/fr/home/operations/projects.html"},
    {"name": "European Union EuropeAid", "url": "https://ec.europa.eu/europeaid/funding/about-funding-and-procedures_en"},
]

# A source is deactivated after this many consecutive failed crawls (dead domain, 403...).
MAX_SOURCE_FAILURES = 3

# Cap on how many new sources one discovery run may add, so the crawl list stays bounded.
MAX_DISCOVERED_PER_CYCLE = 10

# Pages analysed by the LLM at the same time (the model fallback absorbs short rate limits).
EXTRACTION_WORKERS = 3

# Page text sent to the LLM: the most grant-relevant excerpts, up to this many characters.
MAX_PAGE_CHARS = 12_000
_CHUNK_CHARS = 1_200
_RELEVANCE_WORDS = (
    "grant", "call for proposal", "funding", "deadline", "apply", "eligib", "award", "fund",
    "subvention", "appel à projet", "appel a projet", "financement", "date limite", "candidature",
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
}


# ── Progress reporting ────────────────────────────────────────────────────────

_progress_lock = threading.Lock()
_progress: dict = {"running": False, "phase": "idle", "last_result": None}


def _set_progress(**fields) -> None:
    with _progress_lock:
        _progress.update(fields)


def get_progress() -> dict:
    with _progress_lock:
        return dict(_progress)


# ── Sources ───────────────────────────────────────────────────────────────────

def seed_default_sources(db: Session) -> None:
    """Insert default grant sources if the table is empty."""
    if db.query(GrantSource).count() > 0:
        return
    for s in DEFAULT_SOURCES:
        db.add(GrantSource(name=s["name"], url=s["url"]))
    db.commit()
    logger.info("Seeded %d default grant sources.", len(DEFAULT_SOURCES))


def build_discovery_queries(db: Session) -> list[str]:
    """Build search queries tailored to registered NGOs' sectors, or fall back to generic Tunisia/NGO queries."""
    ngos = db.query(NGO).all()
    if not ngos:
        return DEFAULT_DISCOVERY_QUERIES

    queries = []
    for ngo in ngos:
        country = ngo.country or "Tunisia"
        sectors = ngo.sectors or []
        if sectors:
            for sector in sectors:
                queries.append(f"open call for proposals {sector} NGOs {country} {date.today().year}")
        else:
            queries.append(f"grant opportunities for NGOs in {country} {date.today().year}")
    deduped = list(dict.fromkeys(queries))  # de-duplicate while preserving order
    return deduped[:MAX_DISCOVERY_QUERIES] or DEFAULT_DISCOVERY_QUERIES


def _is_blocked_domain(url: str) -> bool:
    return any(domain in url for domain in DISCOVERY_BLOCKLIST)


def discover_sources(db: Session, queries: list[str] | None = None, max_results_per_query: int = 5) -> tuple[list[GrantSource], dict[str, str]]:
    """
    Search the web via Tavily for grant-related pages and register any new ones as GrantSource rows.
    Returns (new_sources, page_text_by_url) — the text comes with the search results, so these
    pages do not need to be downloaded again.
    """
    if not tavily_service.is_configured():
        logger.info("Tavily not configured — skipping discovery, using existing sources only.")
        return [], {}

    queries = queries or build_discovery_queries(db)
    existing_urls = {s.url for s in db.query(GrantSource).all()}
    new_sources: list[GrantSource] = []

    def run(query: str) -> list[dict]:
        # Light search (no page content): large responses fail intermittently over TLS.
        return tavily_service.search(query, max_results=max_results_per_query)

    with ThreadPoolExecutor(max_workers=4) as pool:
        all_results = list(pool.map(run, queries))

    for results in all_results:
        for r in results:
            if len(new_sources) >= MAX_DISCOVERED_PER_CYCLE:
                break
            url = r["url"].strip()[:1000]
            if (
                not url
                or url in existing_urls
                or r["score"] < MIN_DISCOVERY_SCORE
                or not _looks_like_funding_page(r)
                or _is_blocked_domain(url)
                or not url_safety.is_public_http_url(url)
            ):
                continue
            source = GrantSource(name=(r.get("title") or url)[:255], url=url, is_active=True)
            db.add(source)
            existing_urls.add(url)
            new_sources.append(source)

    page_text: dict[str, str] = {}
    if new_sources:
        db.commit()
        logger.info("Discovered %d new grant sources via Tavily.", len(new_sources))
        # One batched call returns the text of all new pages, including sites that block scrapers.
        page_text = tavily_service.extract([s.url for s in new_sources])
    return new_sources, page_text


_FUNDING_WORDS = (
    "grant", "call for", "funding", "fund", "proposal", "apply", "deadline", "award", "fellowship",
    "subvention", "appel", "financement", "candidature",
)


def _looks_like_funding_page(result: dict) -> bool:
    """Drop news articles and unrelated pages: the title or snippet must talk about funding."""
    text = f"{result.get('title', '')} {result.get('content', '')}".lower()
    return sum(text.count(w) for w in _FUNDING_WORDS) >= 2


def _due_sources(db: Session, discovered: list[GrantSource]) -> list[GrantSource]:
    """
    Newly discovered sources first, then pages never analysed by the LLM, then the stalest — capped per cycle.
    A page counts as analysed once content_hash is set (a fetch alone, e.g. before a rate limit, does not count).
    """
    cutoff = datetime.utcnow() - timedelta(hours=settings.source_recrawl_hours)
    discovered_ids = {s.id for s in discovered}
    others = (
        db.query(GrantSource)
        .filter(
            GrantSource.is_active == True,  # noqa: E712
            (GrantSource.content_hash.is_(None))
            | (GrantSource.last_crawled_at.is_(None))
            | (GrantSource.last_crawled_at < cutoff),
        )
        .all()
    )
    others = [s for s in others if s.id not in discovered_ids]
    others.sort(key=lambda s: (s.content_hash is not None, s.last_crawled_at or datetime.min))
    return (discovered + others)[: settings.ingestion_max_sources_per_cycle]


# ── Fetching ──────────────────────────────────────────────────────────────────

class ScrapeError(Exception):
    """Raised when a page cannot be fetched. `blocked` = the site refused us (worth retrying via Tavily)."""

    def __init__(self, message: str, blocked: bool = False):
        super().__init__(message)
        self.blocked = blocked


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg", "form", "aside"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    return main.get_text(separator=" ", strip=True)


def scrape_url(url: str, timeout: int = 15) -> str:
    """Fetch a URL and return clean text content. Raises ScrapeError on failure."""
    if not url_safety.is_public_http_url(url):
        raise ScrapeError(f"Refusing to fetch non-public URL: {url}")
    try:
        with httpx.Client(headers=HEADERS, timeout=timeout, follow_redirects=True) as client:
            response = client.get(url)
    except httpx.ConnectError as exc:
        # DNS failure / connection refused: the site is down or gone.
        raise ScrapeError(str(exc), blocked=False) from exc
    except Exception as exc:
        # Timeouts, TLS errors... — often anti-bot protection.
        raise ScrapeError(str(exc), blocked=True) from exc
    if response.status_code >= 400:
        blocked = response.status_code in (401, 403, 406, 429, 503)
        raise ScrapeError(f"HTTP {response.status_code}", blocked=blocked)
    if not url_safety.is_public_http_url(str(response.url)):
        raise ScrapeError(f"Redirected to non-public URL: {response.url}")
    return html_to_text(response.text)


def _fetch_pages(sources: list[GrantSource], prefetched: dict[str, str]) -> tuple[dict[int, str], dict[int, str]]:
    """
    Get the text of every source page. Returns (text_by_source_id, error_by_source_id).
    Downloads run in parallel; pages that block bots are retried through Tavily extract.
    """
    texts: dict[int, str] = {}
    errors: dict[int, str] = {}
    to_download = []
    for s in sources:
        if prefetched.get(s.url):
            texts[s.id] = prefetched[s.url]
        else:
            to_download.append(s)

    def fetch(source: GrantSource):
        try:
            return source, scrape_url(source.url), None
        except ScrapeError as exc:
            return source, None, exc

    blocked: list[GrantSource] = []
    with ThreadPoolExecutor(max_workers=settings.scrape_concurrency) as pool:
        for source, text, exc in pool.map(fetch, to_download):
            if text is not None:
                texts[source.id] = text
            elif exc.blocked:
                blocked.append(source)
                errors[source.id] = str(exc)
            else:
                errors[source.id] = str(exc)

    if blocked:
        extracted = tavily_service.extract([s.url for s in blocked])
        for s in blocked:
            if extracted.get(s.url):
                texts[s.id] = extracted[s.url]
                errors.pop(s.id, None)
        logger.info("Tavily extract recovered %d/%d blocked pages.", sum(1 for s in blocked if s.id in texts), len(blocked))
    return texts, errors


def focus_text(text: str, max_chars: int = MAX_PAGE_CHARS) -> str:
    """Keep the parts of a long page that talk about grants (in page order), up to max_chars."""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return text
    chunks = [text[i:i + _CHUNK_CHARS] for i in range(0, len(text), _CHUNK_CHARS)]
    scores = []
    for idx, chunk in enumerate(chunks):
        lower = chunk.lower()
        scores.append((sum(lower.count(w) for w in _RELEVANCE_WORDS), -idx))
    keep = {0}  # the page intro usually names the funder / programme
    budget = max_chars // _CHUNK_CHARS - 1
    for score, neg_idx in sorted(scores, reverse=True):
        if budget <= 0 or score == 0:
            break
        if -neg_idx not in keep:
            keep.add(-neg_idx)
            budget -= 1
    return " […] ".join(chunks[i] for i in sorted(keep))


# ── Coercion of LLM-extracted values (the model may return null, numbers, lists...) ──

_MARKDOWN = re.compile(r"(\*\*|__|`|^#+\s*)", re.MULTILINE)


def strip_markdown(text: str) -> str:
    return _MARKDOWN.sub("", text)


def _text(value, default: str = "", max_len: int | None = None) -> str:
    if value is None:
        return default
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value if v is not None)
    value = strip_markdown(str(value)).strip() or default
    return value[:max_len] if max_len else value


def _number(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "").replace(" ", ""))
    except (TypeError, ValueError):
        return None


def _str_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if v is not None and str(v).strip()]


def _parse_deadline(value) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip()
    for fmt, length in (("%Y-%m-%dT%H:%M:%S", 19), ("%Y-%m-%d", 10), ("%d/%m/%Y", 10)):
        try:
            return datetime.strptime(raw[:length], fmt)
        except ValueError:
            continue
    return None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "grant"


# ── Saving & indexing ─────────────────────────────────────────────────────────

def _grant_payload(grant: Grant) -> dict:
    return {
        "title": grant.title,
        "funder_name": grant.funder_name,
        "description": grant.description,
        "sectors": grant.sectors or [],
        "countries": grant.countries or [],
        "eligibility_criteria": grant.eligibility_criteria or "",
        "status": grant.status,
    }


def index_grants(grants: list[Grant]) -> int:
    """Embed grants in batches and upsert them into Qdrant. Returns how many were indexed."""
    if not grants:
        return 0
    try:
        vectors = mistral_service.embed_many([mistral_service.grant_text(_grant_payload(g)) for g in grants])
    except Exception as exc:
        logger.warning("Embedding failed for %d grants: %s", len(grants), exc)
        return 0
    indexed = 0
    for grant, vector in zip(grants, vectors):
        try:
            grant.qdrant_id = qdrant_service.upsert_grant(grant.id, vector, _grant_payload(grant))
            indexed += 1
        except Exception as exc:
            logger.warning("Qdrant indexing failed for grant %s: %s", grant.title[:50], exc)
    return indexed


def index_grant(grant: Grant) -> bool:
    return index_grants([grant]) == 1


def _save_grant(db: Session, grant_data: dict, source_id: int | None) -> tuple[Grant | None, bool]:
    """
    Persist a grant (not yet indexed — see index_grants).
    Returns (grant, created) — created is False when the grant already existed or was skipped.
    """
    source_url = _text(grant_data.get("source_url"), max_len=1000)
    title = _text(grant_data.get("title"), max_len=500)
    if not source_url or not title:
        return None, False

    deadline = _parse_deadline(grant_data.get("deadline"))
    if deadline and deadline.date() < date.today():
        return None, False  # call already closed

    existing = db.query(Grant).filter(Grant.source_url == source_url).first()
    if existing:
        return existing, False
    # The same call is often listed on several aggregator pages: dedupe on the title too.
    same_title = db.query(Grant).filter(func.lower(Grant.title) == title.lower()).first()
    if same_title:
        return same_title, False

    grant = Grant(
        title=title,
        description=_text(grant_data.get("description"), default=title),
        funder_name=_text(grant_data.get("funder_name"), default="Unknown", max_len=255),
        funder_url=_text(grant_data.get("funder_url"), max_len=1000) or None,
        amount_min=_number(grant_data.get("amount_min")),
        amount_max=_number(grant_data.get("amount_max")),
        currency=_text(grant_data.get("currency"), default="USD", max_len=10),
        deadline=deadline,
        eligibility_criteria=_text(grant_data.get("eligibility_criteria")) or None,
        sectors=normalize_sectors(_str_list(grant_data.get("sectors"))),
        countries=_str_list(grant_data.get("countries")),
        languages=_str_list(grant_data.get("languages")),
        source_url=source_url,
        source_id=source_id,
        status="active",
    )
    db.add(grant)
    db.flush()
    return grant, True


def _record_failure(db: Session, source: GrantSource) -> None:
    source.failure_count = (source.failure_count or 0) + 1
    if source.failure_count >= MAX_SOURCE_FAILURES:
        source.is_active = False
        logger.info("Deactivating source %s after %d consecutive failures.", source.url, source.failure_count)


def _save_page_grants(db: Session, source: GrantSource, digest: str, grants_data: list[dict]) -> list[Grant]:
    """Save the grants extracted from one page. Returns the new grants."""
    new_grants = []
    for gd in grants_data:
        # Several grants listed on the same page would otherwise collide on the
        # unique source_url, so give each one its own anchor on that page.
        url = _text(gd.get("source_url"))
        if not url or url.rstrip("/") == source.url.rstrip("/") or not url.startswith("http"):
            gd["source_url"] = f"{source.url}#{_slug(_text(gd.get('title')))}"
        try:
            grant, created = _save_grant(db, gd, source.id)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Skipping malformed grant from %s: %s", source.url, exc)
            continue
        if created:
            new_grants.append(grant)

    source.content_hash = digest
    source.last_crawled_at = datetime.utcnow()
    if grants_data:
        source.failure_count = 0
    else:
        # A page that keeps yielding nothing (news article, closed call...) counts as a failure,
        # so it is eventually deactivated instead of being re-analysed forever.
        _record_failure(db, source)
    db.commit()
    return new_grants


def close_expired_grants(db: Session) -> int:
    """Mark grants whose deadline has passed as closed, so they leave search results and matches."""
    count = (
        db.query(Grant)
        .filter(Grant.status == "active", Grant.deadline.isnot(None), Grant.deadline < datetime.combine(date.today(), datetime.min.time()))
        .update({Grant.status: "closed"}, synchronize_session=False)
    )
    db.commit()
    if count:
        logger.info("Closed %d grants whose deadline has passed.", count)
    return count


def normalize_existing_grants(db: Session) -> int:
    """
    One-off cleanup for grants saved before sector normalization: map sectors to the canonical
    list and strip markdown. Changed grants are flagged for re-indexing (Qdrant payload holds sectors).
    """
    changed = 0
    for grant in db.query(Grant).all():
        sectors = normalize_sectors(grant.sectors)
        description = strip_markdown(grant.description or "")
        if sectors != (grant.sectors or []) or description != grant.description:
            grant.sectors = sectors
            grant.description = description
            grant.qdrant_id = None
            changed += 1
    if changed:
        db.commit()
        logger.info("Normalized sectors/markdown of %d grants.", changed)
    return changed


def reindex_missing_grants(db: Session) -> int:
    """Index grants that are in the database but missing from Qdrant."""
    grants = db.query(Grant).filter(Grant.qdrant_id.is_(None), Grant.status == "active").all()
    indexed = index_grants(grants)
    if grants:
        db.commit()
        logger.info("Re-indexed %d/%d grants missing from Qdrant.", indexed, len(grants))
    return indexed


# ── Cycle ─────────────────────────────────────────────────────────────────────

def run_ingestion_cycle(db: Session) -> dict:
    """Full ingestion cycle. Safe to call directly (tests); the app runs it via start_background_ingestion."""
    started = datetime.utcnow()
    seed_default_sources(db)
    close_expired_grants(db)

    _set_progress(phase="discovering", processed=0, total=0, new_grants=0)
    try:
        discovered, prefetched = discover_sources(db)
    except Exception as exc:
        db.rollback()
        logger.error("Source discovery failed: %s", exc)
        discovered, prefetched = [], {}

    sources = _due_sources(db, discovered)
    _set_progress(phase="fetching", discovered=len(discovered), pages_due=len(sources))
    texts, errors = _fetch_pages(sources, prefetched)
    _set_progress(pages_fetched=len(texts), pages_failed=len(errors))

    results = []
    for source in sources:
        if source.id in errors:
            logger.warning("Failed to fetch %s: %s", source.url, errors[source.id])
            _record_failure(db, source)
            results.append({"source": source.name, "error": errors[source.id]})
    db.commit()

    # Pages whose relevant text is unchanged since the last scan are not sent to the LLM again.
    pages = []
    for source in sources:
        if source.id not in texts:
            continue
        excerpt = focus_text(texts[source.id])
        digest = hashlib.sha256(excerpt.encode("utf-8")).hexdigest()
        if source.content_hash == digest:
            source.last_crawled_at = datetime.utcnow()
            source.failure_count = 0
            results.append({"source": source.name, "new_grants": 0, "unchanged": True})
        else:
            pages.append((source, excerpt, digest))
    db.commit()

    _set_progress(phase="extracting", total=len(pages), processed=0, pages_unchanged=len(texts) - len(pages))
    eligible_countries = sorted({n.country for n in db.query(NGO).all() if n.country}) or ["Tunisia"]
    total_new = 0
    skipped = 0
    stopped_reason = None
    rate_limited = threading.Event()

    def extract(page):
        # Runs in a worker thread: LLM call only, no database access.
        source_url, excerpt = page
        if rate_limited.is_set():
            return None
        try:
            return mistral_service.extract_grants_from_text(excerpt, source_url, eligible_countries)
        except MistralRateLimited:
            rate_limited.set()
            return None

    with ThreadPoolExecutor(max_workers=EXTRACTION_WORKERS) as pool:
        futures = [pool.submit(extract, (s.url, excerpt)) for s, excerpt, _ in pages]
        for i, ((source, _, digest), future) in enumerate(zip(pages, futures)):
            try:
                grants_data = future.result()
            except Exception as exc:
                logger.error("Ingestion error for %s: %s", source.name, exc)
                results.append({"source": source.name, "error": str(exc)})
                continue
            if grants_data is None:
                skipped += 1  # rate limited — content_hash not updated, so the page stays due
                continue
            try:
                new_grants = _save_page_grants(db, source, digest, grants_data)
                if new_grants:
                    index_grants(new_grants)
                    db.commit()
            except Exception as exc:
                db.rollback()
                logger.error("Saving grants failed for %s: %s", source.name, exc)
                results.append({"source": source.name, "error": str(exc)})
                continue
            total_new += len(new_grants)
            results.append({"source": source.name, "new_grants": len(new_grants)})
            logger.info("Ingested %d new grants from %s", len(new_grants), source.name)
            _set_progress(processed=i + 1, new_grants=total_new)

    if skipped:
        stopped_reason = f"Mistral rate limit reached — {skipped} pages left for the next scan."
        logger.warning("Extraction stopped early: %s", stopped_reason)

    _set_progress(phase="indexing")
    reindexed = reindex_missing_grants(db)
    return {
        "total_new_grants": total_new,
        "sources": results,
        "sources_scanned": len(sources),
        "discovered_sources": len(discovered),
        "reindexed_grants": reindexed,
        "stopped_reason": stopped_reason,
        "duration_seconds": round((datetime.utcnow() - started).total_seconds(), 1),
    }


def _run_locked_cycle() -> None:
    """Run one cycle in its own DB session; the caller must hold ingestion_lock."""
    from models.database import SessionLocal
    db = SessionLocal()
    try:
        result = run_ingestion_cycle(db)
        logger.info(
            "Ingestion cycle complete in %ss: %s new grants from %s sources.",
            result["duration_seconds"], result["total_new_grants"], result["sources_scanned"],
        )
        _set_progress(running=False, phase="done", finished_at=datetime.utcnow().isoformat() + "Z", last_result=result, error=None)
    except Exception as exc:
        logger.exception("Ingestion cycle failed")
        _set_progress(running=False, phase="failed", finished_at=datetime.utcnow().isoformat() + "Z", error=str(exc))
    finally:
        db.close()
        ingestion_lock.release()


def start_background_ingestion() -> bool:
    """Start a cycle in a background thread. Returns False if one is already running."""
    if not ingestion_lock.acquire(blocking=False):
        return False
    _set_progress(
        running=True, phase="starting", processed=0, total=0, new_grants=0,
        discovered=0, pages_due=0, pages_fetched=0, pages_failed=0, pages_unchanged=0,
        started_at=datetime.utcnow().isoformat() + "Z", finished_at=None, error=None,
    )
    threading.Thread(target=_run_locked_cycle, name="grant-ingestion", daemon=True).start()
    return True
