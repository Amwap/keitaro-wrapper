import json

import httpx
import pytest

from app.keitaro import KeitaroClient, KeitaroError


def make_client(handler) -> KeitaroClient:
    return KeitaroClient(
        "https://tracker.test", "secret-key", transport=httpx.MockTransport(handler)
    )


def test_request_shape() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": 7})

    client = make_client(handler)
    assert client.update_stream(5, {"offers": []}) == {"id": 7}
    client.list_groups("campaigns")

    put, get = seen
    assert put.method == "PUT"
    assert str(put.url) == "https://tracker.test/admin_api/v1/streams/5"
    assert put.headers["Api-Key"] == "secret-key"
    assert "Mozilla" in put.headers["User-Agent"]
    assert json.loads(put.content) == {"offers": []}
    assert str(get.url) == "https://tracker.test/admin_api/v1/groups?type=campaigns"


def test_error_message_and_status() -> None:
    client = make_client(lambda _r: httpx.Response(401, json={"error": "Invalid API key"}))
    with pytest.raises(KeitaroError) as exc:
        client.list_domains()
    assert exc.value.status == 401
    assert exc.value.message == "Invalid API key"


def test_non_json_error() -> None:
    client = make_client(lambda _r: httpx.Response(403, text="<html>cloudflare</html>"))
    with pytest.raises(KeitaroError) as exc:
        client.list_domains()
    assert exc.value.status == 403
    assert exc.value.message == "Keitaro error 403"


def test_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(KeitaroError) as exc:
        make_client(handler).list_domains()
    assert exc.value.status is None


def test_empty_body() -> None:
    client = make_client(lambda _r: httpx.Response(204))
    assert client.delete_campaign(1) is None
