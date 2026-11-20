from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession, Keitaro
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignDetail,
    CampaignSummary,
    FormOptions,
    OfferAdd,
    OfferOption,
    Period,
)
from app.services import campaigns

router = APIRouter(tags=["campaigns"])


@router.get("/campaigns/form-options")
def form_options(_user: CurrentUser, client: Keitaro) -> FormOptions:
    """Domains, campaign groups and traffic sources for the creation form."""
    return campaigns.form_options(client)


@router.get("/offers")
def search_offers(
    _user: CurrentUser,
    client: Keitaro,
    q: str = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[OfferOption]:
    """Offer autocomplete: by id prefix or name substring."""
    return campaigns.search_offers(client, q, limit)


@router.get("/campaigns")
def list_campaigns(_user: CurrentUser, db: DbSession) -> list[CampaignSummary]:
    """Campaigns created through the wrapper, newest first."""
    return campaigns.list_campaigns(db)


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(
    data: CampaignCreate, user: CurrentUser, db: DbSession, client: Keitaro
) -> CampaignSummary:
    """Creates a campaign with two flows: geo -> Google, everyone else -> the offer."""
    return campaigns.create_campaign(db, client, user, data)


@router.get("/campaigns/{campaign_id}")
def get_campaign(
    campaign_id: int,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
    period: Period = "all_time",
) -> CampaignDetail:
    """Campaign with its flows, offers and stats (clicks / unique / bots) for the period."""
    return campaigns.get_campaign(db, client, campaign_id, period)


@router.post(
    "/campaigns/{campaign_id}/streams/{stream_id}/offers",
    status_code=status.HTTP_204_NO_CONTENT,
)
def add_offer(
    campaign_id: int,
    stream_id: int,
    data: OfferAdd,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
) -> None:
    """Adds an offer to the flow and splits shares evenly."""
    campaigns.add_offer(db, client, campaign_id, stream_id, data.offer_id)


@router.delete(
    "/campaigns/{campaign_id}/streams/{stream_id}/offers/{offer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_offer(
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
) -> None:
    """Removes an offer from the flow and splits shares evenly among the rest."""
    campaigns.remove_offer(db, client, campaign_id, stream_id, offer_id)
