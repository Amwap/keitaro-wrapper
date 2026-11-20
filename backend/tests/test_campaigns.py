from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.api.deps import get_keitaro
from app.db import Campaign, SessionLocal
from app.main import app
from app.services.campaigns import keitaro_share, make_alias, split_shares
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
    [(1, [100]), (2, [50, 50]), (3, [100 / 3] * 3), (6, [100 / 6] * 6), (0, [])],
)
def test_split_shares(count: int, shares: list[float]) -> None:
    assert split_shares(count) == shares
    assert sum(shares) == pytest.approx(100 if count else 0)
    assert split_shares(3, 40) == [40 / 3] * 3
    assert split_shares(2, -10) == [0, 0]


def test_keitaro_share_rounds_down() -> None:
    assert [keitaro_share(s) for s in (100 / 3, 100 / 6, 49.9999999, 60, 0)] == [33, 16, 50, 60, 0]


def test_make_alias() -> None:
    assert make_alias("Test Ilya: Campaign #1").startswith("test-ilya-campaign-1-")
    assert make_alias("Кампания").startswith("c-")
    assert make_alias("x") != make_alias("x")


# Creator


def test_create_campaign(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)

    campaign = keitaro.campaigns[body["id"]]
    assert campaign["name"] == "test_fixture-reader_test_ilya_campaign"
    assert body["name"] == "test_ilya_campaign"
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
    assert [(c["id"], c["name"]) for c in listed] == [(body["id"], "test_ilya_campaign")]
    detail = client.get(f"/api/campaigns/{body['id']}", headers=auth_headers).json()
    assert detail["name"] == "test_ilya_campaign"


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


# Campaign settings


def test_update_campaign(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)
    campaign_id = body["id"]
    geo = next(s for s in keitaro.streams.values() if s["schema"] == "redirect")
    geo["filters"].append({"name": "browser", "mode": "reject", "payload": ["Opera"]})

    res = client.patch(
        f"/api/campaigns/{campaign_id}",
        json={"name": " renamed ", "geo": "ro,de", "domain_id": 1814},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    alias = keitaro.campaigns[campaign_id]["alias"]
    assert res.json()["name"] == "renamed"
    assert res.json()["url"] == f"http://plain.example/{alias}"
    assert alias == body["alias"]

    campaign = keitaro.campaigns[campaign_id]
    assert campaign["name"] == "test_fixture-reader_renamed"
    assert campaign["domain_id"] == 1814
    assert campaign["group_id"] == 10332  # untouched
    assert geo["name"] == "RO,DE -> Google"
    assert geo["filters"] == [
        {"name": "country", "mode": "accept", "payload": ["RO", "DE"]},
        {"name": "browser", "mode": "reject", "payload": ["Opera"]},
    ]

    detail = client.get(f"/api/campaigns/{campaign_id}", headers=auth_headers).json()
    assert detail["name"] == "renamed"
    assert detail["geo"] == ["RO", "DE"]
    assert detail["domain_id"] == 1814
    listed = client.get("/api/campaigns", headers=auth_headers).json()
    assert [(c["name"], c["url"]) for c in listed] == [("renamed", res.json()["url"])]


def test_update_only_sends_given_fields(client, auth_headers, keitaro: FakeKeitaro) -> None:
    body = create(client, auth_headers)
    keitaro.calls.clear()

    res = client.patch(
        f"/api/campaigns/{body['id']}", json={"traffic_source_id": 836}, headers=auth_headers
    )
    assert res.status_code == 200, res.text
    assert ("update_campaign", {"traffic_source_id": 836}) in keitaro.calls
    assert not [c for c in keitaro.calls if c[0] == "update_stream"]
    assert res.json()["url"] == body["url"]


@pytest.mark.parametrize(
    ("data", "detail"),
    [
        ({"domain_id": 1}, "Domain 1 not found"),
        ({"group_id": 5}, "Group 5 not found"),
        ({"traffic_source_id": 837}, "Traffic source 837 not found"),
    ],
)
def test_update_validates_ids(client, auth_headers, keitaro, data, detail) -> None:
    body = create(client, auth_headers)
    res = client.patch(f"/api/campaigns/{body['id']}", json=data, headers=auth_headers)
    assert res.status_code == 422
    assert res.json()["detail"] == detail
    assert not [c for c in keitaro.calls if c[0] == "update_campaign"]


@pytest.mark.parametrize("data", [{"geo": []}, {"geo": "AUS"}, {"name": "  "}])
def test_update_rejects_bad_input(client, auth_headers, keitaro, data) -> None:
    body = create(client, auth_headers)
    res = client.patch(f"/api/campaigns/{body['id']}", json=data, headers=auth_headers)
    assert res.status_code == 422


def test_update_unknown_campaign(client, auth_headers, keitaro) -> None:
    res = client.patch("/api/campaigns/404", json={"name": "x"}, headers=auth_headers)
    assert res.status_code == 404


def test_form_options(client, auth_headers, keitaro) -> None:
    body = client.get("/api/campaigns/form-options", headers=auth_headers).json()
    assert body["domains"] == [
        {"id": 1813, "name": "kylovoa.com", "url": "https://kylovoa.com"},
        {"id": 1814, "name": "plain.example", "url": "http://plain.example"},
    ]
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
    assert ids("3717") == [3717]
    assert ids("перу") == [18813]  # country
    assert ids("gak flexacil") == [18813]  # group, every word has to match
    assert ids("miaflow 0008") == [3717]
    assert ids("network-7") == [3749]
    # Exact id first, even when other offers mention it in the name
    keitaro.offers[5] = {"id": 5, "name": "Offer 3749 clone", "state": "active"}
    assert ids("3749") == [3749, 5]
    # An offer hidden from the API key is found by its exact id only
    assert ids("1018") == []
    res = client.get("/api/offers", params={"q": "10184"}, headers=auth_headers)
    assert [(o["id"], o["name"], o["hidden"]) for o in res.json()] == [(10184, "#10184", True)]
    assert ids("404") == []


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
    assert geo["draft"] is None
    assert offer_flow["stats"] == {"clicks": 15, "unique_clicks": 9, "bots": 2}
    assert {s["offer_id"]: s["stats"]["clicks"] for s in offer_flow["offer_stats"]} == {
        18813: 10,
        77: 5,
    }
    draft = offer_flow["draft"]
    assert [
        (o["offer_id"], o["name"], o["share"], o["sync"], o["offer_deleted"])
        for o in draft["offers"]
    ] == [
        (18813, "18813 Flexacil [JOINT-PE]", 100, "synced", False),
        (77, None, 0, "synced", True),  # not visible to the key: treated as deleted
    ]
    assert draft["dirty"] is False

    report = next(p for name, p in keitaro.calls if name == "build_report")
    assert report["range"]["interval"] == "today"
    assert report["grouping"] == ["stream_id", "offer_id"]
    assert report["filters"] == [
        {"name": "campaign_id", "operator": "EQUALS", "expression": body["id"]}
    ]


class Flow:
    """Draft API of the offers flow of a freshly created campaign."""

    def __init__(self, client: TestClient, headers: dict[str, str], keitaro: FakeKeitaro) -> None:
        self.client, self.headers, self.keitaro = client, headers, keitaro
        self.campaign_id = create(client, headers)["id"]
        self.stream_id = offers_stream(keitaro, self.campaign_id)["id"]
        self.url = f"/api/campaigns/{self.campaign_id}/streams/{self.stream_id}"

    def call(self, method: str, path: str, status: int = 200, **kwargs) -> dict:
        res = self.client.request(method, self.url + path, headers=self.headers, **kwargs)
        assert res.status_code == status, res.text
        return res.json()

    def load(self) -> dict:
        detail = self.client.get(f"/api/campaigns/{self.campaign_id}", headers=self.headers)
        return next(s for s in detail.json()["streams"] if s["id"] == self.stream_id)["draft"]

    def keitaro_shares(self) -> list[tuple[int, int]]:
        offers = self.keitaro.streams[self.stream_id]["offers"]
        return [(o["offer_id"], o["share"]) for o in offers]


def shares(draft: dict) -> list[tuple[int, float]]:
    return [(o["offer_id"], round(o["share"], 2)) for o in draft["offers"]]


def syncs(draft: dict) -> list[tuple[int, str]]:
    return [(o["offer_id"], o["sync"]) for o in draft["offers"] + draft["removed"]]


@pytest.fixture
def flow(client, auth_headers, keitaro: FakeKeitaro) -> Flow:
    return Flow(client, auth_headers, keitaro)


def test_draft_edits_reach_keitaro_only_on_push(flow: Flow) -> None:
    draft = flow.call("POST", "/offers", json={"offer_id": 3749})
    assert shares(draft) == [(18813, 50), (3749, 50)]
    draft = flow.call("POST", "/offers", json={"offer_id": 3717})
    assert shares(draft) == [(18813, 33.33), (3749, 33.33), (3717, 33.33)]
    assert syncs(draft) == [(18813, "changed"), (3749, "new"), (3717, "new")]
    assert draft["dirty"] is True
    assert draft["total_share"] == 100
    flow.call("POST", "/offers", 409, json={"offer_id": 3749})
    assert flow.keitaro_shares() == [(18813, 100)]  # nothing pushed yet

    draft = flow.call("POST", "/push")
    assert flow.keitaro_shares() == [(18813, 33), (3749, 33), (3717, 33)]
    assert draft["dirty"] is False
    assert {s for _, s in syncs(draft)} == {"synced"}
    # The exact shares survive a reload: Keitaro's 33 is what 33.33 rounds down to
    draft = flow.load()
    assert shares(draft) == [(18813, 33.33), (3749, 33.33), (3717, 33.33)]
    assert draft["dirty"] is False
    assert draft["total_share"] == 100

    draft = flow.call("DELETE", "/offers/18813")
    assert shares(draft) == [(3749, 50), (3717, 50)]
    assert [(o["offer_id"], o["state"], o["sync"]) for o in draft["removed"]] == [
        (18813, "removed", "removed")
    ]
    flow.call("DELETE", "/offers/18813", 404)
    assert flow.keitaro_shares() == [(18813, 33), (3749, 33), (3717, 33)]

    flow.call("DELETE", "/offers/3749")
    flow.call("DELETE", "/offers/3717", 409)  # the last one
    draft = flow.call("POST", "/push")
    assert flow.keitaro_shares() == [(3717, 100)]
    # Removed offers are kept to be restored any time later
    assert [(o["offer_id"], o["sync"]) for o in draft["removed"]] == [
        (3749, "synced"),
        (18813, "synced"),
    ]
    assert flow.load()["removed"] == draft["removed"]


def test_restore_removed_offer(flow: Flow) -> None:
    flow.call("POST", "/offers", json={"offer_id": 3749})
    flow.call("POST", "/push")
    flow.call("DELETE", "/offers/3749")
    flow.call("POST", "/push")

    draft = flow.call("POST", "/offers/3749/restore")
    assert shares(draft) == [(18813, 50), (3749, 50)]
    assert draft["removed"] == []
    flow.call("POST", "/offers/3749/restore", 404)

    # Adding a removed offer restores it as well
    flow.call("DELETE", "/offers/3749")
    draft = flow.call("POST", "/offers", json={"offer_id": 3749})
    assert shares(draft) == [(18813, 50), (3749, 50)]
    assert draft["removed"] == []


def test_pinned_and_manual_shares(flow: Flow) -> None:
    flow.call("POST", "/offers", json={"offer_id": 3749})
    flow.call("POST", "/offers", json={"offer_id": 3717})

    # A manual share pins the offer, the others split the rest
    draft = flow.call("PATCH", "/offers/18813", json={"share": 60})
    assert shares(draft) == [(18813, 60), (3749, 20), (3717, 20)]
    assert [o["pinned"] for o in draft["offers"]] == [True, False, False]

    # Pinned shares survive adding and removing offers
    draft = flow.call("DELETE", "/offers/3717")
    assert shares(draft) == [(18813, 60), (3749, 40)]
    draft = flow.call("POST", "/offers/3717/restore")
    assert shares(draft) == [(18813, 60), (3749, 20), (3717, 20)]

    # Pinning freezes the current share
    draft = flow.call("PATCH", "/offers/3749", json={"pinned": True})
    assert shares(draft) == [(18813, 60), (3749, 20), (3717, 20)]
    # A pinned share is locked until unpinned
    res = flow.call("PATCH", "/offers/3749", 409, json={"share": 30})
    assert res["detail"] == "The share is pinned: unpin it to change"
    flow.call("PATCH", "/offers/3749", json={"pinned": False})
    draft = flow.call("PATCH", "/offers/3749", json={"share": 30})
    assert shares(draft) == [(18813, 60), (3749, 30), (3717, 10)]

    # All pinned and not 100%: push is refused until fixed
    draft = flow.call("PATCH", "/offers/3717", json={"share": 50})
    assert draft["total_share"] == 140
    res = flow.call("POST", "/push", 409)
    assert res["detail"] == "Shares sum to 140%, they have to sum to 100%"
    assert flow.keitaro_shares() == [(18813, 100)]

    draft = flow.call("PATCH", "/offers/3717", json={"pinned": False})
    assert shares(draft) == [(18813, 60), (3749, 30), (3717, 10)]
    flow.call("POST", "/push")
    assert flow.keitaro_shares() == [(18813, 60), (3749, 30), (3717, 10)]

    flow.call("PATCH", "/offers/3717", 422, json={"share": 101})
    flow.call("PATCH", "/offers/3717", 422, json={})


def test_reset_drops_changes_not_pushed(flow: Flow) -> None:
    flow.call("POST", "/offers", json={"offer_id": 3749})
    flow.call("POST", "/push")
    flow.call("POST", "/offers", json={"offer_id": 3717})
    flow.call("DELETE", "/offers/18813")
    flow.call("PATCH", "/offers/3749", json={"share": 70})

    draft = flow.call("POST", "/reset")
    assert shares(draft) == [(18813, 50), (3749, 50)]
    assert draft["removed"] == []  # 3717 was never pushed, so it is dropped
    assert draft["dirty"] is False
    assert flow.keitaro_shares() == [(18813, 50), (3749, 50)]

    # Keitaro's 33/33/33 comes back as the exact even split, so it can be pushed again
    flow.call("PATCH", "/offers/3749", json={"pinned": False})
    flow.call("POST", "/offers", json={"offer_id": 3717})
    flow.call("POST", "/push")
    flow.call("PATCH", "/offers/3717", json={"share": 50})
    flow.call("DELETE", "/offers/18813")
    draft = flow.call("POST", "/reset")
    assert shares(draft) == [(18813, 33.33), (3749, 33.33), (3717, 33.33)]
    assert draft["total_share"] == 100
    assert draft["dirty"] is False


def test_changes_made_in_keitaro(flow: Flow) -> None:
    flow.call("POST", "/offers", json={"offer_id": 3749})
    flow.call("POST", "/push")
    offers = flow.keitaro.streams[flow.stream_id]["offers"]

    # Offer deleted from the flow and the shares changed right in Keitaro
    offers[:] = [{"offer_id": 3749, "share": 100, "state": "active"}]
    draft = flow.load()
    assert shares(draft) == [(3749, 100)]
    assert [(o["offer_id"], o["state"]) for o in draft["removed"]] == [(18813, "deleted")]
    assert draft["dirty"] is False

    # An offer added in Keitaro shows up; the offer itself archived is flagged
    offers.append({"offer_id": 3717, "share": 0, "state": "active"})
    flow.keitaro.offers[3717]["state"] = "deleted"
    draft = flow.load()
    assert [(o["offer_id"], o["offer_deleted"]) for o in draft["offers"]] == [
        (3749, False),
        (3717, True),
    ]
    flow.call("POST", "/offers/18813/restore")  # still a live offer, can be brought back
    flow.call("DELETE", "/offers/3717")
    flow.call("POST", "/offers/3717/restore", 409)
    flow.call("POST", "/offers", 422, json={"offer_id": 3717})

    # Edits not pushed survive a reload
    draft = flow.call("PATCH", "/offers/3749", json={"share": 70})
    assert shares(flow.load()) == shares(draft) == [(18813, 30), (3749, 70)]


def test_even_split_made_in_keitaro(flow: Flow) -> None:
    """Keitaro keeps whole percents: its 33/33/33 is read back as the exact even split."""
    flow.keitaro.streams[flow.stream_id]["offers"] = [
        {"offer_id": i, "share": 33, "state": "active"} for i in (18813, 3749, 3717)
    ]
    draft = flow.load()
    assert shares(draft) == [(18813, 33.33), (3749, 33.33), (3717, 33.33)]
    assert draft["total_share"] == 100
    assert draft["dirty"] is False


def test_hidden_offer(flow: Flow) -> None:
    """Offers in groups closed to the API key go into flows by id and stay live after a sync."""
    draft = flow.call("POST", "/offers", json={"offer_id": 10184})
    assert [(o["offer_id"], o["name"], o["offer_deleted"]) for o in draft["offers"]] == [
        (18813, "18813 Flexacil [JOINT-PE]", False),
        (10184, None, False),
    ]
    flow.call("POST", "/push")
    assert flow.keitaro_shares() == [(18813, 50), (10184, 50)]

    draft = flow.load()
    assert [(o["offer_id"], o["sync"], o["offer_deleted"]) for o in draft["offers"]] == [
        (18813, "synced", False),
        (10184, "synced", False),
    ]
    flow.call("DELETE", "/offers/10184")
    flow.call("POST", "/offers/10184/restore")


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
