from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, JSON
from sqlalchemy.orm import relationship
from models.database import Base


class NGO(Base):
    __tablename__ = "ngos"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    mission = Column(Text, nullable=False)
    country = Column(String(100), default="Tunisia")
    sectors = Column(JSON, default=list)
    beneficiaries = Column(Text, nullable=True)
    annual_budget = Column(Float, nullable=True)
    funding_needs = Column(Text, nullable=True)
    preferred_grant_size_min = Column(Float, nullable=True)
    preferred_grant_size_max = Column(Float, nullable=True)
    keywords = Column(JSON, default=list)
    website = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="ngo")
    pipeline_entries = relationship("PipelineEntry", back_populates="ngo")
    interactions = relationship("NGOInteraction", back_populates="ngo")
    applications = relationship("Application", back_populates="ngo")
