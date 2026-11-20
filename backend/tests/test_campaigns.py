from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.api.deps import get_keitaro
from app.db import Campaign, SessionLocal
from app.main import app
from app.services.campaigns import make_alias, split_shares
from tests.fake_keitaro import FakeKeitaro

NEW_CAMPAIGN = {"name": "test_ilya_campaign", "geo": "au, MX ,au", "offer_id": 18813}


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def keitaro() -> Iterator[FakeKeitaro]:
    fake = FakeKeitaro()
    app.dependency_overrides[get_keitaro] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_keitaro, None)
    with SessionLocal() as db:
        db.execute(delete(Campaign))
        db.commit()


def create(client: TestClient, headers: dict[str, str], **overrides) -> dict:
    res = client.post("/api/campaigns", json={**NEW_CAMPAIGN, **overrides}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def offers_stream(keitaro: FakeKeitaro, campaign_id: int) -> dict:
    return next(
        s
        for s in keitaro.streams.values()
        if s["campaign_id"] == campaign_id and s["schema"] == "landings"
    )


# Pure helpers


@pytest.mark.parametrize(
    ("count", "shares"),
    [(1, [100]), (2, [50, 50]), (3, [34, 33, 33]), (6, [17, 17, 17, 17, 16, 16]), (0, [])],
)
def test_split_shares(count: int, shares: list[int]) -> None:
    assert split_shares(count) == shares
    assert sum(shares) == (100 if count else 0)


def test_make_alias() -> None:
    assert make_alias("Test Ilya: Campaign #1").startswith("test-ilya-campaign-1-")
    assert make_alias("Кампания").startswith("c-")
    assert make_alias("x") != make_alias("x")


# Creator


def test_create_campaign(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)

    campaign = keitaro.campaigns[body["id"]]
    assert campaign["name"] == "test_ilya_campaign"
    assert campaign["domain_id"] == 1813
    assert campaign["group_id"] == 10332
    assert campaign["traffic_source_id"] == 836
    assert campaign["type"] == "position"
    assert body["url"] == f"https://kylovoa.com/{campaign['alias']}"

    geo, offers = sorted(
        (s for s in keitaro.streams.values() if s["campaign_id"] == body["id"]),
        key=lambda s: s["position"],
    )
    assert geo["schema"] == "redirect"
    assert geo["action_payload"] == "https://google.com"
    assert geo["filters"] == [{"name": "country", "mode": "accept", "payload": ["AU", "MX"]}]
    assert offers["schema"] == "landings"
    assert offers["filters"] == []
    assert [(o["offer_id"], o["share"]) for o in offers["offers"]] == [(18813, 100)]

    listed = client.get("/api/campaigns", headers=auth_headers).json()
    assert [c["id"] for c in listed] == [body["id"]]


def test_create_with_explicit_ids_validates_them(client, auth_headers, keitaro) -> None:
    res = client.post("/api/campaigns", json={**NEW_CAMPAIGN, "domain_id": 1}, headers=auth_headers)
    assert res.status_code == 422
    assert res.json()["detail"] == "Domain 1 not found"
    assert not keitaro.campaigns


@pytest.mark.parametrize("geo", ["", "AUS", ["A1"], []])
def test_create_rejects_bad_geo(client, auth_headers, keitaro, geo) -> None:
    res = client.post("/api/campaigns", json={**NEW_CAMPAIGN, "geo": geo}, headers=auth_headers)
    assert res.status_code == 422


def test_create_unknown_offer(client, auth_headers, keitaro) -> None:
    res = client.post(
        "/api/campaigns", json={**NEW_CAMPAIGN, "offer_id": 404}, headers=auth_headers
    )
    assert res.status_code == 422
    assert res.json()["detail"] == "Offer 404 not found"
    assert not keitaro.campaigns


def test_create_rolls_back_when_flow_fails(client, auth_headers, keitaro: FakeKeitaro) -> None:
    keitaro.fail_on = "create_stream"
    res = client.post("/api/campaigns", json=NEW_CAMPAIGN, headers=auth_headers)

    assert res.status_code == 502
    assert res.json()["detail"] == "Keitaro: create_stream failed"
    (campaign,) = keitaro.campaigns.values()
    assert campaign["state"] == "deleted"
    assert client.get("/api/campaigns", headers=auth_headers).json() == []


def test_form_options(client, auth_headers, keitaro) -> None:
    body = client.get("/api/campaigns/form-options", headers=auth_headers).json()
    assert body["domains"] == [{"id": 1813, "name": "kylovoa.com", "url": "https://kylovoa.com"}]
    assert body["groups"] == [{"id": 10332, "name": "FORTESTS"}]
    assert body["traffic_sources"] == [{"id": 836, "name": "FORTESTS"}]
    assert body["defaults"] == {"domain_id": 1813, "group_id": 10332, "traffic_source_id": 836}


def test_search_offers(client, auth_headers, keitaro) -> None:
    def ids(q: str) -> list[int]:
        res = client.get("/api/offers", params={"q": q}, headers=auth_headers)
        return [o["id"] for o in res.json()]

    assert ids("") == [18813, 3749, 3717]  # archived offer is hidden
    assert ids("miaflow") == [3749, 3717]
    assert ids("374") == [3749]


# Editor


def test_campaign_detail_with_stats(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)
    geo_id = next(s["id"] for s in keitaro.streams.values() if s["schema"] == "redirect")
    offers = offers_stream(keitaro, body["id"])
    offers["offers"].append({"offer_id": 77, "share": 0, "state": "active"})  # not visible to us
    keitaro.report_rows = [
        {"stream_id": geo_id, "offer_id": None, "clicks": 3, "stream_unique_clicks": 2, "bots": 1},
        {
            "stream_id": offers["id"],
            "offer_id": 18813,
            "clicks": 10,
            "stream_unique_clicks": 4,
            "bots": 0,
        },
        {
            "stream_id": offers["id"],
            "offer_id": 77,
            "clicks": 5,
            "stream_unique_clicks": 5,
            "bots": 2,
        },
    ]

    res = client.get(f"/api/campaigns/{body['id']}?period=today", headers=auth_headers)
    assert res.status_code == 200, res.text
    detail = res.json()

    assert detail["period"] == "today"
    assert detail["stats"] == {"clicks": 18, "unique_clicks": 11, "bots": 3}
    geo, offer_flow = detail["streams"]
    assert geo["schema"] == "redirect"
    assert geo["countries"] == ["AU", "MX"]
    assert geo["redirect_url"] == "https://google.com"
    assert geo["stats"] == {"clicks": 3, "unique_clicks": 2, "bots": 1}
    assert offer_flow["stats"] == {"clicks": 15, "unique_clicks": 9, "bots": 2}
    assert [(o["offer_id"], o["name"], o["stats"]["clicks"]) for o in offer_flow["offers"]] == [
        (18813, "18813 Flexacil [JOINT-PE]", 10),
        (77, None, 5),
    ]

    report = next(p for name, p in keitaro.calls if name == "build_report")
    assert report["range"]["interval"] == "today"
    assert report["grouping"] == ["stream_id", "offer_id"]
    assert report["filters"] == [
        {"name": "campaign_id", "operator": "EQUALS", "expression": body["id"]}
    ]


def test_add_and_remove_offers(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)
    stream = offers_stream(keitaro, body["id"])
    url = f"/api/campaigns/{body['id']}/streams/{stream['id']}/offers"

    def shares() -> list[tuple[int, int]]:
        return [(o["offer_id"], o["share"]) for o in keitaro.streams[stream["id"]]["offers"]]

    assert client.post(url, json={"offer_id": 3749}, headers=auth_headers).status_code == 204
    assert shares() == [(18813, 50), (3749, 50)]
    assert client.post(url, json={"offer_id": 3717}, headers=auth_headers).status_code == 204
    assert shares() == [(18813, 34), (3749, 33), (3717, 33)]

    res = client.post(url, json={"offer_id": 3749}, headers=auth_headers)
    assert res.status_code == 409

    assert client.delete(f"{url}/18813", headers=auth_headers).status_code == 204
    assert shares() == [(3749, 50), (3717, 50)]
    assert client.delete(f"{url}/18813", headers=auth_headers).status_code == 404
    assert client.delete(f"{url}/3749", headers=auth_headers).status_code == 204
    assert shares() == [(3717, 100)]

    res = client.delete(f"{url}/3717", headers=auth_headers)
    assert res.status_code == 409
    assert shares() == [(3717, 100)]


def test_add_unknown_offer(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)
    stream = offers_stream(keitaro, body["id"])
    res = client.post(
        f"/api/campaigns/{body['id']}/streams/{stream['id']}/offers",
        json={"offer_id": 404},
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_editor_rejects_foreign_campaigns_and_flows(client, auth_headers, keitaro) -> None:
    body = create(client, auth_headers)
    geo_id = next(s["id"] for s in keitaro.streams.values() if s["schema"] == "redirect")
    foreign = keitaro.create_campaign({"name": "someone else", "alias": "x", "group_id": "1"})

    assert client.get(f"/api/campaigns/{foreign['id']}", headers=auth_headers).status_code == 404
    res = client.post(
        f"/api/campaigns/{body['id']}/streams/{geo_id}/offers",
        json={"offer_id": 3749},
        headers=auth_headers,
    )
    assert res.status_code == 409  # redirect flow has no offers
    res = client.post(
        f"/api/campaigns/{body['id']}/streams/999999/offers",
        json={"offer_id": 3749},
        headers=auth_headers,
    )
    assert res.status_code == 404


# Access


def test_requires_auth(client) -> None:
    assert client.get("/api/campaigns").status_code == 401


def test_keitaro_not_configured(client, auth_headers) -> None:
    res = client.get("/api/offers", headers=auth_headers)
    assert res.status_code == 503
