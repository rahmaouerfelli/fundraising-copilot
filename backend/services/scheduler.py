"""
APScheduler background jobs: grant ingestion and deadline reminders.
"""

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from config import settings

logger = logging.getLogger(__name__)
_scheduler = BackgroundScheduler()


def _ingestion_job() -> None:
    from services.ingestion_service import start_background_ingestion
    if not start_background_ingestion():
        logger.info("Skipping scheduled ingestion — a cycle is already running.")


def _reminder_job() -> None:
    """Check for upcoming grant deadlines and log reminders (extend to email/WhatsApp here)."""
    from datetime import datetime, timedelta
    from models.database import SessionLocal
    from models.pipeline import PipelineEntry
    from models.grant import Grant
    from services.ingestion_service import close_expired_grants
    db = SessionLocal()
    try:
        close_expired_grants(db)
        soon = datetime.utcnow() + timedelta(days=7)
        entries = (
            db.query(PipelineEntry)
            .join(Grant)
            .filter(
                PipelineEntry.stage.in_(["saved", "preparing"]),
                Grant.deadline <= soon,
                Grant.deadline >= datetime.utcnow(),
                PipelineEntry.deadline_reminder_sent == False,
            )
            .all()
        )
        for entry in entries:
            logger.info(
                "REMINDER: NGO %d — grant '%s' deadline %s",
                entry.ngo_id,
                entry.grant.title[:60],
                entry.grant.deadline.strftime("%Y-%m-%d"),
            )
            entry.deadline_reminder_sent = True
        db.commit()
    except Exception as exc:
        logger.error("Reminder job failed: %s", exc)
    finally:
        db.close()


def start_scheduler() -> None:
    _scheduler.add_job(
        _ingestion_job,
        "interval",
        hours=settings.ingestion_interval_hours,
        id="ingestion",
        replace_existing=True,
    )
    _scheduler.add_job(
        _reminder_job,
        "interval",
        hours=settings.reminder_check_interval_hours,
        id="reminders",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started — ingestion every %dh, reminders every %dh.",
        settings.ingestion_interval_hours,
        settings.reminder_check_interval_hours,
    )


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
