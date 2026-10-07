from datetime import datetime
from pydantic import BaseModel
from schemas.grant import GrantOut


class PipelineEntryCreate(BaseModel):
    ngo_id: int
    grant_id: int
    stage: str = "saved"
    notes: str | None = None


class PipelineEntryUpdate(BaseModel):
    stage: str | None = None
    notes: str | None = None


class PipelineEntryOut(BaseModel):
    id: int
    ngo_id: int
    grant_id: int
    stage: str
    notes: str | None
    match_score: float | None
    match_explanation: str | None
    created_at: datetime
    updated_at: datetime
    grant: GrantOut

    class Config:
        from_attributes = True


class ApplicationDraftRequest(BaseModel):
    ngo_id: int
    grant_id: int
    section: str  # executive_summary|objectives|impact|activities|budget_justification|indicators
