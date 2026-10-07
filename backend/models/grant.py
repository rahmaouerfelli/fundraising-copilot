from datetime import date, datetime
from sqlalchemy import or_, Column, Integer, String, Text, Float, DateTime, JSON, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from models.database import Base


class GrantSource(Base):
    __tablename__ = "grant_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    url = Column(String(1000), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    failure_count = Column(Integer, default=0, nullable=False)
    # Hash of the last extracted page text: an unchanged page is not sent to the LLM again.
    content_hash = Column(String(64), nullable=True)
    last_crawled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    grants = relationship("Grant", back_populates="source")


class Grant(Base):
    __tablename__ = "grants"
    __table_args__ = (UniqueConstraint("source_url", name="uq_grant_source_url"),)

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    funder_name = Column(String(255), nullable=False)
    funder_url = Column(String(1000), nullable=True)
    amount_min = Column(Float, nullable=True)
    amount_max = Column(Float, nullable=True)
    currency = Column(String(10), default="USD")
    deadline = Column(DateTime, nullable=True)
    eligibility_criteria = Column(Text, nullable=True)
    sectors = Column(JSON, default=list)
    countries = Column(JSON, default=list)
    languages = Column(JSON, default=list)
    source_url = Column(String(1000), nullable=False)
    source_id = Column(Integer, ForeignKey("grant_sources.id"), nullable=True)
    qdrant_id = Column(String(100), nullable=True)
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source = relationship("GrantSource", back_populates="grants")
    pipeline_entries = relationship("PipelineEntry", back_populates="grant")
    interactions = relationship("NGOInteraction", back_populates="grant")
    applications = relationship("Application", back_populates="grant")


def open_grant_filter():
    """SQL condition for grants an NGO can still apply to (active, deadline not passed)."""
    today = datetime.combine(date.today(), datetime.min.time())
    return (Grant.status == "active") & or_(Grant.deadline.is_(None), Grant.deadline >= today)
