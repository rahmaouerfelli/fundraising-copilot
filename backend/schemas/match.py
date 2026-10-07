from pydantic import BaseModel
from schemas.grant import GrantOut


class MatchResult(BaseModel):
    grant: GrantOut
    match_score: float
    explanation: str
    readiness_score: float | None = None


class MatchRequest(BaseModel):
    ngo_id: int
    limit: int = 10
