from datetime import datetime
from pydantic import BaseModel, Field


class NGOCreate(BaseModel):
    name: str
    mission: str
    country: str = "Tunisia"
    sectors: list[str] = []
    beneficiaries: str | None = None
    annual_budget: float | None = None
    funding_needs: str | None = None
    preferred_grant_size_min: float | None = None
    preferred_grant_size_max: float | None = None
    keywords: list[str] = []
    website: str | None = None


class NGOUpdate(NGOCreate):
    pass


class NGOOut(NGOCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
