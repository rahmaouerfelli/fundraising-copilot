import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models.database import init_database
from routers import auth, ngos, grants, matches, pipeline, applications, dashboard
from services.scheduler import start_scheduler, stop_scheduler
from services.qdrant_service import init_collection

logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — initialising database and Qdrant collection...")
    init_database()
    try:
        init_collection()
        logger.info("Qdrant collection ready.")
    except Exception as exc:
        logger.warning("Qdrant unavailable at startup (%s) — semantic search will be disabled.", exc)
    _startup_maintenance()
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("Shutdown complete.")


def _startup_maintenance() -> None:
    """Close expired grants, normalize old sectors, and re-index changed grants in the background."""
    import threading
    from models.database import SessionLocal
    from services.ingestion_service import close_expired_grants, normalize_existing_grants, reindex_missing_grants

    db = SessionLocal()
    try:
        close_expired_grants(db)
        normalize_existing_grants(db)
    except Exception as exc:
        logger.error("Startup maintenance failed: %s", exc)
    finally:
        db.close()

    def reindex():
        db = SessionLocal()
        try:
            reindex_missing_grants(db)
        except Exception as exc:
            logger.warning("Background re-indexing failed: %s", exc)
        finally:
            db.close()

    threading.Thread(target=reindex, name="reindex", daemon=True).start()


app = FastAPI(
    title="AI Fundraising Copilot",
    description="Grant discovery and application assistance for NGOs.",
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ngos.router)
app.include_router(grants.router)
app.include_router(matches.router)
app.include_router(pipeline.router)
app.include_router(applications.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "ok"}
