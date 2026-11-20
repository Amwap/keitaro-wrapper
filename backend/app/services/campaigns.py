"""Campaign creator and offer editor on top of the Keitaro Admin API.

Flow layout and payloads: `.workspace/keitaro-spec/flows.md`.
"""

import logging
import math
import re
import secrets
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Campaign, FlowOffer, User
from app.keitaro import KeitaroClient, KeitaroError
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignDetail,
    CampaignSummary,
    CampaignUpdate,
    DomainOption,
    DraftOffer,
    FormDefaults,
    FormOptions,
    OfferOption,
    OfferStats,
    Option,
    Period,
    Stats,
    Stream,
    StreamDraft,
)

log = logging.getLogger(__name__)

OFFERS_SCHEMA = "landings"
REDIRECT_SCHEMA = "redirect"

# FlowOffer.state
ACTIVE = "active"
REMOVED = "removed"
DELETED = "deleted"

# Shares are exact floats in the wrapper: 3 offers get 100/3 each
SHARE_TOLERANCE = 0.01

# Flag of an offer that exists in Keitaro but sits in a group closed to the API key (403)
HIDDEN = "hidden"


class ServiceError(Exception):
    """Business error that maps to an HTTP status in the API layer."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def split_shares(count: int, total: float = 100) -> list[float]:
    """Exactly even split: 3 -> [33.33.., 33.33.., 33.33..]."""
    if count <= 0:
        return []
    return [max(total, 0) / count] * count


def keitaro_share(share: float) -> int:
    """Keitaro takes whole percents: the share rounded down, as the editor shows it.

    Offers are picked by weight, so 33/33/33 still splits the traffic evenly.
    """
    return math.floor(share + 1e-6)  # 1e-6: float noise like 49.9999999 is still 50


def rebalance(rows: list[FlowOffer]) -> None:
    """Pinned offers keep their shares, the rest split what is left of 100% evenly."""
    active = [r for r in rows if r.state == ACTIVE]
    free = [r for r in active if not r.pinned]
    left = 100 - sum(r.share for r in active if r.pinned)
    for row, share in zip(free, split_shares(len(free), left), strict=True):
        row.share = share


def restore_even_split(rows: list[FlowOffer]) -> None:
    """Shares taken from Keitaro are whole: 33/33/33 there is an even split rounded down.
    When the offers (or the unpinned ones) all have what the even split rounds down to,
    the split becomes exact again.
    """
    active = [r for r in rows if r.state == ACTIVE]
    if abs(sum(r.share for r in active) - 100) <= SHARE_TOLERANCE:
        return
    for group in (active, [r for r in active if not r.pinned]):
        if not group:
            continue
        rest = 100 - sum(r.share for r in active if r not in group)
        even = split_shares(len(group), rest)
        pairs = list(zip(group, even, strict=True))
        if all(keitaro_share(r.share) == keitaro_share(share) for r, share in pairs):
            for row, share in pairs:
                row.share = share
            return


def sync_status(row: FlowOffer) -> str:
    """What a push will do with the offer: nothing, add it, change its share or remove it."""
    if row.state == ACTIVE:
        if row.keitaro_share is None:
            return "new"
        return "synced" if keitaro_share(row.share) == row.keitaro_share else "changed"
    return "removed" if row.keitaro_share is not None else "synced"


def make_alias(name: str) -> str:
    """URL alias: slug of the name plus a random suffix (aliases are unique per tracker)."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-")
    suffix = secrets.token_hex(3)
    return f"{slug}-{suffix}" if slug else f"c-{suffix}"


def name_prefix(user: User) -> str:
    """Keitaro names are prefixed with the creator: `test_admin_` for user `admin`."""
    return f"test_{user.username}_"


def display_name(name: str, user: User | None) -> str:
    """Name as shown in the wrapper: the Keitaro name without the creator's prefix."""
    return name.removeprefix(name_prefix(user)) if user else name


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
    """Search over the whole offer base: every word of the query has to match the id, name,
    group, country or affiliate network. Exact id matches go first, then id prefixes.

    A bare id missing from the list is looked up directly: offers in groups closed to the API key
    can still be put into flows, they come back as `hidden`.
    """
    words = query.strip().lower().split()
    found: list[tuple[int, dict[str, Any]]] = []
    for offer in client.list_offers():
        if not _is_active(offer):
            continue
        offer_id = str(offer["id"])
        text = " ".join(
            [
                offer_id,
                str(offer.get("name") or ""),
                str(offer.get("group") or ""),
                " ".join(offer.get("country") or []),
                str(offer.get("affiliate_network") or ""),
            ]
        ).lower()
        if all(w in text for w in words):
            rank = (
                0 if offer_id in words else 1 if any(offer_id.startswith(w) for w in words) else 2
            )
            found.append((rank, offer))
    found.sort(key=lambda item: item[0])  # stable: Keitaro order within a rank
    if len(words) == 1 and words[0].isdigit() and not (found and found[0][0] == 0):
        offer = _lookup_offer(client, int(words[0]))
        if offer is not None and offer.get(HIDDEN):
            found.insert(0, (0, offer))
    return [_offer_option(o) for _, o in found[:limit]]


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
            "name": name_prefix(user) + data.name,
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
        name=display_name(campaign.get("name", data.name), user),
        alias=campaign["alias"],
        url=_campaign_url(campaign, domain),
        created_by_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)  # created_at is filled by the database
    return _summary(row)


def update_campaign(
    db: Session, client: KeitaroClient, campaign_id: int, data: CampaignUpdate
) -> CampaignSummary:
    """Changes what the creation form set, except the offer (the offers flow has its editor).

    The alias stays, so the campaign keeps its path; a new domain changes the URL.
    """
    row = _tracked(db, campaign_id)
    creator = _creator(db, row)
    payload: dict[str, Any] = {}
    domain = None
    if data.name is not None:
        payload["name"] = (name_prefix(creator) if creator else "") + data.name
    if data.domain_id is not None:
        domains = [d for d in client.list_domains() if _is_active(d)]
        domain = _find(domains, data.domain_id, "Domain")
        payload["domain_id"] = data.domain_id
    if data.group_id is not None:
        _find(client.list_groups("campaigns"), data.group_id, "Group")
        payload["group_id"] = str(data.group_id)  # string in the Admin API request schema
    if data.traffic_source_id is not None:
        sources = [s for s in client.list_traffic_sources() if _is_active(s)]
        _find(sources, data.traffic_source_id, "Traffic source")
        payload["traffic_source_id"] = data.traffic_source_id
    geo_stream = None
    if data.geo is not None:
        geo_stream = _geo_stream(client.list_streams(campaign_id))
        if geo_stream is None:
            raise ServiceError("The campaign has no geo flow", 409)

    if payload:
        campaign = client.update_campaign(campaign_id, payload)
        if "name" in payload:
            row.name = display_name(campaign.get("name") or payload["name"], creator)
        if domain is not None:
            row.url = f"{_domain_url(domain)}/{row.alias}"
        db.commit()
    if geo_stream is not None and data.geo is not None:
        client.update_stream(geo_stream["id"], _geo_payload(geo_stream, data.geo))
    return _summary(row)


def list_campaigns(db: Session) -> list[CampaignSummary]:
    rows = db.scalars(select(Campaign).order_by(Campaign.created_at.desc(), Campaign.id.desc()))
    return [_summary(r) for r in rows]


# Editor


def get_campaign(
    db: Session, client: KeitaroClient, campaign_id: int, period: Period = "all_time"
) -> CampaignDetail:
    """Also syncs the offer drafts with Keitaro: offers added or deleted there show up here."""
    row = _tracked(db, campaign_id)
    campaign = client.get_campaign(campaign_id)
    streams = client.list_streams(campaign_id)
    stats = _campaign_stats(client, campaign_id, period)
    catalog = _catalog(client)

    geo_stream = _geo_stream(streams)
    total = Stats()
    result = []
    for stream in sorted(streams, key=lambda s: s.get("position") or 0):
        stream_stats = stats["streams"].get(stream["id"], Stats())
        _add(total, stream_stats)
        draft = None
        if stream.get("schema") == OFFERS_SCHEMA:
            draft = _draft(stream["id"], _reconcile(db, row, stream, catalog))
        result.append(_stream(stream, stream_stats, stats["offers"], draft))
    db.commit()

    return CampaignDetail(
        id=campaign["id"],
        name=display_name(campaign.get("name", row.name), _creator(db, row)),
        alias=campaign.get("alias", row.alias),
        url=row.url,
        state=campaign.get("state", "active"),
        domain_id=campaign.get("domain_id"),
        group_id=campaign.get("group_id"),
        traffic_source_id=campaign.get("traffic_source_id"),
        geo=_countries(geo_stream) if geo_stream else [],
        period=period,
        stats=total,
        streams=result,
    )


# Draft edits stay in the wrapper until `push_offers`


def add_offer(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> StreamDraft:
    """Adds the offer (or restores it if it was removed) and splits the free shares evenly."""
    campaign, rows = _flow_rows(db, client, campaign_id, stream_id)
    row = next((r for r in rows if r.offer_id == offer_id), None)
    if row is not None and row.state == ACTIVE:
        raise ServiceError("Offer is already in the flow", 409)
    offer = _get_offer(client, offer_id)  # hidden offers can be added too, just without a name
    if not _is_active(offer):
        raise ServiceError(f"Offer {offer_id} is deleted in Keitaro", 422)
    if row is None:
        row = FlowOffer(
            campaign_id=campaign.id,
            stream_id=stream_id,
            offer_id=offer_id,
            position=max((r.position for r in rows), default=0) + 1,
            share=0,
            pinned=False,
        )
        db.add(row)
        rows.append(row)
    row.name = offer.get("name") or row.name
    row.offer_deleted = False
    row.state = ACTIVE
    row.removed_at = None
    return _save(db, stream_id, rows)


def remove_offer(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> StreamDraft:
    """Moves the offer to the removed list, where it can be restored from."""
    _, rows = _flow_rows(db, client, campaign_id, stream_id)
    row = _active_row(rows, offer_id)
    if sum(r.state == ACTIVE for r in rows) == 1:
        raise ServiceError("Can't remove the last offer of the flow", 409)
    row.state = REMOVED
    row.removed_at = _now()
    row.pinned = False
    return _save(db, stream_id, rows)


def restore_offer(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> StreamDraft:
    _, rows = _flow_rows(db, client, campaign_id, stream_id)
    row = next((r for r in rows if r.offer_id == offer_id and r.state != ACTIVE), None)
    if row is None:
        raise ServiceError("Offer is not in the removed list", 404)
    if row.offer_deleted:
        raise ServiceError(f"Offer {offer_id} is deleted in Keitaro", 409)
    row.state = ACTIVE
    row.removed_at = None
    return _save(db, stream_id, rows)


def update_offer(
    db: Session,
    client: KeitaroClient,
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    share: float | None = None,
    pinned: bool | None = None,
) -> StreamDraft:
    """A manual share pins the offer; unpinning gives it back to the even split.

    A pinned share is locked: it has to be unpinned before it can be changed.
    """
    _, rows = _flow_rows(db, client, campaign_id, stream_id)
    row = _active_row(rows, offer_id)
    if share is not None:
        if row.pinned:
            raise ServiceError("The share is pinned: unpin it to change", 409)
        row.share = share
        row.pinned = True
        return _save(db, stream_id, rows)
    if pinned is None:
        raise ServiceError("Nothing to update: pass `share` or `pinned`", 422)
    row.pinned = pinned
    # Pinning freezes the current share, there is nothing to recalculate
    return _save(db, stream_id, rows, rebalance_shares=not pinned)


def push_offers(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int
) -> StreamDraft:
    """Replaces the offers of the Keitaro flow with the draft."""
    campaign = _tracked(db, campaign_id)
    stream = _offers_stream(db, client, campaign_id, stream_id)
    rows = _reconcile(db, campaign, stream, _catalog(client))
    db.commit()

    active = [r for r in rows if r.state == ACTIVE]
    total = sum(r.share for r in active)
    if not active:
        raise ServiceError("The flow needs at least one offer", 409)
    if abs(total - 100) > SHARE_TOLERANCE:
        raise ServiceError(f"Shares sum to {total:g}%, they have to sum to 100%", 409)
    states = {o["offer_id"]: o.get("state") or "active" for o in stream.get("offers") or []}
    client.update_stream(
        stream_id,
        {
            "offers": [
                {
                    "offer_id": r.offer_id,
                    "share": keitaro_share(r.share),
                    "state": states.get(r.offer_id, "active"),
                }
                for r in active
            ]
        },
    )
    for row in rows:
        row.keitaro_share = keitaro_share(row.share) if row.state == ACTIVE else None
    return _save(db, stream_id, rows, rebalance_shares=False)


def reset_offers(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int
) -> StreamDraft:
    """Drops the changes not pushed yet: the draft goes back to what Keitaro has.

    Offers added here and never pushed are dropped, removed ones stay in the removed list.
    """
    campaign = _tracked(db, campaign_id)
    stream = _offers_stream(db, client, campaign_id, stream_id)
    kept = []
    for row in _reconcile(db, campaign, stream, _catalog(client)):
        if row.keitaro_share is not None:
            row.state = ACTIVE
            row.removed_at = None
            row.share = row.keitaro_share
        elif row.state == ACTIVE:
            db.delete(row)
            continue
        kept.append(row)
    restore_even_split(kept)
    return _save(db, stream_id, kept, rebalance_shares=False)


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


def _rows(db: Session, stream_id: int) -> list[FlowOffer]:
    query = select(FlowOffer).where(FlowOffer.stream_id == stream_id).order_by(FlowOffer.position)
    return list(db.scalars(query))


def _flow_rows(
    db: Session, client: KeitaroClient, campaign_id: int, stream_id: int
) -> tuple[Campaign, list[FlowOffer]]:
    """Draft of the flow; Keitaro is asked only when the flow has not been synced yet."""
    campaign = _tracked(db, campaign_id)
    rows = _rows(db, stream_id)
    if rows and rows[0].campaign_id == campaign.id:
        return campaign, rows
    stream = _offers_stream(db, client, campaign_id, stream_id)
    return campaign, _reconcile(db, campaign, stream, _catalog(client))


def _reconcile(
    db: Session, campaign: Campaign, stream: dict[str, Any], catalog: _Catalog
) -> list[FlowOffer]:
    """Brings changes made in Keitaro into the draft and keeps the edits not pushed yet.

    Offers new in the Keitaro flow are added, offers gone from it are marked `deleted`,
    offers without local edits take Keitaro's share.
    """
    rows = _rows(db, stream["id"])
    by_offer = {r.offer_id: r for r in rows}
    live = {o["offer_id"]: int(o.get("share") or 0) for o in stream.get("offers") or []}
    position = max((r.position for r in rows), default=0)

    for offer_id, share in live.items():
        row = by_offer.get(offer_id)
        if row is None:
            position += 1
            row = FlowOffer(
                campaign_id=campaign.id,
                stream_id=stream["id"],
                offer_id=offer_id,
                position=position,
                share=share,
                pinned=False,
                state=ACTIVE,
            )
            db.add(row)
            rows.append(row)
        elif row.state != ACTIVE and row.keitaro_share is None:
            # Removed here earlier and added back in Keitaro
            row.state = ACTIVE
            row.removed_at = None
            row.share = share
        elif sync_status(row) == "synced" and row.keitaro_share != share:
            row.share = share  # changed in Keitaro; otherwise the exact share is kept
        row.keitaro_share = share

    for row in rows:
        if row.offer_id not in live and row.keitaro_share is not None:
            if row.state == ACTIVE:
                row.state = DELETED
                row.removed_at = _now()
                row.pinned = False
            row.keitaro_share = None
        offer = catalog.get(row.offer_id)
        row.name = (offer or {}).get("name") or row.name
        row.offer_deleted = offer is None or not _is_active(offer)
    restore_even_split(rows)
    return rows


def _active_row(rows: list[FlowOffer], offer_id: int) -> FlowOffer:
    row = next((r for r in rows if r.offer_id == offer_id and r.state == ACTIVE), None)
    if row is None:
        raise ServiceError("Offer is not in the flow", 404)
    return row


def _save(
    db: Session, stream_id: int, rows: list[FlowOffer], rebalance_shares: bool = True
) -> StreamDraft:
    if rebalance_shares:
        rebalance(rows)
    db.commit()
    return _draft(stream_id, rows)


def _draft(stream_id: int, rows: list[FlowOffer]) -> StreamDraft:
    rows = sorted(rows, key=lambda r: r.position)
    active = [r for r in rows if r.state == ACTIVE]
    removed = sorted(
        (r for r in rows if r.state != ACTIVE), key=lambda r: r.removed_at or _now(), reverse=True
    )
    return StreamDraft(
        stream_id=stream_id,
        offers=[_draft_offer(r) for r in active],
        removed=[_draft_offer(r) for r in removed],
        dirty=any(sync_status(r) != "synced" for r in rows),
        total_share=round(sum(r.share for r in active), 6),
    )


def _draft_offer(row: FlowOffer) -> DraftOffer:
    return DraftOffer(
        offer_id=row.offer_id,
        name=row.name,
        share=row.share,
        keitaro_share=row.keitaro_share,
        pinned=row.pinned,
        state=row.state,
        sync=sync_status(row),
        offer_deleted=row.offer_deleted,
        removed_at=row.removed_at,
    )


class _Catalog:
    """Offers visible to the API key; any other offer is looked up by id on first use."""

    def __init__(self, client: KeitaroClient) -> None:
        self._client = client
        self._offers: dict[int, dict[str, Any] | None] = {o["id"]: o for o in client.list_offers()}

    def get(self, offer_id: int) -> dict[str, Any] | None:
        if offer_id not in self._offers:
            self._offers[offer_id] = _lookup_offer(self._client, offer_id)
        return self._offers[offer_id]


def _catalog(client: KeitaroClient) -> _Catalog:
    return _Catalog(client)


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


def _is_geo_filter(item: dict[str, Any]) -> bool:
    return item.get("name") == "country" and item.get("mode") == "accept"


def _countries(stream: dict[str, Any]) -> list[str]:
    """Codes of the `country` accept filter."""
    return [
        code
        for f in stream.get("filters") or []
        if _is_geo_filter(f)
        for code in (f.get("payload") or [])
    ]


def _geo_stream(streams: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The first redirect flow with a country filter: the one the creator makes for the geo."""
    for stream in sorted(streams, key=lambda s: s.get("position") or 0):
        if stream.get("schema") == REDIRECT_SCHEMA and any(
            _is_geo_filter(f) for f in stream.get("filters") or []
        ):
            return stream
    return None


def _geo_payload(stream: dict[str, Any], geo: list[str]) -> dict[str, Any]:
    """New countries for the geo flow; the other filters are kept, `AU,MX -> Google` renamed."""
    filters = [
        {**f, "payload": geo} if _is_geo_filter(f) else f for f in stream.get("filters") or []
    ]
    payload: dict[str, Any] = {"filters": filters}
    name = stream.get("name") or ""
    old = f"{','.join(_countries(stream))} -> "
    if name.startswith(old):
        payload["name"] = f"{','.join(geo)} -> {name.removeprefix(old)}"
    return payload


def _stream(
    stream: dict[str, Any],
    stats: Stats,
    offer_stats: dict[tuple[int, int], Stats],
    draft: StreamDraft | None,
) -> Stream:
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
        countries=_countries(stream),
        draft=draft,
        offer_stats=[
            OfferStats(offer_id=offer_id, stats=value)
            for (stream_id, offer_id), value in offer_stats.items()
            if stream_id == stream["id"]
        ],
        stats=stats,
    )


def _get_offer(client: KeitaroClient, offer_id: int) -> dict[str, Any]:
    offer = _lookup_offer(client, offer_id)
    if offer is None:
        raise ServiceError(f"Offer {offer_id} not found", 422)
    return offer


def _lookup_offer(client: KeitaroClient, offer_id: int) -> dict[str, Any] | None:
    """Offer by id, None if there is none. Keitaro answers 403 for offers in groups closed to
    the API key: they exist and flows accept them, only the details are unknown."""
    try:
        return client.get_offer(offer_id)
    except KeitaroError as e:
        if e.status == 404:
            return None
        if e.status == 403:
            return {"id": offer_id, "state": "active", HIDDEN: True}
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
        hidden=bool(offer.get(HIDDEN)),
        group=offer.get("group"),
        countries=offer.get("country") or [],
        network=offer.get("affiliate_network") or None,
    )


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)  # naive UTC, like the other timestamps


def _creator(db: Session, row: Campaign) -> User | None:
    return db.get(User, row.created_by_id) if row.created_by_id else None


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
