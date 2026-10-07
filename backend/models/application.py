from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from models.database import Base


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    ngo_id = Column(Integer, ForeignKey("ngos.id"), nullable=False, index=True)
    grant_id = Column(Integer, ForeignKey("grants.id"), nullable=False, index=True)
    version = Column(Integer, default=1)
    executive_summary = Column(Text, nullable=True)
    objectives = Column(Text, nullable=True)
    impact = Column(Text, nullable=True)
    activities = Column(Text, nullable=True)
    budget_justification = Column(Text, nullable=True)
    indicators = Column(Text, nullable=True)
    status = Column(String(50), default="draft")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    ngo = relationship("NGO", back_populates="applications")
    grant = relationship("Grant", back_populates="applications")
