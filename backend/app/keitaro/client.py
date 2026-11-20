"""Thin synchronous client for the Keitaro Admin API v1.

Endpoints and payloads are described in `.workspace/keitaro-spec/endpoints.md`.
Methods return Keitaro JSON as is; mapping to our schemas lives in `app.services`.
"""

from typing import Any

import httpx

# Cloudflare in front of the tracker bans default library user agents (error 1010)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

Json = dict[str, Any]


class KeitaroError(Exception):
    """Keitaro answered with an error or could not be reached (`status` is None then)."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


class KeitaroClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 20,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._http = httpx.Client(
            base_url=f"{base_url.rstrip('/')}/admin_api/v1",
            headers={
                "Api-Key": api_key,
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
            timeout=timeout,
            transport=transport,
        )

    def close(self) -> None:
        self._http.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            res = self._http.request(method, path, **kwargs)
        except httpx.HTTPError as e:
            raise KeitaroError(f"Keitaro is unreachable: {e}") from e
        if res.status_code >= 400:
            raise KeitaroError(_error_message(res), res.status_code)
        if not res.content:
            return None
        try:
            return res.json()
        except ValueError as e:
            raise KeitaroError("Keitaro returned a non-JSON response", res.status_code) from e

    # Reference data

    def list_domains(self) -> list[Json]:
        return self._request("GET", "/domains")

    def list_groups(self, group_type: str = "campaigns") -> list[Json]:
        return self._request("GET", "/groups", params={"type": group_type})

    def list_traffic_sources(self) -> list[Json]:
        return self._request("GET", "/traffic_sources")

    def list_offers(self) -> list[Json]:
        return self._request("GET", "/offers")

    def get_offer(self, offer_id: int) -> Json:
        return self._request("GET", f"/offers/{offer_id}")

    # Campaigns

    def get_campaign(self, campaign_id: int) -> Json:
        return self._request("GET", f"/campaigns/{campaign_id}")

    def create_campaign(self, payload: Json) -> Json:
        return self._request("POST", "/campaigns", json=payload)

    def update_campaign(self, campaign_id: int, payload: Json) -> Json:
        return self._request("PUT", f"/campaigns/{campaign_id}", json=payload)

    def delete_campaign(self, campaign_id: int) -> None:
        """Moves the campaign to the archive."""
        self._request("DELETE", f"/campaigns/{campaign_id}")

    # Streams (flows)

    def list_streams(self, campaign_id: int) -> list[Json]:
        return self._request("GET", f"/campaigns/{campaign_id}/streams")

    def get_stream(self, stream_id: int) -> Json:
        return self._request("GET", f"/streams/{stream_id}")

    def create_stream(self, payload: Json) -> Json:
        return self._request("POST", "/streams", json=payload)

    def update_stream(self, stream_id: int, payload: Json) -> Json:
        return self._request("PUT", f"/streams/{stream_id}", json=payload)

    # Reports

    def build_report(self, payload: Json) -> Json:
        return self._request("POST", "/report/build", json=payload)


def _error_message(res: httpx.Response) -> str:
    try:
        body = res.json()
    except ValueError:
        return f"Keitaro error {res.status_code}"
    if isinstance(body, dict):
        for key in ("error", "message", "name"):
            if isinstance(body.get(key), str) and body[key]:
                return body[key]
    return f"Keitaro error {res.status_code}"
