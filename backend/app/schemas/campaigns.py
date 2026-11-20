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
    network: str | None = Field(default=None, description="Affiliate network")
    hidden: bool = Field(
        default=False, description="In a group closed to the API key: only the id is known"
    )


class FormDefaults(BaseModel):
    domain_id: int | None
    group_id: int | None
    traffic_source_id: int | None


class FormOptions(BaseModel):
    domains: list[DomainOption]
    groups: list[Option]
    traffic_sources: list[Option]
    defaults: FormDefaults


class _CampaignFields(BaseModel):
    """Validators shared by the creation and the edit forms."""

    @field_validator("name", check_fields=False)
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("name must not be empty")
        return value

    @field_validator("geo", mode="before", check_fields=False)
    @classmethod
    def _split_geo(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.split(",")
        if isinstance(value, list):
            codes = [str(v).strip().upper() for v in value]
            return list(dict.fromkeys(c for c in codes if c))  # dedupe, keep order
        return value

    @field_validator("geo", check_fields=False)
    @classmethod
    def _check_geo(cls, value: list[str] | None) -> list[str] | None:
        bad = [c for c in value or [] if not COUNTRY_CODE.match(c)]
        if bad:
            raise ValueError(f"invalid country codes: {', '.join(bad)}")
        return value


class CampaignCreate(_CampaignFields):
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


class CampaignUpdate(_CampaignFields):
    """The fields of the creation form except the offer; a missing field is left as is."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    geo: list[str] | None = Field(
        default=None, min_length=1, description="Countries of the flow that goes to Google"
    )
    domain_id: int | None = Field(default=None, gt=0)
    group_id: int | None = Field(default=None, gt=0)
    traffic_source_id: int | None = Field(default=None, gt=0)


class OfferAdd(BaseModel):
    offer_id: int = Field(gt=0)


class Stats(BaseModel):
    """The columns Keitaro shows next to flows: clicks / unique / bots."""

    clicks: int = 0
    unique_clicks: int = 0
    bots: int = 0


class OfferUpdate(BaseModel):
    """Either a manual share (which pins the offer) or a pin toggle."""

    share: float | None = Field(default=None, ge=0, le=100)
    pinned: bool | None = None


class DraftOffer(BaseModel):
    offer_id: int
    name: str | None = Field(description="None when the offer is not visible to the API key")
    share: float = Field(
        description="Exact share in the wrapper; Keitaro gets it rounded down on push"
    )
    keitaro_share: int | None = Field(description="Share in Keitaro, None if not in the flow there")
    pinned: bool = Field(description="Kept as is when the other shares are recalculated")
    state: Literal["active", "removed", "deleted"] = Field(
        description="`removed` by the user, `deleted` from the flow in Keitaro directly"
    )
    sync: Literal["synced", "new", "changed", "removed"] = Field(
        description="`synced` or what a push will do: add, change the share, remove"
    )
    offer_deleted: bool = Field(description="The offer itself is deleted or archived in Keitaro")
    removed_at: datetime | None = Field(description="When it left the flow (UTC)")


class StreamDraft(BaseModel):
    """Offers of a flow as edited in the wrapper."""

    stream_id: int
    offers: list[DraftOffer] = Field(description="Active offers in flow order")
    removed: list[DraftOffer] = Field(description="Removed offers that can be restored")
    dirty: bool = Field(description="There are changes not pushed to Keitaro")
    total_share: float = Field(description="Sum of active shares; a push needs 100")


class OfferStats(BaseModel):
    offer_id: int
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
    draft: StreamDraft | None = Field(description="Editable offers; only for offers flows")
    offer_stats: list[OfferStats]
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
    domain_id: int | None
    group_id: int | None
    traffic_source_id: int | None
    geo: list[str] = Field(description="Countries of the flow that goes to Google")
    period: Period
    stats: Stats
    streams: list[Stream]
