from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import TokenError, decode_token
from app.db import User, get_db
from app.keitaro import KeitaroClient, KeitaroPanelClient

DbSession = Annotated[Session, Depends(get_db)]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{get_settings().api_prefix}/auth/login")


def get_current_user(db: DbSession, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token, "access")
    except TokenError:
        raise credentials_error from None
    user = db.get(User, payload.user_id)
    if user is None or not user.is_active or user.token_version != payload.version:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_keitaro() -> Iterator[KeitaroClient]:
    settings = get_settings()
    api_key = settings.keitaro_api_key.get_secret_value()
    if not settings.keitaro_url or not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Keitaro is not configured: set KEITARO_URL and KEITARO_API_KEY",
        )
    client = KeitaroClient(settings.keitaro_url, api_key, settings.keitaro_timeout_seconds)
    try:
        yield client
    finally:
        client.close()


Keitaro = Annotated[KeitaroClient, Depends(get_keitaro)]


def get_keitaro_panel() -> Iterator[KeitaroPanelClient]:
    settings = get_settings()
    password = settings.keitaro_password.get_secret_value()
    if not settings.keitaro_admin_url or not settings.keitaro_login or not password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Keitaro admin panel is not configured: set KEITARO_ADMIN_URL, KEITARO_LOGIN "
            "and KEITARO_PASSWORD",
        )
    client = KeitaroPanelClient(
        settings.keitaro_admin_url, settings.keitaro_login, password, settings.keitaro_timeout_seconds
    )
    try:
        yield client
    finally:
        client.close()


KeitaroPanel = Annotated[KeitaroPanelClient, Depends(get_keitaro_panel)]
