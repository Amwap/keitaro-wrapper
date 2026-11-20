"""In-memory stand-in for `KeitaroClient`; data shapes follow `.workspace/keitaro-spec/samples`."""

import copy
from typing import Any

from app.keitaro import KeitaroError


class FakeKeitaro:
    def __init__(self) -> None:
        self.domains = [
            {"id": 1813, "name": "kylovoa.com", "is_ssl": True, "state": "active"},
            {"id": 1, "name": "old.example", "is_ssl": True, "state": "deleted"},
        ]
        self.groups = [{"id": 10332, "name": "FORTESTS", "type": "campaigns"}]
        self.sources = [{"id": 836, "name": "FORTESTS", "state": "active"}]
        self.offers = {
            18813: {
                "id": 18813,
                "name": "18813 Flexacil [JOINT-PE]",
                "state": "active",
                "group": "GAK JO Flexacil PE",
                "country": ["Перу"],
            },
            3749: {"id": 3749, "name": "[3749] Miaflow [BEAUTY-RO-BE_0009]", "state": "active"},
            3717: {"id": 3717, "name": "[3717] Miaflow [BEAUTY-RO-BE_0008]", "state": "active"},
            9: {"id": 9, "name": "archived", "state": "deleted"},
        }
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

    def list_traffic_sources(self):
        self._call("list_traffic_sources")
        return copy.deepcopy(self.sources)

    def list_offers(self):
        self._call("list_offers")
        return copy.deepcopy(list(self.offers.values()))

    def get_offer(self, offer_id: int):
        self._call("get_offer", offer_id)
        if offer_id not in self.offers:
            raise KeitaroError("Not found", 404)
        return copy.deepcopy(self.offers[offer_id])

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

    def delete_campaign(self, campaign_id: int):
        self._call("delete_campaign", campaign_id)
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
        return copy.deepcopy(stream)

    def build_report(self, payload):
        self._call("build_report", payload)
        return {"rows": copy.deepcopy(self.report_rows), "total": len(self.report_rows)}
