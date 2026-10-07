from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from models.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="member")
    is_active = Column(Boolean, default=True)
    ngo_id = Column(Integer, ForeignKey("ngos.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ngo = relationship("NGO", back_populates="users")
