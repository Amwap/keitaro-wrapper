"""Campaign creator and offer editor on top of the Keitaro Admin API.

Flow layout and payloads: `.workspace/keitaro-spec/flows.md`.
"""

import logging
import re
import secrets
from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Campaign, User
from app.keitaro import KeitaroClient, KeitaroError
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignDetail,
    CampaignSummary,
    DomainOption,
    FormDefaults,
    FormOptions,
    OfferOption,
    Option,
    Period,
    Stats,
    Stream,
    StreamOffer,
)

log = logging.getLogger(__name__)

OFFERS_SCHEMA = "landings"
REDIRECT_SCHEMA = "redirect"


class ServiceError(Exception):
    """Business error that maps to an HTTP status in the API layer."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def split_shares(count: int) -> list[int]:
    """Even integer split of 100% that always sums to 100: 3 -> [34, 33, 33]."""
    if count <= 0:
        return []
    base, rest = divmod(100, count)
    return [base + 1 if i < rest else base for i in range(count)]


def make_alias(name: str) -> str:
    """URL alias: slug of the name plus a random suffix (aliases are unique per tracker)."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-")
    suffix = secrets.token_hex(3)
    return f"{slug}-{suffix}" if slug else f"c-{suffix}"


# Reference data


def form_options(client: KeitaroClient) -> FormOptions:
    settings = get_settings()
    return FormOptions(
        domains=[_domain_option(d) for d in client.list_domains() if _is_active(d)],
        groups=[Option(id=g["id"], name=g["name"]) for g in client.list_groups("campaigns")],
        traffic_sources=[
            Option(id=s["id"], name=s["name"])
            for s in client.list_traffic_sources()
            if _is_active(s)
        ],
        defaults=FormDefaults(
            domain_id=settings.keitaro_default_domain_id,
            group_id=settings.keitaro_default_group_id,
            traffic_source_id=settings.keitaro_default_traffic_source_id,
        ),
    )


def search_offers(client: KeitaroClient, query: str = "", limit: int = 20) -> list[OfferOption]:
    """Autocomplete: matches the id prefix or a case-insensitive substring of the name."""
    query = query.strip().lower()
    result = []
    for offer in client.list_offers():
        if not _is_active(offer):
            continue
        if query and not (
            str(offer["id"]).startswith(query) or query in str(offer.get("name", "")).lower()
        ):
            continue
        result.append(_offer_option(offer))
        if len(result) >= limit:
            break
    return result


# Creator


def create_campaign(
    db: Session, client: KeitaroClient, user: User, data: CampaignCreate
) -> CampaignSummary:
    settings = get_settings()
    domain_id = data.domain_id or settings.keitaro_default_domain_id
    group_id = data.group_id or settings.keitaro_default_group_id
    source_id = data.traffic_source_id or settings.keitaro_default_traffic_source_id
    if domain_id is None or group_id is None or source_id is None:
        raise ServiceError("domain_id, group_id and traffic_source_id are required", 422)

    domains = [d for d in client.list_domains() if _is_active(d)]
    sources = [s for s in client.list_traffic_sources() if _is_active(s)]
    domain = _find(domains, domain_id, "Domain")
    _find(client.list_groups("campaigns"), group_id, "Group")
    _find(sources, source_id, "Traffic source")
    _get_offer(client, data.offer_id)

    campaign = client.create_campaign(
        {
            "name": data.name,
            "alias": make_alias(data.name),
            "type": "position",
            "state": "active",
            "domain_id": domain_id,
            "group_id": str(group_id),  # string in the Admin API request schema
            "traffic_source_id": source_id,
            "cost_type": "CPC",
            "cost_value": 0,
        }
    )
    try:
        client.create_stream(
            {
                "campaign_id": campaign["id"],
                "name": f"{','.join(data.geo)} -> Google",
                "type": "regular",
                "position": 1,
                "state": "active",
                "schema": REDIRECT_SCHEMA,
                "action_type": "http",
                "action_payload": settings.keitaro_geo_redirect_url,
                "filters": [{"name": "country", "mode": "accept", "payload": data.geo}],
            }
        )
        client.create_stream(
            {
                "campaign_id": campaign["id"],
                "name": "Offers",
                "type": "regular",
                "position": 2,
                "state": "active",
                "schema": OFFERS_SCHEMA,
                "action_type": "http",
                "offers": [{"offer_id": data.offer_id, "share": 100, "state": "active"}],
            }
        )
    except KeitaroError:
        _rollback(client, campaign["id"])
        raise

    row = Campaign(
        keitaro_id=campaign["id"],
        name=campaign.get("name", data.name),
        alias=campaign["alias"],
        url=_campaign_url(campaign, domain),
        created_by_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)  # created_at is filled by the database
    return _summary(row)


def list_campaigns(db: Session) -> list[CampaignSummary]:
    rows = db.scalars(select(Campaign).order_by(Campaign.created_at.desc(), Campaign.id.desc()))
    return [_summary(r) for r in rows]


# Editor


def get_campaign(
    db: Session, client: KeitaroClient, campaign_id: int, period: Period = "all_time"
) -> CampaignDetail:
    row = _tracked(db, campaign_id)
    campaign = client.get_campaign(campaign_id)
    streams = client.list_streams(campaign_id)
    stats = _campaign_stats(client, campaign_id, period)
    offer_names = {o["id"]: o.get("name") for o in client.list_offers()}

    total = Stats()
    result = []
    for stream in sorted(streams, key=lambda s: s.get("position") or 0):
        stream_stats = stats["streams"].get(stream["id"], Stats())
        _add(total, stream_stats)
        result.append(_stream(stream, stream_stats, stats["offers"], offer_names))

    return CampaignDetail(
        id=campaign["id"],
        name=campaign.get("name", row.name),
        alias=campaign.get("alias", row.alias),
        url=row.url,
        state=campaign.get("state", "active"),
        group_id=campaign.get("group_id"),
        traffic_source_id=campaign.get("traffic_source_id"),
        period=period,
        stats=total,
        streams=result,
    )


def add_offer(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> None:
    stream = _offers_stream(db, client, campaign_id, stream_id)
    offers = _offer_entries(stream)
    if any(o["offer_id"] == offer_id for o in offers):
        raise ServiceError("Offer is already in the flow", 409)
    _get_offer(client, offer_id)
    offers.append({"offer_id": offer_id, "state": "active"})
    _save_offers(client, stream_id, offers)


def remove_offer(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> None:
    stream = _offers_stream(db, client, campaign_id, stream_id)
    offers = _offer_entries(stream)
    remaining = [o for o in offers if o["offer_id"] != offer_id]
    if len(remaining) == len(offers):
        raise ServiceError("Offer is not in the flow", 404)
    if not remaining:
        raise ServiceError("Can't remove the last offer of the flow", 409)
    _save_offers(client, stream_id, remaining)


# Helpers


def _tracked(db: Session, campaign_id: int) -> Campaign:
    row = db.scalar(select(Campaign).where(Campaign.keitaro_id == campaign_id))
    if row is None:
        raise ServiceError("Campaign not found", 404)
    return row


def _offers_stream(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int
) -> dict[str, Any]:
    _tracked(db, campaign_id)
    try:
        stream = client.get_stream(stream_id)
    except KeitaroError as e:
        if e.status == 404:
            raise ServiceError("Flow not found", 404) from e
        raise
    if stream.get("campaign_id") != campaign_id:
        raise ServiceError("Flow not found", 404)
    if stream.get("schema") != OFFERS_SCHEMA:
        raise ServiceError("The flow doesn't send traffic to offers", 409)
    return stream


def _offer_entries(stream: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"offer_id": o["offer_id"], "state": o.get("state") or "active"}
        for o in stream.get("offers") or []
    ]


def _save_offers(client: KeitaroClient, stream_id: int, offers: list[dict[str, Any]]) -> None:
    """Rebalances shares evenly and replaces the offer list of the flow."""
    for offer, share in zip(offers, split_shares(len(offers)), strict=True):
        offer["share"] = share
    client.update_stream(stream_id, {"offers": offers})


def _campaign_stats(client: KeitaroClient, campaign_id: int, period: Period) -> dict[str, dict]:
    report = client.build_report(
        {
            "range": {"interval": period, "timezone": get_settings().keitaro_timezone},
            "grouping": ["stream_id", "offer_id"],
            "metrics": ["clicks", "stream_unique_clicks", "bots"],
            "filters": [{"name": "campaign_id", "operator": "EQUALS", "expression": campaign_id}],
        }
    )
    streams: dict[int, Stats] = defaultdict(Stats)
    offers: dict[tuple[int, int], Stats] = defaultdict(Stats)
    for row in report.get("rows") or []:
        stats = Stats(
            clicks=int(row.get("clicks") or 0),
            unique_clicks=int(row.get("stream_unique_clicks") or 0),
            bots=int(row.get("bots") or 0),
        )
        stream_id = _to_int(row.get("stream_id"))
        offer_id = _to_int(row.get("offer_id"))
        if stream_id is None:
            continue
        _add(streams[stream_id], stats)
        if offer_id:
            _add(offers[(stream_id, offer_id)], stats)
    return {"streams": streams, "offers": offers}


def _stream(
    stream: dict[str, Any],
    stats: Stats,
    offer_stats: dict[tuple[int, int], Stats],
    offer_names: dict[int, str | None],
) -> Stream:
    countries = [
        code
        for f in stream.get("filters") or []
        if f.get("name") == "country" and f.get("mode") == "accept"
        for code in (f.get("payload") or [])
    ]
    payload = stream.get("action_payload")
    return Stream(
        id=stream["id"],
        name=stream.get("name") or "",
        type=stream.get("type") or "",
        schema=stream.get("schema") or "",
        position=stream.get("position") or 0,
        state=stream.get("state") or "",
        action_type=stream.get("action_type"),
        redirect_url=payload if stream.get("schema") == REDIRECT_SCHEMA and payload else None,
        countries=countries,
        offers=[
            StreamOffer(
                offer_id=o["offer_id"],
                name=offer_names.get(o["offer_id"]),
                share=o.get("share") or 0,
                state=o.get("state") or "",
                stats=offer_stats.get((stream["id"], o["offer_id"]), Stats()),
            )
            for o in stream.get("offers") or []
        ],
        stats=stats,
    )


def _get_offer(client: KeitaroClient, offer_id: int) -> dict[str, Any]:
    try:
        return client.get_offer(offer_id)
    except KeitaroError as e:
        if e.status == 404:
            raise ServiceError(f"Offer {offer_id} not found", 422) from e
        raise


def _find(items: list[dict[str, Any]], item_id: int, label: str) -> dict[str, Any]:
    for item in items:
        if item.get("id") == item_id:
            return item
    raise ServiceError(f"{label} {item_id} not found", 422)


def _rollback(client: KeitaroClient, campaign_id: int) -> None:
    try:
        client.delete_campaign(campaign_id)
    except KeitaroError:
        log.exception("Failed to archive half-created campaign %s", campaign_id)


def _campaign_url(campaign: dict[str, Any], domain: dict[str, Any]) -> str:
    base = campaign.get("domain") or _domain_url(domain)
    return f"{base.rstrip('/')}/{campaign['alias']}"


def _domain_url(domain: dict[str, Any]) -> str:
    scheme = "https" if domain.get("is_ssl", True) else "http"
    return f"{scheme}://{domain['name']}"


def _domain_option(domain: dict[str, Any]) -> DomainOption:
    return DomainOption(id=domain["id"], name=domain["name"], url=_domain_url(domain))


def _offer_option(offer: dict[str, Any]) -> OfferOption:
    return OfferOption(
        id=offer["id"],
        name=offer.get("name") or f"#{offer['id']}",
        group=offer.get("group"),
        countries=offer.get("country") or [],
    )


def _summary(row: Campaign) -> CampaignSummary:
    return CampaignSummary(
        id=row.keitaro_id, name=row.name, alias=row.alias, url=row.url, created_at=row.created_at
    )


def _is_active(item: dict[str, Any]) -> bool:
    return item.get("state", "active") == "active"


def _add(target: Stats, other: Stats) -> None:
    target.clicks += other.clicks
    target.unique_clicks += other.unique_clicks
    target.bots += other.bots


def _to_int(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "") else None
    except TypeError, ValueError:
        return None
