from datetime import datetime
from pydantic import BaseModel


class GrantSourceCreate(BaseModel):
    name: str
    url: str


class GrantSourceOut(GrantSourceCreate):
    id: int
    is_active: bool
    last_crawled_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class GrantOut(BaseModel):
    id: int
    title: str
    description: str
    funder_name: str
    funder_url: str | None
    amount_min: float | None
    amount_max: float | None
    currency: str
    deadline: datetime | None
    eligibility_criteria: str | None
    sectors: list[str]
    countries: list[str]
    languages: list[str]
    source_url: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class GrantSearchParams(BaseModel):
    query: str = ""
    sectors: list[str] = []
    countries: list[str] = []
    min_amount: float | None = None
    max_amount: float | None = None
    limit: int = 20
    offset: int = 0


class GrantPage(BaseModel):
    items: list[GrantOut]
    total: int              # grants matching the sector filter
    page: int
    page_size: int
    pages: int
    sector_counts: dict[str, int]  # over all open grants, for the filter chips
    total_open: int
