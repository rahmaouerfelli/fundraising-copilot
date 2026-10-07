from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve paths relative to backend/ so the app works whatever directory uvicorn is launched from.
BACKEND_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    # Database — SQLite by default (switch to postgresql://... for production)
    database_url: str = "sqlite:///./data/fundraising_copilot.db"

    # Qdrant — set QDRANT_URL="local" to use embedded on-disk storage (no server/Docker needed)
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "grants"
    qdrant_vector_size: int = 1024  # mistral-embed output dimension
    qdrant_local_path: str = "./data/qdrant_local"

    # Mistral AI
    mistral_api_key: str = ""
    mistral_model: str = "ministral-14b-latest"
    # Used in order when the main model is rate limited or has no quota on the account.
    mistral_fallback_models: list[str] = ["ministral-8b-latest", "ministral-3b-latest"]
    mistral_embed_model: str = "mistral-embed"

    # Tavily — web search for grant discovery
    tavily_api_key: str = ""

    # Security
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Scheduler
    ingestion_interval_hours: int = 6
    # A source crawled successfully less than this many hours ago is skipped by the next scan.
    source_recrawl_hours: int = 24
    # Max pages sent to the LLM per scan (keeps a manual scan to a few minutes).
    ingestion_max_sources_per_cycle: int = 25
    # Parallel page downloads.
    scrape_concurrency: int = 8
    reminder_check_interval_hours: int = 24

    # App
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]

    class Config:
        env_file = BACKEND_DIR / ".env"


def _resolve_relative_paths(s: Settings) -> Settings:
    if s.database_url.startswith("sqlite:///./"):
        s.database_url = "sqlite:///" + (BACKEND_DIR / s.database_url[len("sqlite:///./"):]).as_posix()
    if not Path(s.qdrant_local_path).is_absolute():
        s.qdrant_local_path = str(BACKEND_DIR / s.qdrant_local_path)
    return s


settings = _resolve_relative_paths(Settings())
