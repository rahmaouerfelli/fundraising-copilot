"""
Qdrant vector store — manages the 'grants' collection and semantic search.
"""

import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)
from config import settings

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        if settings.qdrant_url.strip().lower() == "local":
            _client = QdrantClient(path=settings.qdrant_local_path)
        else:
            _client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
    return _client


def init_collection() -> None:
    """Create the grants collection if it does not exist."""
    client = get_client()
    existing = [c.name for c in client.get_collections().collections]
    if settings.qdrant_collection not in existing:
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(
                size=settings.qdrant_vector_size,
                distance=Distance.COSINE,
            ),
        )


def upsert_grant(grant_id: int, vector: list[float], metadata: dict) -> str:
    """Store or update a grant vector. Returns the point UUID."""
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"grant:{grant_id}"))
    get_client().upsert(
        collection_name=settings.qdrant_collection,
        points=[
            PointStruct(
                id=point_id,
                vector=vector,
                payload={
                    "grant_id": grant_id,
                    "title": metadata.get("title", ""),
                    "funder_name": metadata.get("funder_name", ""),
                    "sectors": metadata.get("sectors", []),
                    "countries": metadata.get("countries", []),
                    "status": metadata.get("status", "active"),
                },
            )
        ],
    )
    return point_id


def _matches_any(values: list[str], wanted: list[str]) -> bool:
    """Case-insensitive, substring-tolerant match ("Education" ~ "education & youth")."""
    have = [v.lower() for v in values or []]
    return any(w.lower() in h or h in w.lower() for w in wanted for h in have)


def search_grants(
    query_vector: list[float],
    limit: int = 20,
    sector_filter: list[str] | None = None,
    country_filter: list[str] | None = None,
) -> list[dict]:
    """
    Semantic search over the grants collection.
    Returns list of {grant_id, score} dicts.

    Sector/country values are free text produced by the LLM, so they are filtered
    here case-insensitively instead of with Qdrant's exact-match conditions.
    """
    has_filters = bool(sector_filter or country_filter)
    results = get_client().search(
        collection_name=settings.qdrant_collection,
        query_vector=query_vector,
        query_filter=Filter(must=[FieldCondition(key="status", match=MatchValue(value="active"))]),
        limit=limit * 5 if has_filters else limit,
        with_payload=True,
    )

    hits = []
    for r in results:
        payload = r.payload or {}
        if sector_filter and not _matches_any(payload.get("sectors", []), sector_filter):
            continue
        if country_filter and not _matches_any(payload.get("countries", []), country_filter):
            continue
        hits.append({"grant_id": payload["grant_id"], "score": r.score})
        if len(hits) >= limit:
            break
    return hits


def delete_grant(grant_id: int) -> None:
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"grant:{grant_id}"))
    get_client().delete(
        collection_name=settings.qdrant_collection,
        points_selector=[point_id],
    )
