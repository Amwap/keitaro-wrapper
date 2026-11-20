from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession, Keitaro
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignDetail,
    CampaignSummary,
    CampaignUpdate,
    FormOptions,
    OfferAdd,
    OfferOption,
    OfferUpdate,
    Period,
    StreamDraft,
)
from app.services import campaigns

router = APIRouter(tags=["campaigns"])


@router.get("/campaigns/form-options")
def form_options(user: CurrentUser, client: Keitaro) -> FormOptions:
    """Domains, campaign groups open to the user and traffic sources for the creation form."""
    return campaigns.form_options(client, user)


@router.get("/offers")
def search_offers(
    _user: CurrentUser,
    client: Keitaro,
    q: str = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[OfferOption]:
    """Offer autocomplete: every word is a part of the id, name, group, country or network."""
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


@router.patch("/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: int, data: CampaignUpdate, user: CurrentUser, db: DbSession, client: Keitaro
) -> CampaignSummary:
    """Changes the name, geo, domain, group or traffic source; the alias stays the same."""
    return campaigns.update_campaign(db, client, user, campaign_id, data)


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: int, _user: CurrentUser, db: DbSession, client: Keitaro) -> None:
    """Moves the campaign to the Keitaro archive and removes it from the wrapper."""
    campaigns.delete_campaign(db, client, campaign_id)


FLOW = "/campaigns/{campaign_id}/streams/{stream_id}"


@router.post(f"{FLOW}/offers")
def add_offer(
    campaign_id: int,
    stream_id: int,
    data: OfferAdd,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
) -> StreamDraft:
    """Adds an offer to the draft (or restores a removed one); free shares are split evenly."""
    return campaigns.add_offer(db, client, campaign_id, stream_id, data.offer_id)


@router.patch(f"{FLOW}/offers/{{offer_id}}")
def update_offer(
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    data: OfferUpdate,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
) -> StreamDraft:
    """Sets a manual share (pins the offer) or pins / unpins it; free shares are recalculated."""
    return campaigns.update_offer(
        db, client, campaign_id, stream_id, offer_id, share=data.share, pinned=data.pinned
    )


@router.delete(f"{FLOW}/offers/{{offer_id}}")
def remove_offer(
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
) -> StreamDraft:
    """Moves an offer to the removed list of the draft; free shares are split evenly."""
    return campaigns.remove_offer(db, client, campaign_id, stream_id, offer_id)


@router.post(f"{FLOW}/offers/{{offer_id}}/restore")
def restore_offer(
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    _user: CurrentUser,
    db: DbSession,
    client: Keitaro,
) -> StreamDraft:
    """Brings a removed offer back to the draft."""
    return campaigns.restore_offer(db, client, campaign_id, stream_id, offer_id)


@router.post(f"{FLOW}/push")
def push_offers(
    campaign_id: int, stream_id: int, _user: CurrentUser, db: DbSession, client: Keitaro
) -> StreamDraft:
    """Writes the draft offers and shares to the Keitaro flow."""
    return campaigns.push_offers(db, client, campaign_id, stream_id)


@router.post(f"{FLOW}/reset")
def reset_offers(
    campaign_id: int, stream_id: int, _user: CurrentUser, db: DbSession, client: Keitaro
) -> StreamDraft:
    """Drops the changes not pushed yet: the draft goes back to the Keitaro flow."""
    return campaigns.reset_offers(db, client, campaign_id, stream_id)
