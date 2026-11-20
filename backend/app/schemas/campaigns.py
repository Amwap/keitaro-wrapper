import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

COUNTRY_CODE = re.compile(r"^[A-Z]{2}$")

# Keitaro report intervals (`range.interval` of /report/build)
Period = Literal[
    "today",
    "yesterday",
    "7_days_ago",
    "first_day_of_this_week",
    "1_month_ago",
    "first_day_of_this_month",
    "1_year_ago",
    "first_day_of_this_year",
    "all_time",
]


class Option(BaseModel):
    id: int
    name: str


class DomainOption(Option):
    url: str


class OfferOption(Option):
    group: str | None = None
    countries: list[str] = []


class FormDefaults(BaseModel):
    domain_id: int | None
    group_id: int | None
    traffic_source_id: int | None


class FormOptions(BaseModel):
    domains: list[DomainOption]
    groups: list[Option]
    traffic_sources: list[Option]
    defaults: FormDefaults


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    geo: list[str] = Field(
        min_length=1, description="ISO 3166-1 alpha-2 codes; a string `MX,AU` is accepted too"
    )
    offer_id: int = Field(gt=0)
    domain_id: int | None = Field(default=None, gt=0, description="Defaults to the server setting")
    group_id: int | None = Field(default=None, gt=0, description="Defaults to the server setting")
    traffic_source_id: int | None = Field(
        default=None, gt=0, description="Defaults to the server setting"
    )

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be empty")
        return value

    @field_validator("geo", mode="before")
    @classmethod
    def _split_geo(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.split(",")
        if isinstance(value, list):
            codes = [str(v).strip().upper() for v in value]
            return list(dict.fromkeys(c for c in codes if c))  # dedupe, keep order
        return value

    @field_validator("geo")
    @classmethod
    def _check_geo(cls, value: list[str]) -> list[str]:
        bad = [c for c in value if not COUNTRY_CODE.match(c)]
        if bad:
            raise ValueError(f"invalid country codes: {', '.join(bad)}")
        return value


class OfferAdd(BaseModel):
    offer_id: int = Field(gt=0)


class Stats(BaseModel):
    """The columns Keitaro shows next to flows: clicks / unique / bots."""

    clicks: int = 0
    unique_clicks: int = 0
    bots: int = 0


class StreamOffer(BaseModel):
    offer_id: int
    name: str | None = Field(description="None when the offer is not visible to the API key")
    share: int
    state: str
    stats: Stats


class Stream(BaseModel):
    id: int
    name: str
    type: str
    schema_: str = Field(alias="schema", serialization_alias="schema")
    position: int
    state: str
    action_type: str | None
    redirect_url: str | None = Field(description="Target URL of a `redirect` flow")
    countries: list[str] = Field(description="Codes of the `country` accept filter")
    offers: list[StreamOffer]
    stats: Stats

    model_config = {"populate_by_name": True}


class CampaignSummary(BaseModel):
    id: int = Field(description="Campaign id in Keitaro")
    name: str
    alias: str
    url: str
    created_at: datetime


class CampaignDetail(BaseModel):
    id: int
    name: str
    alias: str
    url: str
    state: str
    group_id: int | None
    traffic_source_id: int | None
    period: Period
    stats: Stats
    streams: list[Stream]
