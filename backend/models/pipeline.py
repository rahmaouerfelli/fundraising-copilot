from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from models.database import Base

PIPELINE_STAGES = ["discovered", "saved", "preparing", "submitted", "won", "lost"]


class PipelineEntry(Base):
    __tablename__ = "pipeline_entries"

    id = Column(Integer, primary_key=True, index=True)
    ngo_id = Column(Integer, ForeignKey("ngos.id"), nullable=False, index=True)
    grant_id = Column(Integer, ForeignKey("grants.id"), nullable=False, index=True)
    stage = Column(String(50), default="discovered")
    notes = Column(Text, nullable=True)
    match_score = Column(Float, nullable=True)
    match_explanation = Column(Text, nullable=True)
    deadline_reminder_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    ngo = relationship("NGO", back_populates="pipeline_entries")
    grant = relationship("Grant", back_populates="pipeline_entries")


class NGOInteraction(Base):
    __tablename__ = "ngo_interactions"

    id = Column(Integer, primary_key=True, index=True)
    ngo_id = Column(Integer, ForeignKey("ngos.id"), nullable=False, index=True)
    grant_id = Column(Integer, ForeignKey("grants.id"), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    ngo = relationship("NGO", back_populates="interactions")
    grant = relationship("Grant", back_populates="interactions")


class MatchScore(Base):
    """Cached LLM match score of a grant for an NGO (recomputed when the NGO profile changes)."""
    __tablename__ = "match_scores"
    __table_args__ = (UniqueConstraint("ngo_id", "grant_id", name="uq_match_ngo_grant"),)

    id = Column(Integer, primary_key=True, index=True)
    ngo_id = Column(Integer, ForeignKey("ngos.id"), nullable=False, index=True)
    grant_id = Column(Integer, ForeignKey("grants.id"), nullable=False, index=True)
    score = Column(Float, nullable=False)
    explanation = Column(Text, nullable=True)
    readiness_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
