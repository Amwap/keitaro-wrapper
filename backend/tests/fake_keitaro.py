"""In-memory stand-in for `KeitaroClient`; data shapes follow `.workspace/keitaro-spec/samples`."""

import copy
from typing import Any

from app.keitaro import KeitaroError


class FakeKeitaro:
    def __init__(self) -> None:
        self.domains = [
            {"id": 1813, "name": "kylovoa.com", "is_ssl": True, "state": "active"},
            {"id": 1814, "name": "plain.example", "is_ssl": False, "state": "active"},
            {"id": 1, "name": "old.example", "is_ssl": True, "state": "deleted"},
        ]
        self.groups = [
            {"id": 10332, "name": "FORTESTS", "type": "campaigns"},
            {"id": 10296, "name": "test_malkov_group", "type": "campaigns"},
        ]
        self.sources = [
            {"id": 836, "name": "FORTESTS", "state": "active"},
            {"id": 837, "name": "OLD", "state": "deleted"},
        ]
        self.offers = {
            18813: {
                "id": 18813,
                "name": "18813 Flexacil [JOINT-PE]",
                "state": "active",
                "group": "GAK JO Flexacil PE",
                "country": ["Перу"],
            },
            3749: {
                "id": 3749,
                "name": "[3749] Miaflow [BEAUTY-RO-BE_0009]",
                "state": "active",
                "affiliate_network": "network-7",
            },
            3717: {"id": 3717, "name": "[3717] Miaflow [BEAUTY-RO-BE_0008]", "state": "active"},
            9: {"id": 9, "name": "archived", "state": "deleted"},
        }
        # Offers in groups closed to the API key: missing from the list, 403 by id
        self.hidden_offers = {10184}
        self.campaigns: dict[int, dict[str, Any]] = {}
        self.streams: dict[int, dict[str, Any]] = {}
        self.report_rows: list[dict[str, Any]] = []
        self.calls: list[tuple[str, Any]] = []
        self.fail_on: str | None = None
        self._next_id = 1000

    def _id(self) -> int:
        self._next_id += 1
        return self._next_id

    def _call(self, name: str, payload: Any = None) -> None:
        self.calls.append((name, copy.deepcopy(payload)))
        if self.fail_on == name:
            raise KeitaroError(f"{name} failed", 500)

    def close(self) -> None:
        pass

    def list_domains(self):
        self._call("list_domains")
        return copy.deepcopy(self.domains)

    def list_groups(self, group_type: str = "campaigns"):
        self._call("list_groups", group_type)
        return copy.deepcopy(self.groups)

    def create_group(self, payload):
        self._call("create_group", payload)
        group = {"id": self._id(), "name": payload["name"], "type": payload["type"]}
        self.groups.append(group)
        return copy.deepcopy(group)

    def list_traffic_sources(self):
        self._call("list_traffic_sources")
        return copy.deepcopy(self.sources)

    def list_offers(self):
        self._call("list_offers")
        return copy.deepcopy(list(self.offers.values()))

    def get_offer(self, offer_id: int):
        self._call("get_offer", offer_id)
        if offer_id in self.hidden_offers:
            raise KeitaroError("You have no permission to access this page - Offers", 403)
        if offer_id not in self.offers:
            raise KeitaroError("Not found", 404)
        return copy.deepcopy(self.offers[offer_id])

    def list_campaigns(self):
        """Without archived campaigns: Keitaro lists those at `/campaigns/deleted`."""
        self._call("list_campaigns")
        return copy.deepcopy([c for c in self.campaigns.values() if c.get("state") != "deleted"])

    def get_campaign(self, campaign_id: int):
        self._call("get_campaign", campaign_id)
        if campaign_id not in self.campaigns:
            raise KeitaroError("Not found", 404)
        return copy.deepcopy(self.campaigns[campaign_id])

    def create_campaign(self, payload):
        self._call("create_campaign", payload)
        campaign = {
            **payload,
            "id": self._id(),
            "group_id": int(payload["group_id"]),
            "domain": "https://kylovoa.com/",
        }
        self.campaigns[campaign["id"]] = campaign
        return copy.deepcopy(campaign)

    def update_campaign(self, campaign_id: int, payload):
        self._call("update_campaign", payload)
        campaign = self.campaigns[campaign_id]
        campaign.update(payload)
        if "group_id" in payload:
            campaign["group_id"] = int(payload["group_id"])
        return copy.deepcopy(campaign)

    def delete_campaign(self, campaign_id: int):
        self._call("delete_campaign", campaign_id)
        if campaign_id not in self.campaigns:
            raise KeitaroError("Not found", 404)
        self.campaigns[campaign_id]["state"] = "deleted"

    def list_streams(self, campaign_id: int):
        self._call("list_streams", campaign_id)
        return copy.deepcopy([s for s in self.streams.values() if s["campaign_id"] == campaign_id])

    def get_stream(self, stream_id: int):
        self._call("get_stream", stream_id)
        if stream_id not in self.streams:
            raise KeitaroError("Not found", 404)
        return copy.deepcopy(self.streams[stream_id])

    def create_stream(self, payload):
        self._call("create_stream", payload)
        stream_id = self._id()
        stream = {
            "filters": [],
            "offers": [],
            "landings": [],
            "action_payload": None,
            **payload,
            "id": stream_id,
        }
        stream["offers"] = [
            {**o, "id": self._id(), "stream_id": stream_id} for o in stream["offers"]
        ]
        self.streams[stream_id] = stream
        return copy.deepcopy(stream)

    def update_stream(self, stream_id: int, payload):
        self._call("update_stream", payload)
        stream = self.streams[stream_id]
        if "offers" in payload:
            stream["offers"] = [{**o, "stream_id": stream_id} for o in payload["offers"]]
        for key in ("name", "filters"):
            if key in payload:
                stream[key] = payload[key]
        return copy.deepcopy(stream)

    def build_report(self, payload):
        self._call("build_report", payload)
        return {"rows": copy.deepcopy(self.report_rows), "total": len(self.report_rows)}
