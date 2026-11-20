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
    """Keitaro answered with an error or could not be reached (`status` is None then).

    `fields` holds validation errors by Keitaro field name (`{"name": "..."}`).
    """

    def __init__(
        self, message: str, status: int | None = None, fields: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.fields = fields or {}


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
            message, fields = _error_details(res)
            raise KeitaroError(message, res.status_code, fields)
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

    def create_group(self, payload: Json) -> Json:
        return self._request("POST", "/groups", json=payload)


    def list_traffic_sources(self) -> list[Json]:
        return self._request("GET", "/traffic_sources")

    def list_offers(self) -> list[Json]:
        return self._request("GET", "/offers")

    def get_offer(self, offer_id: int) -> Json:
        return self._request("GET", f"/offers/{offer_id}")

    # Campaigns

    def list_campaigns(self) -> list[Json]:
        return self._request("GET", "/campaigns")

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


def _error_details(res: httpx.Response) -> tuple[str, dict[str, str]]:
    """Message and field errors. Keitaro answers `{"error": "..."}` or, on validation
    (406/422), `{"name": ["..."], ...}`: messages by field."""
    fallback = f"Keitaro error {res.status_code}"
    try:
        body = res.json()
    except ValueError:
        return fallback, {}
    if not isinstance(body, dict):
        return fallback, {}
    for key in ("error", "message"):
        if isinstance(body.get(key), str) and body[key]:
            return body[key], {}
    fields: dict[str, str] = {}
    for key, value in body.items():
        messages = [value] if isinstance(value, str) else value
        if isinstance(messages, list) and messages and all(isinstance(m, str) for m in messages):
            fields[key] = "; ".join(messages)
    if not fields:
        return fallback, {}
    return "; ".join(f"{k}: {v}" for k, v in fields.items()), fields


class KeitaroPanelClient:
    """Internal API of the Keitaro admin panel (`/{admin path}/?object=...`), signed in with the
    panel login and password. Covers what Admin API v1 lacks: deleting groups."""

    def __init__(
        self,
        admin_url: str,
        login: str,
        password: str,
        timeout: float = 20,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._login, self._password = login, password
        self._signed_in = False
        self._http = httpx.Client(
            base_url=admin_url.rstrip("/"),
            headers={"Accept": "application/json", "User-Agent": USER_AGENT},
            timeout=timeout,
            transport=transport,
        )

    def close(self) -> None:
        self._http.close()

    def _call(self, method: str, payload: Json) -> Any:
        try:
            res = self._http.post("/", params={"object": method}, json=payload)
        except httpx.HTTPError as e:
            raise KeitaroError(f"Keitaro admin panel is unreachable: {e}") from e
        if res.status_code >= 400:
            message, fields = _error_details(res)
            raise KeitaroError(message, res.status_code, fields)
        try:
            return res.json() if res.content else None
        except ValueError as e:
            raise KeitaroError("Keitaro admin panel returned a non-JSON response", res.status_code) from e

    def _sign_in(self) -> None:
        if self._signed_in:
            return
        body = self._call("auth.login", {"login": self._login, "password": self._password})
        if not (isinstance(body, dict) and body.get("success")):
            message = body.get("message") if isinstance(body, dict) else None
            raise KeitaroError(f"Keitaro admin panel sign-in failed: {message or body}")
        self._signed_in = True

    def delete_group(self, group_id: int) -> None:
        self._sign_in()
        self._call("groups.delete", {"id": group_id})
